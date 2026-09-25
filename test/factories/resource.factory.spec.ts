import { diag } from "@opentelemetry/api";
import { ArchitectureComponentType } from "../../src/enums/architecture-component-type.enum";
import { AlwaysOnSampler } from "@opentelemetry/sdk-trace-base";
import { ExporterType } from "../../src/enums/exporter-type.enum";
import ResourceFactory from "../../src/factories/resource.factory";

const withPackageVersion = <T>(version: string | undefined, run: () => T): T => {
  const original = process.env.npm_package_version;
  const set = (value: string | undefined) =>
    value === undefined ? delete process.env.npm_package_version : (process.env.npm_package_version = value);

  set(version);

  try {
    return run();
  } finally {
    set(original);
  }
};

describe("ResourceFactory", () => {
  it("maps the service identity onto semantic convention attributes", () => {
    const resource = ResourceFactory.createResource({
      serviceName: "kreela-api",
      serviceVersion: "2.3.4",
      environment: "staging",
    });

    expect(resource.attributes).toMatchObject({
      "service.name": "kreela-api",
      "service.version": "2.3.4",
      "deployment.environment.name": "staging",
    });
  });

  it("omits the attributes that were not configured", () => {
    const keys = withPackageVersion(undefined, () =>
      Object.keys(ResourceFactory.createResource({ serviceName: "kreela-api" }).attributes)
    );

    expect(keys).not.toContain("service.version");
    expect(keys).not.toContain("deployment.environment.name");
  });

  it("identifies the process with one service.instance.id for its whole life", () => {
    const first = ResourceFactory.createResource({ serviceName: "kreela-api" });
    const second = ResourceFactory.createResource({ serviceName: "kreela-api" });

    expect(first.attributes["service.instance.id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.attributes["service.instance.id"]).toBe(first.attributes["service.instance.id"]);
  });

  it("takes service.version from npm_package_version when none is configured", () => {
    const [fromPackage, configured] = withPackageVersion("3.1.4", () => [
      ResourceFactory.createResource({ serviceName: "kreela-api" }),
      ResourceFactory.createResource({ serviceName: "kreela-api", serviceVersion: "9.9.9" }),
    ]);

    expect(fromPackage.attributes["service.version"]).toBe("3.1.4");
    expect(configured.attributes["service.version"]).toBe("9.9.9");
  });

  it("carries the sdk's telemetry.sdk.* attributes", () => {
    expect(ResourceFactory.createResource({ serviceName: "kreela-api" }).attributes).toMatchObject({
      "telemetry.sdk.language": "nodejs",
      "telemetry.sdk.name": "opentelemetry",
    });
  });

  it.each([
    [{ exporter: ExporterType.OTLP }, undefined, 1],
    [{ exporter: ExporterType.OTLP, sampleRatio: 0.01 }, undefined, 0.01],
    [{ exporter: ExporterType.OTLP, sampleRatio: 0.01 }, 0.02, 0.03],
    [{ exporter: ExporterType.OTLP, sampleRatio: 0.9 }, 0.5, 1],
  ])("stamps the probability a root trace is kept, %p with docTraceRatio %p", (traces, docTraceRatio, expected) => {
    const resource = ResourceFactory.createResource({ serviceName: "kreela-api", traces, architecture: { docTraceRatio } });

    expect(resource.attributes["ritele.trace.sample_probability"]).toBeCloseTo(expected, 10);
  });

  it.each([
    ["traces are not configured", {}],
    ["traces are not exported", { traces: { exporter: ExporterType.NONE } }],
    ["a custom sampler decides", { traces: { exporter: ExporterType.OTLP, sampler: new AlwaysOnSampler() } }],
  ])("stamps no sample probability when %s", (_, config) => {
    const resource = ResourceFactory.createResource({ serviceName: "kreela-api", ...config });

    expect(Object.keys(resource.attributes)).not.toContain("ritele.trace.sample_probability");
  });

  it("lets a configured service.instance.id replace the generated one", () => {
    const resource = ResourceFactory.createResource({
      serviceName: "kreela-api",
      resourceAttributes: { "service.instance.id": "wallet-7d9f-abc12" },
    });

    expect(resource.attributes["service.instance.id"]).toBe("wallet-7d9f-abc12");
  });

  it("keeps custom attributes but never lets them override the service name", () => {
    const resource = ResourceFactory.createResource({
      serviceName: "kreela-api",
      resourceAttributes: { team: "platform", "service.name": "spoofed" },
    });

    expect(resource.attributes).toMatchObject({ team: "platform", "service.name": "kreela-api" });
  });
});

describe("ResourceFactory architecture attributes", () => {
  it("emits ritele.* resource attributes from the architecture block", () => {
    const resource = ResourceFactory.createResource({
      serviceName: "wallet",
      architecture: {
        component: {
          type: ArchitectureComponentType.SERVICE,
          layer: "core",
          domain: "payments",
          owner: "team-wallet",
        },
        intendedDependencies: ["postgresql:ledger", "kafka:transfers"],
        concurrency: { http: 200, pgPool: 20, bogus: -1 },
      },
    });
    expect(resource.attributes).toMatchObject({
      "ritele.component.type": "service",
      "ritele.layer": "core",
      "ritele.domain": "payments",
      "ritele.owner": "team-wallet",
      "ritele.intended_dependencies": ["postgresql:ledger", "kafka:transfers"],
      "ritele.concurrency.http": 200,
      "ritele.concurrency.pgPool": 20,
    });
    expect(resource.attributes["ritele.concurrency.bogus"]).toBeUndefined();
  });

  it("emits the cpu limit of one replica in cores", () => {
    const resource = ResourceFactory.createResource({ serviceName: "wallet", architecture: { cpuLimit: 0.5 } });

    expect(resource.attributes["ritele.cpu.limit"]).toBe(0.5);
  });

  it.each([0, -1, NaN, Infinity])("drops a cpu limit of %p with a warning", (cpuLimit) => {
    const warn = jest.spyOn(diag, "warn").mockImplementation(() => undefined);

    const resource = ResourceFactory.createResource({ serviceName: "wallet", architecture: { cpuLimit } });

    expect(resource.attributes["ritele.cpu.limit"]).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("CPU limit"));

    warn.mockRestore();
  });

  it("emits nothing without an architecture block", () => {
    const keys = Object.keys(ResourceFactory.createResource({ serviceName: "x" }).attributes);
    expect(keys.some((k) => k.startsWith("ritele."))).toBe(false);
  });
});

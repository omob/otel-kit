import { diag } from "@opentelemetry/api";
import { ArchitectureComponentType } from "../../src/enums/architecture-component-type.enum";
import ResourceFactory from "../../src/factories/resource.factory";

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
    const resource = ResourceFactory.createResource({ serviceName: "kreela-api" });

    expect(resource.attributes).not.toHaveProperty("service.version");
    expect(resource.attributes).not.toHaveProperty("deployment.environment.name");
  });

  it("identifies the process with one service.instance.id for its whole life", () => {
    const first = ResourceFactory.createResource({ serviceName: "kreela-api" });
    const second = ResourceFactory.createResource({ serviceName: "kreela-api" });

    expect(first.attributes["service.instance.id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.attributes["service.instance.id"]).toBe(first.attributes["service.instance.id"]);
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

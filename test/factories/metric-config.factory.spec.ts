import { ExporterType } from "../../src/enums/exporter-type.enum";
import { OtlpProtocol } from "../../src/enums/otlp-protocol.enum";
import MetricConfigFactory from "../../src/factories/metric-config.factory";

const OTLP_VARIABLES = [
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
  "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
  "OTEL_METRICS_EXPORTER",
];
const shellEnvironment = Object.fromEntries(OTLP_VARIABLES.map((name) => [name, process.env[name]]));

beforeAll(() => OTLP_VARIABLES.forEach((name) => delete process.env[name]));
afterAll(() =>
  Object.entries(shellEnvironment).forEach(([name, value]) => value !== undefined && (process.env[name] = value))
);

describe("MetricConfigFactory", () => {
  it("sends metrics to the traces endpoint when traces go over otlp and no metrics block is given", () => {
    const metrics = MetricConfigFactory.createMetricConfig({
      serviceName: "kreela-api",
      traces: {
        exporter: ExporterType.OTLP,
        otlp: { url: "https://collector.example/v1/traces", headers: { authorization: "Bearer t" }, timeoutMillis: 5_000 },
      },
    });

    expect(metrics).toEqual({
      exporter: ExporterType.OTLP,
      otlp: { url: "https://collector.example/v1/metrics", headers: { authorization: "Bearer t" }, timeoutMillis: 5_000 },
    });
  });

  const withEnvironment = <T>(variables: Record<string, string>, run: () => T): T => {
    const original = Object.fromEntries(Object.keys(variables).map((name) => [name, process.env[name]]));

    Object.assign(process.env, variables);

    try {
      return run();
    } finally {
      for (const [name, value] of Object.entries(original)) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    }
  };

  it("keeps the derived collector and headers under a metrics block that only adds options", () => {
    const metrics = MetricConfigFactory.createMetricConfig({
      serviceName: "kreela-api",
      traces: {
        exporter: ExporterType.OTLP,
        otlp: { url: "https://collector.example/v1/traces", headers: { authorization: "Bearer t" } },
      },
      metrics: { exporter: ExporterType.OTLP, cpuUsage: true, exportIntervalMillis: 60_000 },
    });

    expect(metrics).toEqual({
      exporter: ExporterType.OTLP,
      cpuUsage: true,
      exportIntervalMillis: 60_000,
      otlp: { url: "https://collector.example/v1/metrics", headers: { authorization: "Bearer t" } },
    });
  });

  it("keeps a query string on the derived url", () => {
    const metrics = MetricConfigFactory.createMetricConfig({
      serviceName: "kreela-api",
      traces: { exporter: ExporterType.OTLP, otlp: { url: "https://collector.example/v1/traces?key=abc" } },
    });

    expect(metrics.otlp?.url).toBe("https://collector.example/v1/metrics?key=abc");
  });

  it("follows OTEL_EXPORTER_OTLP_TRACES_ENDPOINT rather than falling back to localhost", () => {
    const metrics = withEnvironment({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://tempo.example/v1/traces" }, () =>
      MetricConfigFactory.createMetricConfig({ serviceName: "kreela-api", traces: { exporter: ExporterType.OTLP } })
    );

    expect(metrics.otlp?.url).toBe("https://tempo.example/v1/metrics");
  });

  it("leaves an OTEL_EXPORTER_OTLP_METRICS_ENDPOINT in charge, without the traces credentials", () => {
    const metrics = withEnvironment({ OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: "https://metrics.example/v1/metrics" }, () =>
      MetricConfigFactory.createMetricConfig({
        serviceName: "kreela-api",
        traces: {
          exporter: ExporterType.OTLP,
          otlp: { url: "https://collector.example/v1/traces", headers: { "x-honeycomb-team": "secret" } },
        },
      })
    );

    expect(metrics).toEqual({ exporter: ExporterType.OTLP, otlp: { protocol: undefined } });
  });

  it("lets OTEL_METRICS_EXPORTER=none switch off an explicit metrics block too", () => {
    const metrics = withEnvironment({ OTEL_METRICS_EXPORTER: "none" }, () =>
      MetricConfigFactory.createMetricConfig({
        serviceName: "kreela-api",
        metrics: { exporter: ExporterType.OTLP, cpuUsage: true, otlp: { url: "https://metrics.example/v1/metrics" } },
      })
    );

    expect(metrics).toEqual({ exporter: ExporterType.NONE });
  });

  it.each(["none", "otlp, none"])("sends no derived metrics when OTEL_METRICS_EXPORTER is %p", (value) => {
    const metrics = withEnvironment({ OTEL_METRICS_EXPORTER: value }, () =>
      MetricConfigFactory.createMetricConfig({ serviceName: "kreela-api", traces: { exporter: ExporterType.OTLP } })
    );

    expect(metrics.exporter).toBe(ExporterType.NONE);
  });

  it("leaves the url to the exporter's own defaults when neither code nor environment set one", () => {
    const metrics = MetricConfigFactory.createMetricConfig({ serviceName: "kreela-api", traces: { exporter: ExporterType.OTLP } });

    expect(metrics.exporter).toBe(ExporterType.OTLP);
    expect(metrics.otlp?.url).toBeUndefined();
  });

  it("keeps a grpc endpoint as it is, since grpc carries no signal path", () => {
    const metrics = MetricConfigFactory.createMetricConfig({
      serviceName: "kreela-api",
      traces: { exporter: ExporterType.OTLP, otlp: { protocol: OtlpProtocol.GRPC, url: "http://collector:4317" } },
    });

    expect(metrics.otlp).toEqual({ protocol: OtlpProtocol.GRPC, url: "http://collector:4317" });
  });

  it("sends no metrics when the traces url has a path it cannot map", () => {
    const metrics = MetricConfigFactory.createMetricConfig({
      serviceName: "kreela-api",
      traces: { exporter: ExporterType.OTLP, otlp: { url: "https://collector.example/ingest/spans" } },
    });

    expect(metrics.exporter).toBe(ExporterType.NONE);
  });

  it.each([
    ["an explicit metrics block", { traces: { exporter: ExporterType.OTLP }, metrics: { exporter: ExporterType.NONE } }, ExporterType.NONE],
    ["traces not on otlp", { traces: { exporter: ExporterType.CONSOLE } }, ExporterType.NONE],
    ["no traces", {}, ExporterType.NONE],
  ])("follows %s", (_, config, exporter) => {
    expect(MetricConfigFactory.createMetricConfig({ serviceName: "kreela-api", ...config }).exporter).toBe(exporter);
  });
});

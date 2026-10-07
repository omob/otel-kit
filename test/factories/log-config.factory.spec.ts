import { ExporterType } from "../../src/enums/exporter-type.enum";
import { OtlpProtocol } from "../../src/enums/otlp-protocol.enum";
import LogConfigFactory from "../../src/factories/log-config.factory";

const VARIABLES = [
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
  "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT",
  "OTEL_LOGS_EXPORTER",
];
const shellEnvironment = Object.fromEntries(VARIABLES.map((name) => [name, process.env[name]]));

const withEnvironment = <T>(variables: Record<string, string>, run: () => T): T => {
  Object.assign(process.env, variables);

  try {
    return run();
  } finally {
    Object.keys(variables).forEach((name) => delete process.env[name]);
  }
};

beforeAll(() => VARIABLES.forEach((name) => delete process.env[name]));
afterAll(() =>
  Object.entries(shellEnvironment).forEach(([name, value]) => value !== undefined && (process.env[name] = value))
);

const tracesToCollector = {
  exporter: ExporterType.OTLP,
  otlp: { url: "https://collector.example/v1/traces", headers: { authorization: "Bearer t" } },
};

describe("LogConfigFactory", () => {
  it("keeps logs off with no logs block and no logs endpoint, even when traces go over OTLP", () => {
    expect(LogConfigFactory.createLogConfig({ serviceName: "kreela-api", traces: tracesToCollector })).toEqual({
      exporter: ExporterType.NONE,
    });
  });

  it("turns logs on from OTEL_EXPORTER_OTLP_LOGS_ENDPOINT alone, without the traces credentials", () => {
    const logs = withEnvironment({ OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: "https://logs.example/v1/logs" }, () =>
      LogConfigFactory.createLogConfig({ serviceName: "kreela-api", traces: tracesToCollector })
    );

    expect(logs).toEqual({ exporter: ExporterType.OTLP, otlp: {} });
  });

  it("sends a logs block with no URL to the traces collector, with its headers", () => {
    const logs = LogConfigFactory.createLogConfig({
      serviceName: "kreela-api",
      traces: tracesToCollector,
      logs: { exporter: ExporterType.OTLP },
    });

    expect(logs).toEqual({
      exporter: ExporterType.OTLP,
      otlp: { url: "https://collector.example/v1/logs", headers: { authorization: "Bearer t" } },
    });
  });

  it("keeps a grpc traces endpoint as it is", () => {
    const logs = LogConfigFactory.createLogConfig({
      serviceName: "kreela-api",
      traces: { exporter: ExporterType.OTLP, otlp: { protocol: OtlpProtocol.GRPC, url: "http://collector:4317" } },
      logs: { exporter: ExporterType.OTLP },
    });

    expect(logs.otlp?.url).toBe("http://collector:4317");
  });

  it("refuses a logs block with no URL and nothing to follow, rather than fall back to localhost", () => {
    const logs = LogConfigFactory.createLogConfig({
      serviceName: "kreela-api",
      traces: { exporter: ExporterType.NONE },
      logs: { exporter: ExporterType.OTLP },
    });

    expect(logs).toEqual({ exporter: ExporterType.NONE });
  });

  it.each(["OTEL_EXPORTER_OTLP_LOGS_ENDPOINT", "OTEL_EXPORTER_OTLP_ENDPOINT"])(
    "leaves a logs block with no URL to %s when it is set",
    (variable) => {
      const logs = withEnvironment({ [variable]: "https://collector.example" }, () =>
        LogConfigFactory.createLogConfig({ serviceName: "kreela-api", logs: { exporter: ExporterType.OTLP } })
      );

      expect(logs.exporter).toBe(ExporterType.OTLP);
      expect(logs.otlp?.url).toBeUndefined();
    }
  );

  it("lets OTEL_LOGS_EXPORTER=none switch off a logs block and the logs endpoint", () => {
    const logs = withEnvironment(
      { OTEL_LOGS_EXPORTER: "none", OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: "https://logs.example/v1/logs" },
      () =>
        LogConfigFactory.createLogConfig({
          serviceName: "kreela-api",
          logs: { exporter: ExporterType.OTLP, otlp: { url: "https://logs.example/v1/logs" } },
        })
    );

    expect(logs).toEqual({ exporter: ExporterType.NONE });
  });

  it("leaves a logs block with its own URL, or a console exporter, as it is", () => {
    const own = { exporter: ExporterType.OTLP, otlp: { url: "https://logs.example/v1/logs" } };

    expect(LogConfigFactory.createLogConfig({ serviceName: "kreela-api", logs: own })).toBe(own);
    expect(LogConfigFactory.createLogConfig({ serviceName: "kreela-api", logs: { exporter: ExporterType.CONSOLE } })).toEqual({
      exporter: ExporterType.CONSOLE,
    });
  });
});

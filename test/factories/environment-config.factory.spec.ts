import { AlwaysOnSampler } from "@opentelemetry/sdk-trace-base";
import { ExporterType } from "../../src/enums/exporter-type.enum";
import EnvironmentConfigFactory from "../../src/factories/environment-config.factory";

const VARIABLES = ["OTEL_TRACES_SAMPLER", "OTEL_TRACES_SAMPLER_ARG", "CPU_LIMIT_MILLICORES"];
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
beforeEach(() => jest.spyOn(console, "warn").mockImplementation(() => undefined));
afterEach(() => jest.restoreAllMocks());

const traced = { serviceName: "kreela-api", traces: { exporter: ExporterType.OTLP } };

describe("EnvironmentConfigFactory sample ratio", () => {
  it.each([
    [{ OTEL_TRACES_SAMPLER_ARG: "0.25" }, 0.25],
    [{ OTEL_TRACES_SAMPLER: "parentbased_traceidratio", OTEL_TRACES_SAMPLER_ARG: "0.1" }, 0.1],
    [{ OTEL_TRACES_SAMPLER: "traceidratio" }, 1],
    [{ OTEL_TRACES_SAMPLER: "always_off" }, 0],
    [{ OTEL_TRACES_SAMPLER: "parentbased_always_on" }, 1],
  ])("reads %p as a ratio of %p", (variables, ratio) => {
    const config = withEnvironment(variables, () => EnvironmentConfigFactory.withEnvironmentDefaults(traced));

    expect(config.traces?.sampleRatio).toBe(ratio);
  });

  it.each(["abc", "1.5", "-0.1", "NaN"])("ignores the out-of-range or unreadable ratio %p, and says so", (argument) => {
    const config = withEnvironment({ OTEL_TRACES_SAMPLER_ARG: argument }, () =>
      EnvironmentConfigFactory.withEnvironmentDefaults(traced)
    );

    expect(config.traces?.sampleRatio).toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("OTEL_TRACES_SAMPLER_ARG"));
  });

  it("ignores a sampler it cannot express, and says so", () => {
    const config = withEnvironment({ OTEL_TRACES_SAMPLER: "jaeger_remote" }, () =>
      EnvironmentConfigFactory.withEnvironmentDefaults(traced)
    );

    expect(config.traces?.sampleRatio).toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("jaeger_remote"));
  });

  it.each([
    ["a ratio set in code", { ...traced, traces: { ...traced.traces, sampleRatio: 0.5 } }, 0.5],
    ["a custom sampler", { ...traced, traces: { ...traced.traces, sampler: new AlwaysOnSampler() } }, undefined],
  ])("leaves %p alone", (_, config, ratio) => {
    const resolved = withEnvironment({ OTEL_TRACES_SAMPLER_ARG: "0.01" }, () =>
      EnvironmentConfigFactory.withEnvironmentDefaults(config)
    );

    expect(resolved.traces?.sampleRatio).toBe(ratio);
  });

  it("treats a blank variable as unset", () => {
    const config = withEnvironment({ OTEL_TRACES_SAMPLER_ARG: "  " }, () =>
      EnvironmentConfigFactory.withEnvironmentDefaults(traced)
    );

    expect(config.traces?.sampleRatio).toBeUndefined();
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe("EnvironmentConfigFactory cpu limit", () => {
  it("reads CPU_LIMIT_MILLICORES as cores", () => {
    const config = withEnvironment({ CPU_LIMIT_MILLICORES: "500" }, () =>
      EnvironmentConfigFactory.withEnvironmentDefaults({ serviceName: "kreela-api" })
    );

    expect(config.architecture?.cpuLimit).toBe(0.5);
  });

  it("leaves a cpuLimit set in code alone", () => {
    const config = withEnvironment({ CPU_LIMIT_MILLICORES: "500" }, () =>
      EnvironmentConfigFactory.withEnvironmentDefaults({ serviceName: "kreela-api", architecture: { cpuLimit: 2 } })
    );

    expect(config.architecture?.cpuLimit).toBe(2);
  });

  it.each(["0", "-100", "lots"])("ignores the unusable limit %p, and says so", (millicores) => {
    const config = withEnvironment({ CPU_LIMIT_MILLICORES: millicores }, () =>
      EnvironmentConfigFactory.withEnvironmentDefaults({ serviceName: "kreela-api" })
    );

    expect(config.architecture).toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("CPU_LIMIT_MILLICORES"));
  });
});

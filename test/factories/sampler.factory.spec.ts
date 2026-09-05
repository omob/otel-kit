import { TelemetryErrorCode } from "../../src/enums/telemetry-error-code.enum";
import SamplerFactory from "../../src/factories/sampler.factory";

describe("SamplerFactory", () => {
  it("samples everything when no ratio is configured", () => {
    expect(SamplerFactory.createSampler().toString()).toContain("AlwaysOnSampler");
  });

  it("builds a parent based ratio sampler", () => {
    expect(SamplerFactory.createSampler(0.25).toString()).toContain("TraceIdRatioBased{0.25}");
  });

  it.each([0, 1])("accepts the boundary ratio %p", (ratio) => {
    expect(() => SamplerFactory.createSampler(ratio)).not.toThrow();
  });

  it.each([-0.1, 1.1, NaN])("rejects the out of range ratio %p", (ratio) => {
    expect(() => SamplerFactory.createSampler(ratio)).toThrow(
      expect.objectContaining({ errorCode: TelemetryErrorCode.INVALID_SAMPLE_RATIO })
    );
  });
});

describe("SamplerFactory.withDocTraces", () => {
  it("returns the sampler untouched without a ratio", () => {
    const base = SamplerFactory.createSampler(0.5);
    expect(SamplerFactory.withDocTraces(base)).toBe(base);
  });

  it("wraps with a DocTraceSampler when a ratio is given", () => {
    expect(SamplerFactory.withDocTraces(SamplerFactory.createSampler(0.5), 0.05).toString()).toContain("DocTrace{0.05");
  });

  it.each([-0.1, 1.1, NaN])("rejects the out of range doc-trace ratio %p", (ratio) => {
    expect(() => SamplerFactory.withDocTraces(SamplerFactory.createSampler(), ratio)).toThrow(
      expect.objectContaining({ errorCode: TelemetryErrorCode.INVALID_DOC_TRACE_RATIO })
    );
  });
});

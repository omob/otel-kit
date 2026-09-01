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

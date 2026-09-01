import { AlwaysOnSampler, ParentBasedSampler, Sampler, TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace-node";
import TelemetryConfigError from "../errors/telemetry-config.error";
import { TelemetryErrorCode } from "../enums/telemetry-error-code.enum";

class SamplerFactory {
  static createSampler(sampleRatio?: number): Sampler {
    if (sampleRatio === undefined) {
      return new ParentBasedSampler({ root: new AlwaysOnSampler() });
    }

    if (Number.isNaN(sampleRatio) || sampleRatio < 0 || sampleRatio > 1) {
      throw new TelemetryConfigError(
        TelemetryErrorCode.INVALID_SAMPLE_RATIO,
        `traces.sampleRatio must be between 0 and 1, received ${sampleRatio}`
      );
    }

    return new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(sampleRatio) });
  }
}

export default SamplerFactory;

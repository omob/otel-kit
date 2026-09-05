import { AlwaysOnSampler, ParentBasedSampler, Sampler, TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace-node";
import TelemetryConfigError from "../errors/telemetry-config.error";
import { TelemetryErrorCode } from "../enums/telemetry-error-code.enum";
import DocTraceSampler from "../samplers/doc-trace.sampler";

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

  /** Wraps `sampler` so a `docTraceRatio` fraction of root traces is always recorded and marked in tracestate. */
  static withDocTraces(sampler: Sampler, docTraceRatio?: number): Sampler {
    if (docTraceRatio === undefined) {
      return sampler;
    }

    if (Number.isNaN(docTraceRatio) || docTraceRatio < 0 || docTraceRatio > 1) {
      throw new TelemetryConfigError(
        TelemetryErrorCode.INVALID_DOC_TRACE_RATIO,
        `architecture.docTraceRatio must be between 0 and 1, received ${docTraceRatio}`
      );
    }

    return new DocTraceSampler(sampler, docTraceRatio);
  }
}

export default SamplerFactory;

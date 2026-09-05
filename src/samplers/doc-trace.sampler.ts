import { trace, type Attributes, type Context, type Link, type SpanKind } from "@opentelemetry/api";
import { TraceState } from "@opentelemetry/core";
import { SamplingDecision, type Sampler, type SamplingResult } from "@opentelemetry/sdk-trace-node";

import { DOC_TRACE_STATE_KEY, DOC_TRACE_STATE_VALUE } from "../constants/doc-trace";

/**
 * Marks a fraction of root traces as documentation traces and records them regardless of the delegate's
 * decision. The mark rides in W3C tracestate (`as=d`), so every downstream service on the same trace sees it
 * and records too, even when its own sampling is aggressive. Backends that build topology from traces can
 * then keep those traces at 100% and everything else at whatever rate cost allows.
 *
 * The decision is derived from a different slice of the trace id than TraceIdRatioBasedSampler uses, so
 * documentation traces are not simply a subset of production-sampled traces.
 */
class DocTraceSampler implements Sampler {
  private readonly upperBound: number;

  constructor(
    private readonly delegate: Sampler,
    private readonly ratio: number
  ) {
    this.upperBound = Math.floor(ratio * 0x1_0000_0000);
  }

  shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[]
  ): SamplingResult {
    const parent = trace.getSpanContext(context);
    const hasParent = parent !== undefined && trace.isSpanContextValid(parent);
    const inherited = hasParent && parent.traceState?.get(DOC_TRACE_STATE_KEY) === DOC_TRACE_STATE_VALUE;
    const chosen = inherited || (!hasParent && this.isDocTrace(traceId));

    if (!chosen) {
      return this.delegate.shouldSample(context, traceId, spanName, spanKind, attributes, links);
    }

    const traceState = (hasParent && parent.traceState ? parent.traceState : new TraceState()).set(
      DOC_TRACE_STATE_KEY,
      DOC_TRACE_STATE_VALUE
    );

    return { decision: SamplingDecision.RECORD_AND_SAMPLED, traceState };
  }

  toString(): string {
    return `DocTrace{${this.ratio}, ${this.delegate.toString()}}`;
  }

  // first 8 hex chars of the trace id; TraceIdRatioBasedSampler uses the last 8, so the two are independent
  private isDocTrace(traceId: string): boolean {
    return this.upperBound > 0 && parseInt(traceId.slice(0, 8), 16) < this.upperBound;
  }
}

export default DocTraceSampler;

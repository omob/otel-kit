import { trace, TraceFlags, type Attributes, type Context, type Link, type SpanContext, type SpanKind } from "@opentelemetry/api";
import { TraceState } from "@opentelemetry/core";
import { SamplingDecision, type Sampler, type SamplingResult } from "@opentelemetry/sdk-trace-node";

import { DocTraceState } from "../enums/doc-trace-state.enum";

// the mark rides in tracestate so downstream services record the same trace however aggressive their own sampling is
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
    const inherited = hasParent && DocTraceSampler.isMarked(parent);
    // forcing only where the trace enters the process leaves local children to the delegate, so a sampler that
    // drops noisy spans keeps dropping them inside a documentation trace
    const chosen = inherited ? parent?.isRemote === true : !hasParent && this.isDocTrace(traceId);
    const result = this.delegate.shouldSample(context, traceId, spanName, spanKind, attributes, links);

    if (!chosen) {
      return result;
    }

    const traceState = (inherited && parent?.traceState ? parent.traceState : new TraceState()).set(
      DocTraceState.KEY,
      DocTraceState.VALUE
    );

    return { ...result, decision: SamplingDecision.RECORD_AND_SAMPLED, traceState };
  }

  toString(): string {
    return `DocTrace{${this.ratio}, ${this.delegate.toString()}}`;
  }

  // an upstream doc trace always arrives sampled, so requiring the flag stops a forged tracestate alone from forcing a record
  private static isMarked(parent: SpanContext): boolean {
    return (
      (parent.traceFlags & TraceFlags.SAMPLED) !== 0 &&
      parent.traceState?.get(DocTraceState.KEY) === DocTraceState.VALUE
    );
  }

  // TraceIdRatioBasedSampler samples from the bottom of this same fold, so taking the top keeps the two sets disjoint
  private isDocTrace(traceId: string): boolean {
    return this.upperBound > 0 && DocTraceSampler.accumulate(traceId) >= 0x1_0000_0000 - this.upperBound;
  }

  // the fold TraceIdRatioBasedSampler uses: xor of the four 32-bit words, which spreads the guaranteed-random
  // trailing bytes across the whole value, so a trace id with a timestamp in its leading bytes still decides evenly
  private static accumulate(traceId: string): number {
    let accumulation = 0;

    for (let i = 0; i < 32; i += 8) {
      accumulation = (accumulation ^ Number.parseInt(traceId.slice(i, i + 8), 16)) >>> 0;
    }

    return accumulation;
  }
}

export default DocTraceSampler;

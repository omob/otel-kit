import { context, SpanKind, trace, TraceFlags } from "@opentelemetry/api";
import { TraceState } from "@opentelemetry/core";
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  SamplingDecision,
  TraceIdRatioBasedSampler,
  type Sampler,
} from "@opentelemetry/sdk-trace-node";
import DocTraceSampler from "../../src/samplers/doc-trace.sampler";

const SPAN_ID = "00f067aa0ba902b7";
const sample = (sampler: Sampler, traceId: string, ctx = context.active()) =>
  sampler.shouldSample(ctx, traceId, "op", SpanKind.SERVER, {}, []);
const withParent = (traceId: string, traceState?: TraceState, isRemote = true, traceFlags = TraceFlags.SAMPLED) =>
  trace.setSpanContext(context.active(), { traceId, spanId: SPAN_ID, traceFlags, isRemote, traceState });

describe("DocTraceSampler", () => {
  // the sampler folds the four words of a trace id with xor, so a single high word puts the id at the top
  const inWindow = "ffffffff00000000000000000000000f";
  const outsideWindow = "0000000100000000000000000000000f";

  it("records a chosen root trace even when the delegate says no, and marks tracestate", () => {
    const result = sample(new DocTraceSampler(new AlwaysOffSampler(), 0.1), inWindow);

    expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    expect(result.traceState?.get("as")).toBe("d");
  });

  it("defers to the delegate for root traces outside the window", () => {
    const result = sample(new DocTraceSampler(new AlwaysOffSampler(), 0.1), outsideWindow);

    expect(result.decision).toBe(SamplingDecision.NOT_RECORD);
    expect(result.traceState).toBeUndefined();
  });

  it("keeps what the delegate wanted to say about the span", () => {
    const delegate: Sampler = {
      shouldSample: () => ({ decision: SamplingDecision.NOT_RECORD, attributes: { "sampling.rule": "default" } }),
      toString: () => "Stub",
    };

    expect(sample(new DocTraceSampler(delegate, 1), inWindow).attributes).toEqual({ "sampling.rule": "default" });
  });

  it("inherits the mark from a remote parent regardless of its own window", () => {
    const parentState = new TraceState().set("as", "d").set("vendor", "x");
    const result = sample(new DocTraceSampler(new AlwaysOffSampler(), 0), outsideWindow, withParent(outsideWindow, parentState));

    expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    expect(result.traceState?.get("as")).toBe("d");
    expect(result.traceState?.get("vendor")).toBe("x");
  });

  it("ignores the mark on an unsampled parent, which no upstream doc trace produces", () => {
    const parentState = new TraceState().set("as", "d");
    const parent = withParent(outsideWindow, parentState, true, TraceFlags.NONE);

    expect(sample(new DocTraceSampler(new AlwaysOffSampler(), 0), outsideWindow, parent).decision).toBe(
      SamplingDecision.NOT_RECORD
    );
  });

  it("leaves local children of a documentation trace to the delegate", () => {
    const parentState = new TraceState().set("as", "d");
    const parent = withParent(outsideWindow, parentState, false);

    expect(sample(new DocTraceSampler(new AlwaysOffSampler(), 0), outsideWindow, parent).decision).toBe(
      SamplingDecision.NOT_RECORD
    );
  });

  it("does not choose child spans on its own; only the root decides", () => {
    const result = sample(new DocTraceSampler(new AlwaysOffSampler(), 1), inWindow, withParent(inWindow));

    expect(result.decision).toBe(SamplingDecision.NOT_RECORD);
  });

  it("ratio 0 never marks, ratio 1 always marks", () => {
    expect(sample(new DocTraceSampler(new AlwaysOffSampler(), 0), inWindow).decision).toBe(SamplingDecision.NOT_RECORD);
    expect(sample(new DocTraceSampler(new AlwaysOffSampler(), 1), outsideWindow).traceState?.get("as")).toBe("d");
  });

  it("never picks a trace the ratio sampler already sampled", () => {
    const ratio = new TraceIdRatioBasedSampler(0.5);
    const docTraces = new DocTraceSampler(new AlwaysOffSampler(), 0.5);
    // a multiplicative hash spreads the fold across the whole 32-bit range; repeating one word would fold to zero
    const traceIds = Array.from({ length: 500 }, (_, i) =>
      (((i + 1) * 2654435761) >>> 0).toString(16).padStart(8, "0").concat("00000000000000000000000f")
    );

    const results = traceIds.map((traceId) => ({
      sampled: sample(ratio, traceId).decision !== SamplingDecision.NOT_RECORD,
      marked: sample(docTraces, traceId).traceState?.get("as") === "d",
    }));

    expect(results.filter((r) => r.sampled).length).toBeGreaterThan(100);
    expect(results.filter((r) => r.marked).length).toBeGreaterThan(100);
    expect(results.filter((r) => r.sampled && r.marked)).toEqual([]);
  });

  it("describes itself", () => {
    expect(new DocTraceSampler(new AlwaysOnSampler(), 0.05).toString()).toBe("DocTrace{0.05, AlwaysOnSampler}");
  });
});

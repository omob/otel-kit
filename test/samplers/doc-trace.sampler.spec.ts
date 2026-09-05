import { context, SpanKind, trace } from "@opentelemetry/api";
import { TraceState } from "@opentelemetry/core";
import { AlwaysOffSampler, AlwaysOnSampler, SamplingDecision } from "@opentelemetry/sdk-trace-node";
import DocTraceSampler from "../../src/samplers/doc-trace.sampler";

const SPAN_ID = "00f067aa0ba902b7";
const sample = (sampler: DocTraceSampler, traceId: string, ctx = context.active()) =>
  sampler.shouldSample(ctx, traceId, "op", SpanKind.SERVER, {}, []);
const withParent = (traceId: string, traceState?: TraceState) =>
  trace.setSpanContext(context.active(), { traceId, spanId: SPAN_ID, traceFlags: 1, isRemote: true, traceState });

describe("DocTraceSampler", () => {
  const low = "00000001aaaaaaaaaaaaaaaaaaaaaaaa"; // leading bytes small: inside a 10% window
  const high = "ffffffffaaaaaaaaaaaaaaaaaaaaaaaa"; // outside any window below 1

  it("records a chosen root trace even when the delegate says no, and marks tracestate", () => {
    const result = sample(new DocTraceSampler(new AlwaysOffSampler(), 0.1), low);
    expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    expect(result.traceState?.get("as")).toBe("d");
  });

  it("defers to the delegate for root traces outside the window", () => {
    const result = sample(new DocTraceSampler(new AlwaysOffSampler(), 0.1), high);
    expect(result.decision).toBe(SamplingDecision.NOT_RECORD);
    expect(result.traceState).toBeUndefined();
  });

  it("inherits the mark from a remote parent regardless of its own window", () => {
    const parentState = new TraceState().set("as", "d").set("vendor", "x");
    const result = sample(new DocTraceSampler(new AlwaysOffSampler(), 0), high, withParent(high, parentState));
    expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    expect(result.traceState?.get("as")).toBe("d");
    expect(result.traceState?.get("vendor")).toBe("x");
  });

  it("does not choose child spans on its own; only the root decides", () => {
    const result = sample(new DocTraceSampler(new AlwaysOffSampler(), 1), low, withParent(low));
    expect(result.decision).toBe(SamplingDecision.NOT_RECORD);
  });

  it("ratio 0 never marks, ratio 1 always marks", () => {
    expect(sample(new DocTraceSampler(new AlwaysOffSampler(), 0), low).decision).toBe(SamplingDecision.NOT_RECORD);
    expect(sample(new DocTraceSampler(new AlwaysOffSampler(), 1), high).traceState?.get("as")).toBe("d");
  });

  it("uses the leading trace-id bytes, independent of TraceIdRatioBasedSampler's trailing bytes", () => {
    expect(sample(new DocTraceSampler(new AlwaysOnSampler(), 0.5), "ffffffff000000000000000000000000").traceState).toBeUndefined();
    expect(sample(new DocTraceSampler(new AlwaysOnSampler(), 0.5), "00000000ffffffffffffffffffffffff").traceState?.get("as")).toBe("d");
  });

  it("describes itself", () => {
    expect(new DocTraceSampler(new AlwaysOnSampler(), 0.05).toString()).toBe("DocTrace{0.05, AlwaysOnSampler}");
  });
});

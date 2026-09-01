import { ROOT_CONTEXT, trace, TraceFlags } from "@opentelemetry/api";
import { PropagatorType } from "../../src/enums/propagator-type.enum";
import { TelemetryErrorCode } from "../../src/enums/telemetry-error-code.enum";
import PropagatorFactory from "../../src/factories/propagator.factory";

const activeContext = () =>
  trace.setSpanContext(ROOT_CONTEXT, {
    traceId: "d4cda95b652f4a1592b449d5929fda1b",
    spanId: "6e0c63257de34c92",
    traceFlags: TraceFlags.SAMPLED,
  });

const inject = (propagators?: PropagatorType[]) => {
  const carrier: Record<string, string> = {};

  PropagatorFactory.createPropagator(propagators).inject(activeContext(), carrier, {
    set: (target, key, value) => (target[key] = value as string),
  });

  return carrier;
};

describe("PropagatorFactory", () => {
  it("propagates w3c trace context and baggage by default", () => {
    expect(PropagatorFactory.createPropagator().fields()).toEqual(
      expect.arrayContaining(["traceparent", "tracestate", "baggage"])
    );
    expect(inject()).toHaveProperty("traceparent");
  });

  it("falls back to the default when an empty list is configured", () => {
    expect(PropagatorFactory.createPropagator([]).fields()).toEqual(
      expect.arrayContaining(["traceparent", "baggage"])
    );
  });

  it("emits the jaeger uber-trace-id header", () => {
    const carrier = inject([PropagatorType.JAEGER]);

    expect(carrier["uber-trace-id"]).toContain("d4cda95b652f4a1592b449d5929fda1b");
  });

  it("emits a single b3 header", () => {
    expect(inject([PropagatorType.B3])).toHaveProperty("b3");
  });

  it("emits multi header b3", () => {
    expect(inject([PropagatorType.B3_MULTI])).toHaveProperty("x-b3-traceid");
  });

  it("composes every configured propagator", () => {
    const carrier = inject([PropagatorType.TRACE_CONTEXT, PropagatorType.JAEGER, PropagatorType.B3]);

    expect(Object.keys(carrier)).toEqual(expect.arrayContaining(["traceparent", "uber-trace-id", "b3"]));
  });

  it("rejects an unknown propagator", () => {
    expect(() => PropagatorFactory.createPropagator(["zipkin" as PropagatorType])).toThrow(
      expect.objectContaining({ errorCode: TelemetryErrorCode.UNSUPPORTED_PROPAGATOR })
    );
  });
});

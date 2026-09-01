import type { TextMapPropagator } from "@opentelemetry/api";
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from "@opentelemetry/core";
import { B3InjectEncoding, B3Propagator } from "@opentelemetry/propagator-b3";
import { JaegerPropagator } from "@opentelemetry/propagator-jaeger";
import { PropagatorType } from "../enums/propagator-type.enum";
import { TelemetryErrorCode } from "../enums/telemetry-error-code.enum";
import TelemetryConfigError from "../errors/telemetry-config.error";

const DEFAULT_PROPAGATORS = [PropagatorType.TRACE_CONTEXT, PropagatorType.BAGGAGE];

class PropagatorFactory {
  static createPropagator(propagators?: PropagatorType[]): TextMapPropagator {
    const selected = propagators?.length ? propagators : DEFAULT_PROPAGATORS;

    return new CompositePropagator({ propagators: selected.map(PropagatorFactory.createOne) });
  }

  private static createOne(propagator: PropagatorType): TextMapPropagator {
    switch (propagator) {
      case PropagatorType.TRACE_CONTEXT:
        return new W3CTraceContextPropagator();
      case PropagatorType.BAGGAGE:
        return new W3CBaggagePropagator();
      case PropagatorType.B3:
        return new B3Propagator({ injectEncoding: B3InjectEncoding.SINGLE_HEADER });
      case PropagatorType.B3_MULTI:
        return new B3Propagator({ injectEncoding: B3InjectEncoding.MULTI_HEADER });
      case PropagatorType.JAEGER:
        return new JaegerPropagator();
      default:
        throw new TelemetryConfigError(
          TelemetryErrorCode.UNSUPPORTED_PROPAGATOR,
          `${propagator} is not a supported propagator`
        );
    }
  }
}

export default PropagatorFactory;

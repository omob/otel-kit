import { ExporterType } from "./enums/exporter-type.enum";
import { InstrumentationName } from "./enums/instrumentation-name.enum";
import { OtlpProtocol } from "./enums/otlp-protocol.enum";
import { PropagatorType } from "./enums/propagator-type.enum";
import { TelemetryErrorCode } from "./enums/telemetry-error-code.enum";
import { TelemetrySignal } from "./enums/telemetry-signal.enum";
import TelemetryConfigError from "./errors/telemetry-config.error";
import { currentTraceId, getTracer, withSpan } from "./services/span.service";
import Telemetry from "./services/telemetry.service";

export {
  currentTraceId,
  ExporterType,
  getTracer,
  InstrumentationName,
  OtlpProtocol,
  PropagatorType,
  Telemetry,
  TelemetryConfigError,
  TelemetryErrorCode,
  TelemetrySignal,
  withSpan,
};

export * from "./telemetry.types";

import { ExporterType } from "./enums/exporter-type.enum";
import { InstrumentationName } from "./enums/instrumentation-name.enum";
import { OtlpProtocol } from "./enums/otlp-protocol.enum";
import { PropagatorType } from "./enums/propagator-type.enum";
import { TelemetryErrorCode } from "./enums/telemetry-error-code.enum";
import { TelemetrySignal } from "./enums/telemetry-signal.enum";
import TelemetryConfigError from "./errors/telemetry-config.error";
import { observeConnectionPool } from "./services/connection-pool.service";
import { currentTraceId, getTracer, withSpan } from "./services/span.service";
import Telemetry from "./services/telemetry.service";
import { DOC_TRACE_STATE_KEY, DOC_TRACE_STATE_VALUE } from "./constants/doc-trace";

export {
  currentTraceId,
  DOC_TRACE_STATE_KEY,
  DOC_TRACE_STATE_VALUE,
  ExporterType,
  getTracer,
  InstrumentationName,
  observeConnectionPool,
  OtlpProtocol,
  PropagatorType,
  Telemetry,
  TelemetryConfigError,
  TelemetryErrorCode,
  TelemetrySignal,
  withSpan,
};

export * from "./telemetry.types";

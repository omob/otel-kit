export { default as Telemetry } from "./services/telemetry.service";
export { currentTraceId, getTracer, withSpan } from "./services/span.service";
export { default as TelemetryConfigError } from "./errors/telemetry-config.error";
export { ExporterType } from "./enums/exporter-type.enum";
export { InstrumentationName } from "./enums/instrumentation-name.enum";
export { PropagatorType } from "./enums/propagator-type.enum";
export { TelemetryErrorCode } from "./enums/telemetry-error-code.enum";
export * from "./telemetry.types";

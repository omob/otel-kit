import { OtlpProtocol } from "../enums/otlp-protocol.enum";
import { TelemetryErrorCode } from "../enums/telemetry-error-code.enum";
import { TelemetrySignal } from "../enums/telemetry-signal.enum";
import TelemetryConfigError from "../errors/telemetry-config.error";
import { IOtlpOptions } from "../telemetry.types";
import { loadOptionalDependency } from "../utils/optional-dependency";
import { toOtlpExporterOptions } from "../utils/otlp-options";

const MODULES: Record<TelemetrySignal, Record<OtlpProtocol, string>> = {
  [TelemetrySignal.TRACES]: {
    [OtlpProtocol.HTTP_PROTOBUF]: "@opentelemetry/exporter-trace-otlp-proto",
    [OtlpProtocol.HTTP_JSON]: "@opentelemetry/exporter-trace-otlp-http",
    [OtlpProtocol.GRPC]: "@opentelemetry/exporter-trace-otlp-grpc",
  },
  [TelemetrySignal.METRICS]: {
    [OtlpProtocol.HTTP_PROTOBUF]: "@opentelemetry/exporter-metrics-otlp-proto",
    [OtlpProtocol.HTTP_JSON]: "@opentelemetry/exporter-metrics-otlp-http",
    [OtlpProtocol.GRPC]: "@opentelemetry/exporter-metrics-otlp-grpc",
  },
  [TelemetrySignal.LOGS]: {
    [OtlpProtocol.HTTP_PROTOBUF]: "@opentelemetry/exporter-logs-otlp-proto",
    [OtlpProtocol.HTTP_JSON]: "@opentelemetry/exporter-logs-otlp-http",
    [OtlpProtocol.GRPC]: "@opentelemetry/exporter-logs-otlp-grpc",
  },
};

const EXPORT_NAMES: Record<TelemetrySignal, string> = {
  [TelemetrySignal.TRACES]: "OTLPTraceExporter",
  [TelemetrySignal.METRICS]: "OTLPMetricExporter",
  [TelemetrySignal.LOGS]: "OTLPLogExporter",
};

class OtlpExporterFactory {
  static createExporter<T>(signal: TelemetrySignal, options: IOtlpOptions = {}): T {
    const protocol = options.protocol ?? OtlpProtocol.HTTP_PROTOBUF;
    const moduleName = MODULES[signal][protocol];

    if (!moduleName) {
      throw new TelemetryConfigError(
        TelemetryErrorCode.UNSUPPORTED_PROTOCOL,
        `${protocol} is not a supported otlp protocol`
      );
    }

    const exporters = loadOptionalDependency<Record<string, new (options: object) => T>>(moduleName);

    return new exporters[EXPORT_NAMES[signal]](toOtlpExporterOptions(options));
  }
}

export default OtlpExporterFactory;

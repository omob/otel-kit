import {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
  LogRecordProcessor,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { ExporterType } from "../enums/exporter-type.enum";
import { TelemetryErrorCode } from "../enums/telemetry-error-code.enum";
import TelemetryConfigError from "../errors/telemetry-config.error";
import { ILogConfig } from "../telemetry.types";
import { toOtlpExporterOptions } from "../utils/otlp-options";

class LogProcessorFactory {
  static createProcessors(config: ILogConfig): LogRecordProcessor[] {
    switch (config.exporter) {
      case ExporterType.NONE:
        return [];
      case ExporterType.CONSOLE:
        return [new SimpleLogRecordProcessor({ exporter: new ConsoleLogRecordExporter() })];
      case ExporterType.OTLP:
        return [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter(toOtlpExporterOptions(config.otlp)) })];
      default:
        throw new TelemetryConfigError(
          TelemetryErrorCode.UNSUPPORTED_EXPORTER,
          `${config.exporter} is not a supported log exporter`
        );
    }
  }
}

export default LogProcessorFactory;

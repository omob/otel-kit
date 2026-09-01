import type { LogRecordExporter } from "@opentelemetry/sdk-logs";
import {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
  LogRecordProcessor,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { ExporterType } from "../enums/exporter-type.enum";
import { TelemetryErrorCode } from "../enums/telemetry-error-code.enum";
import TelemetryConfigError from "../errors/telemetry-config.error";
import { ILogConfig } from "../telemetry.types";
import { TelemetrySignal } from "../enums/telemetry-signal.enum";
import OtlpExporterFactory from "./otlp-exporter.factory";

class LogProcessorFactory {
  static createProcessors(config: ILogConfig): LogRecordProcessor[] {
    switch (config.exporter) {
      case ExporterType.NONE:
        return [];
      case ExporterType.CONSOLE:
        return [new SimpleLogRecordProcessor({ exporter: new ConsoleLogRecordExporter() })];
      case ExporterType.OTLP:
        return [
          new BatchLogRecordProcessor({
            exporter: OtlpExporterFactory.createExporter<LogRecordExporter>(TelemetrySignal.LOGS, config.otlp),
          }),
        ];
      default:
        throw new TelemetryConfigError(
          TelemetryErrorCode.UNSUPPORTED_EXPORTER,
          `${config.exporter} is not a supported log exporter`
        );
    }
  }
}

export default LogProcessorFactory;

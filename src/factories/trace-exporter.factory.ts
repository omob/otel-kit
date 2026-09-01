import { ConsoleSpanExporter, SpanExporter } from "@opentelemetry/sdk-trace-node";
import { ExporterType } from "../enums/exporter-type.enum";
import { TelemetryErrorCode } from "../enums/telemetry-error-code.enum";
import TelemetryConfigError from "../errors/telemetry-config.error";
import { IGcpTraceModule, ITraceConfig } from "../telemetry.types";
import { TelemetrySignal } from "../enums/telemetry-signal.enum";
import { loadOptionalDependency } from "../utils/optional-dependency";
import OtlpExporterFactory from "./otlp-exporter.factory";
import { toGcpExporterOptions } from "../utils/gcp-credentials";

const GCP_TRACE_MODULE = "@google-cloud/opentelemetry-cloud-trace-exporter";

class TraceExporterFactory {
  static createExporter(config: ITraceConfig): SpanExporter | undefined {
    switch (config.exporter) {
      case ExporterType.NONE:
        return undefined;
      case ExporterType.CONSOLE:
        return new ConsoleSpanExporter();
      case ExporterType.OTLP:
        return OtlpExporterFactory.createExporter<SpanExporter>(TelemetrySignal.TRACES, config.otlp);
      case ExporterType.GCP:
        return TraceExporterFactory.createGcpExporter(config);
      default:
        throw new TelemetryConfigError(
          TelemetryErrorCode.UNSUPPORTED_EXPORTER,
          `${config.exporter} is not a supported trace exporter`
        );
    }
  }

  private static createGcpExporter(config: ITraceConfig): SpanExporter {
    const { TraceExporter } = loadOptionalDependency<IGcpTraceModule>(GCP_TRACE_MODULE);

    return new TraceExporter(toGcpExporterOptions(config.gcp));
  }
}

export default TraceExporterFactory;

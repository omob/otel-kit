import { ConsoleSpanExporter, SpanExporter } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { ExporterType } from "../enums/exporter-type.enum";
import { TelemetryErrorCode } from "../enums/telemetry-error-code.enum";
import TelemetryConfigError from "../errors/telemetry-config.error";
import { ITraceConfig } from "../telemetry.types";
import { loadOptionalDependency } from "../utils/optional-dependency";
import { toGcpExporterOptions } from "../utils/gcp-credentials";
import { toOtlpExporterOptions } from "../utils/otlp-options";

const GCP_TRACE_MODULE = "@google-cloud/opentelemetry-cloud-trace-exporter";

type GcpTraceModule = { TraceExporter: new (options: object) => SpanExporter };

class TraceExporterFactory {
  static createExporter(config: ITraceConfig): SpanExporter | undefined {
    switch (config.exporter) {
      case ExporterType.NONE:
        return undefined;
      case ExporterType.CONSOLE:
        return new ConsoleSpanExporter();
      case ExporterType.OTLP:
        return new OTLPTraceExporter(toOtlpExporterOptions(config.otlp));
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
    const { TraceExporter } = loadOptionalDependency<GcpTraceModule>(GCP_TRACE_MODULE);

    return new TraceExporter(toGcpExporterOptions(config.gcp));
  }
}

export default TraceExporterFactory;

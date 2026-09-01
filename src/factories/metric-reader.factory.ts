import {
  ConsoleMetricExporter,
  MetricReader,
  PeriodicExportingMetricReader,
  PushMetricExporter,
} from "@opentelemetry/sdk-metrics";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { ExporterType } from "../enums/exporter-type.enum";
import { TelemetryErrorCode } from "../enums/telemetry-error-code.enum";
import TelemetryConfigError from "../errors/telemetry-config.error";
import { IMetricConfig } from "../telemetry.types";
import { loadOptionalDependency } from "../utils/optional-dependency";
import { toGcpExporterOptions } from "../utils/gcp-credentials";
import { toOtlpExporterOptions } from "../utils/otlp-options";

const DEFAULT_EXPORT_INTERVAL_MILLIS = 60_000;
const GCP_MONITORING_MODULE = "@google-cloud/opentelemetry-cloud-monitoring-exporter";
const PROMETHEUS_MODULE = "@opentelemetry/exporter-prometheus";

type GcpMonitoringModule = { MetricExporter: new (options: object) => PushMetricExporter };
type PrometheusModule = { PrometheusExporter: new (options: object) => MetricReader };

class MetricReaderFactory {
  static createReader(config: IMetricConfig): MetricReader | undefined {
    if (config.exporter === ExporterType.NONE) {
      return undefined;
    }

    if (config.exporter === ExporterType.PROMETHEUS) {
      const { PrometheusExporter } = loadOptionalDependency<PrometheusModule>(PROMETHEUS_MODULE);

      return new PrometheusExporter({
        host: config.prometheus?.host,
        port: config.prometheus?.port,
        endpoint: config.prometheus?.endpoint,
      });
    }

    return new PeriodicExportingMetricReader({
      exporter: MetricReaderFactory.createExporter(config),
      exportIntervalMillis: config.exportIntervalMillis ?? DEFAULT_EXPORT_INTERVAL_MILLIS,
    });
  }

  private static createExporter(config: IMetricConfig): PushMetricExporter {
    switch (config.exporter) {
      case ExporterType.CONSOLE:
        return new ConsoleMetricExporter();
      case ExporterType.OTLP:
        return new OTLPMetricExporter(toOtlpExporterOptions(config.otlp));
      case ExporterType.GCP:
        return new (loadOptionalDependency<GcpMonitoringModule>(GCP_MONITORING_MODULE).MetricExporter)(
          toGcpExporterOptions(config.gcp)
        );
      default:
        throw new TelemetryConfigError(
          TelemetryErrorCode.UNSUPPORTED_EXPORTER,
          `${config.exporter} is not a supported metric exporter`
        );
    }
  }
}

export default MetricReaderFactory;

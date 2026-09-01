import {
  ConsoleMetricExporter,
  MetricReader,
  PeriodicExportingMetricReader,
  PushMetricExporter,
} from "@opentelemetry/sdk-metrics";
import { ExporterType } from "../enums/exporter-type.enum";
import { TelemetryErrorCode } from "../enums/telemetry-error-code.enum";
import TelemetryConfigError from "../errors/telemetry-config.error";
import { IGcpMonitoringModule, IMetricConfig, IPrometheusModule } from "../telemetry.types";
import { TelemetrySignal } from "../enums/telemetry-signal.enum";
import { loadOptionalDependency } from "../utils/optional-dependency";
import OtlpExporterFactory from "./otlp-exporter.factory";
import { toGcpExporterOptions } from "../utils/gcp-credentials";

const DEFAULT_EXPORT_INTERVAL_MILLIS = 60_000;
const GCP_MONITORING_MODULE = "@google-cloud/opentelemetry-cloud-monitoring-exporter";
const PROMETHEUS_MODULE = "@opentelemetry/exporter-prometheus";
// the exporter binds every interface when host is unset, exposing an unauthenticated scrape endpoint
const DEFAULT_PROMETHEUS_HOST = "127.0.0.1";

class MetricReaderFactory {
  static createReader(config: IMetricConfig): MetricReader | undefined {
    if (config.exporter === ExporterType.NONE) {
      return undefined;
    }

    if (config.exporter === ExporterType.PROMETHEUS) {
      const { PrometheusExporter } = loadOptionalDependency<IPrometheusModule>(PROMETHEUS_MODULE);

      return new PrometheusExporter({
        host: config.prometheus?.host ?? DEFAULT_PROMETHEUS_HOST,
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
        return OtlpExporterFactory.createExporter<PushMetricExporter>(TelemetrySignal.METRICS, config.otlp);
      case ExporterType.GCP:
        return new (loadOptionalDependency<IGcpMonitoringModule>(GCP_MONITORING_MODULE).MetricExporter)(
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

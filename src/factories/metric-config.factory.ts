import { ExporterType } from "../enums/exporter-type.enum";
import { OtlpEnvironmentVariable } from "../enums/otlp-environment-variable.enum";
import { OtlpProtocol } from "../enums/otlp-protocol.enum";
import { IMetricConfig, ITelemetryConfig } from "../telemetry.types";

const TRACES_PATH = /\/v1\/traces\/?$/;
const METRICS_PATH = "/v1/metrics";

class MetricConfigFactory {
  static createMetricConfig(config: ITelemetryConfig): IMetricConfig {
    // the standard off switch has to work in an incident, whatever the code says
    if (MetricConfigFactory.turnedOffByEnvironment()) {
      return { exporter: ExporterType.NONE };
    }

    const derived = MetricConfigFactory.fromTraces(config);
    const metrics = config.metrics;

    if (!metrics) {
      return derived ?? { exporter: ExporterType.NONE };
    }

    // a block that only adds cpuUsage or an interval would otherwise lose the collector and its auth headers
    if (metrics.exporter === ExporterType.OTLP && !metrics.otlp?.url && derived?.otlp) {
      return { ...metrics, otlp: { ...derived.otlp, ...metrics.otlp, url: derived.otlp.url } };
    }

    return metrics;
  }

  static fromTraces(config: ITelemetryConfig): IMetricConfig | undefined {
    const traces = config.traces;

    if (traces?.exporter !== ExporterType.OTLP) {
      return undefined;
    }

    // a separately chosen metrics endpoint may belong to another vendor, so the traces credentials stay behind
    if (process.env[OtlpEnvironmentVariable.METRICS_ENDPOINT]) {
      return { exporter: ExporterType.OTLP, otlp: { protocol: traces.otlp?.protocol } };
    }

    const tracesUrl = traces.otlp?.url ?? process.env[OtlpEnvironmentVariable.TRACES_ENDPOINT];

    if (!tracesUrl || traces.otlp?.protocol === OtlpProtocol.GRPC) {
      return MetricConfigFactory.otlpMetrics(config, tracesUrl);
    }

    const metricsUrl = MetricConfigFactory.metricsUrl(tracesUrl);

    return metricsUrl ? MetricConfigFactory.otlpMetrics(config, metricsUrl) : undefined;
  }

  private static metricsUrl(tracesUrl: string): string | undefined {
    try {
      const url = new URL(tracesUrl);

      if (!TRACES_PATH.test(url.pathname)) {
        return undefined;
      }

      url.pathname = url.pathname.replace(TRACES_PATH, METRICS_PATH);

      return url.toString();
    } catch {
      return undefined;
    }
  }

  private static otlpMetrics(config: ITelemetryConfig, url: string | undefined): IMetricConfig {
    const metrics = {} as IMetricConfig;
    metrics.exporter = ExporterType.OTLP;
    metrics.otlp = { ...config.traces?.otlp, url };

    return metrics;
  }

  private static turnedOffByEnvironment(): boolean {
    const exporters = (process.env[OtlpEnvironmentVariable.METRICS_EXPORTER] ?? "").split(",");

    return exporters.map((exporter) => exporter.trim()).includes(ExporterType.NONE);
  }
}

export default MetricConfigFactory;

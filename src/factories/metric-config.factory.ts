import { ExporterType } from "../enums/exporter-type.enum";
import { OtlpEnvironmentVariable } from "../enums/otlp-environment-variable.enum";
import { OtlpProtocol } from "../enums/otlp-protocol.enum";
import { IMetricConfig, ITelemetryConfig } from "../telemetry.types";
import { readEnvironment } from "../utils/environment";

const TRACES_PATH = /\/v1\/traces\/?$/;
const METRICS_PATH = "/v1/metrics";
const WEB_PROTOCOLS = ["http:", "https:"];

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

    if (metrics.exporter !== ExporterType.OTLP || MetricConfigFactory.nonBlank(metrics.otlp?.url)) {
      return metrics;
    }

    // a block that only adds cpuUsage or an interval would otherwise lose the collector and its auth headers
    if (derived?.otlp) {
      return { ...metrics, otlp: { ...derived.otlp, ...metrics.otlp, url: derived.otlp.url } };
    }

    // with nothing to follow, the exporter would retry an unrelated local default for the life of the process
    if (MetricConfigFactory.endpointFromEnvironment()) {
      return { ...metrics, otlp: { ...metrics.otlp, url: undefined } };
    }

    return { exporter: ExporterType.NONE };
  }

  static fromTraces(config: ITelemetryConfig): IMetricConfig | undefined {
    const traces = config.traces;

    if (traces?.exporter !== ExporterType.OTLP) {
      return undefined;
    }

    // a separately chosen metrics endpoint may belong to another vendor, so the traces credentials stay behind
    if (readEnvironment(OtlpEnvironmentVariable.METRICS_ENDPOINT)) {
      return { exporter: ExporterType.OTLP, otlp: { protocol: traces.otlp?.protocol } };
    }

    const tracesUrl =
      MetricConfigFactory.nonBlank(traces.otlp?.url) ?? readEnvironment(OtlpEnvironmentVariable.TRACES_ENDPOINT);

    // an unset url leaves the exporter to the collector the traces fall back to
    if (!tracesUrl) {
      return MetricConfigFactory.otlpMetrics(config, undefined);
    }

    const metricsUrl = MetricConfigFactory.metricsUrl(tracesUrl, traces.otlp?.protocol === OtlpProtocol.GRPC);

    return metricsUrl ? MetricConfigFactory.otlpMetrics(config, metricsUrl) : undefined;
  }

  static turnedOffByEnvironment(): boolean {
    const exporters = (readEnvironment(OtlpEnvironmentVariable.METRICS_EXPORTER) ?? "").split(",");

    return exporters.map((exporter) => exporter.trim()).includes(ExporterType.NONE);
  }

  private static endpointFromEnvironment(): string | undefined {
    return (
      readEnvironment(OtlpEnvironmentVariable.METRICS_ENDPOINT) ?? readEnvironment(OtlpEnvironmentVariable.ENDPOINT)
    );
  }

  private static otlpMetrics(config: ITelemetryConfig, url: string | undefined): IMetricConfig {
    const metrics = {} as IMetricConfig;
    metrics.exporter = ExporterType.OTLP;
    metrics.otlp = { ...config.traces?.otlp, url };

    return metrics;
  }

  // parsing alone accepts `collector:4318/v1/traces` as scheme `collector:`, so the protocol is checked too
  private static metricsUrl(tracesUrl: string, grpc: boolean): string | undefined {
    // grpc carries no signal path, and its endpoints are often written without a scheme
    if (grpc) {
      return tracesUrl;
    }

    try {
      const url = new URL(tracesUrl);

      if (!WEB_PROTOCOLS.includes(url.protocol) || !TRACES_PATH.test(url.pathname)) {
        return undefined;
      }

      url.pathname = url.pathname.replace(TRACES_PATH, METRICS_PATH);

      return url.toString();
    } catch {
      return undefined;
    }
  }

  private static nonBlank(value: string | undefined): string | undefined {
    return value?.trim() ? value.trim() : undefined;
  }
}

export default MetricConfigFactory;

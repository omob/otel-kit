import { ExporterType } from "../enums/exporter-type.enum";
import { TelemetrySignal } from "../enums/telemetry-signal.enum";
import { IMetricConfig, ITelemetryConfig } from "../telemetry.types";
import OtlpDestinationFactory from "./otlp-destination.factory";

class MetricConfigFactory {
  static createMetricConfig(config: ITelemetryConfig): IMetricConfig {
    if (OtlpDestinationFactory.turnedOff(TelemetrySignal.METRICS)) {
      return { exporter: ExporterType.NONE };
    }

    const metrics = config.metrics;

    if (!metrics) {
      const derived = OtlpDestinationFactory.fromTraces(config, TelemetrySignal.METRICS);

      return derived ? { exporter: ExporterType.OTLP, otlp: derived } : { exporter: ExporterType.NONE };
    }

    if (metrics.exporter !== ExporterType.OTLP || OtlpDestinationFactory.nonBlank(metrics.otlp?.url)) {
      return metrics;
    }

    const otlp = OtlpDestinationFactory.withoutUrl(config, TelemetrySignal.METRICS, metrics.otlp);

    return otlp ? { ...metrics, otlp } : { exporter: ExporterType.NONE };
  }

  static turnedOffByEnvironment(): boolean {
    return OtlpDestinationFactory.turnedOff(TelemetrySignal.METRICS);
  }
}

export default MetricConfigFactory;

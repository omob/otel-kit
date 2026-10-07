import { ExporterType } from "../enums/exporter-type.enum";
import { TelemetrySignal } from "../enums/telemetry-signal.enum";
import { ILogConfig, ITelemetryConfig } from "../telemetry.types";
import OtlpDestinationFactory from "./otlp-destination.factory";

class LogConfigFactory {
  static createLogConfig(config: ITelemetryConfig): ILogConfig {
    if (OtlpDestinationFactory.turnedOff(TelemetrySignal.LOGS)) {
      return { exporter: ExporterType.NONE };
    }

    const logs = config.logs;

    // logs often go somewhere other than traces, so only their own endpoint turns them on without code
    if (!logs) {
      return OtlpDestinationFactory.signalEndpoint(TelemetrySignal.LOGS)
        ? { exporter: ExporterType.OTLP, otlp: {} }
        : { exporter: ExporterType.NONE };
    }

    if (logs.exporter !== ExporterType.OTLP || OtlpDestinationFactory.nonBlank(logs.otlp?.url)) {
      return logs;
    }

    const otlp = OtlpDestinationFactory.withoutUrl(config, TelemetrySignal.LOGS, logs.otlp);

    return otlp ? { ...logs, otlp } : { exporter: ExporterType.NONE };
  }

  static turnedOffByEnvironment(): boolean {
    return OtlpDestinationFactory.turnedOff(TelemetrySignal.LOGS);
  }
}

export default LogConfigFactory;

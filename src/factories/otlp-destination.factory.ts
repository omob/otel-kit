import { ExporterType } from "../enums/exporter-type.enum";
import { OtlpEnvironmentVariable } from "../enums/otlp-environment-variable.enum";
import { OtlpProtocol } from "../enums/otlp-protocol.enum";
import { TelemetrySignal } from "../enums/telemetry-signal.enum";
import { IOtlpOptions, ITelemetryConfig } from "../telemetry.types";
import { readEnvironment } from "../utils/environment";
import { DerivedSignal, ISignalEnvironment } from "./otlp-destination.types";

const TRACES_PATH = /\/v1\/traces\/?$/;
const WEB_PROTOCOLS = ["http:", "https:"];
const SIGNALS: Record<DerivedSignal, ISignalEnvironment> = {
  [TelemetrySignal.METRICS]: {
    endpoint: OtlpEnvironmentVariable.METRICS_ENDPOINT,
    exporter: OtlpEnvironmentVariable.METRICS_EXPORTER,
    path: "/v1/metrics",
  },
  [TelemetrySignal.LOGS]: {
    endpoint: OtlpEnvironmentVariable.LOGS_ENDPOINT,
    exporter: OtlpEnvironmentVariable.LOGS_EXPORTER,
    path: "/v1/logs",
  },
};

// where metrics and logs go when the code names no URL: the traces collector, a variable, or nowhere
class OtlpDestinationFactory {
  // the standard off switch has to work in an incident, whatever the code says
  static turnedOff(signal: DerivedSignal): boolean {
    const exporters = (readEnvironment(SIGNALS[signal].exporter) ?? "").split(",");

    return exporters.map((exporter) => exporter.trim()).includes(ExporterType.NONE);
  }

  static signalEndpoint(signal: DerivedSignal): string | undefined {
    return readEnvironment(SIGNALS[signal].endpoint);
  }

  static fromTraces(config: ITelemetryConfig, signal: DerivedSignal): IOtlpOptions | undefined {
    const traces = config.traces;

    if (traces?.exporter !== ExporterType.OTLP) {
      return undefined;
    }

    // a separately chosen endpoint may belong to another vendor, so the traces credentials stay behind
    if (OtlpDestinationFactory.signalEndpoint(signal)) {
      return { protocol: traces.otlp?.protocol };
    }

    const tracesUrl =
      OtlpDestinationFactory.nonBlank(traces.otlp?.url) ?? readEnvironment(OtlpEnvironmentVariable.TRACES_ENDPOINT);

    // an unset url leaves the exporter to the collector the traces fall back to
    if (!tracesUrl) {
      return { ...traces.otlp, url: undefined };
    }

    const url = OtlpDestinationFactory.signalUrl(tracesUrl, signal, traces.otlp?.protocol === OtlpProtocol.GRPC);

    return url ? { ...traces.otlp, url } : undefined;
  }

  // a block that only adds options would otherwise lose the collector and its auth headers, and with nothing to
  // follow the exporter would retry an unrelated local default for the life of the process
  static withoutUrl(config: ITelemetryConfig, signal: DerivedSignal, own: IOtlpOptions = {}): IOtlpOptions | undefined {
    const derived = OtlpDestinationFactory.fromTraces(config, signal);

    if (derived) {
      return { ...derived, ...own, url: derived.url };
    }

    if (OtlpDestinationFactory.signalEndpoint(signal) ?? readEnvironment(OtlpEnvironmentVariable.ENDPOINT)) {
      return { ...own, url: undefined };
    }

    return undefined;
  }

  static nonBlank(value: string | undefined): string | undefined {
    return value?.trim() ? value.trim() : undefined;
  }

  // parsing alone accepts `collector:4318/v1/traces` as scheme `collector:`, so the protocol is checked too
  private static signalUrl(tracesUrl: string, signal: DerivedSignal, grpc: boolean): string | undefined {
    // grpc carries no signal path, and its endpoints are often written without a scheme
    if (grpc) {
      return tracesUrl;
    }

    try {
      const url = new URL(tracesUrl);

      if (!WEB_PROTOCOLS.includes(url.protocol) || !TRACES_PATH.test(url.pathname)) {
        return undefined;
      }

      url.pathname = url.pathname.replace(TRACES_PATH, SIGNALS[signal].path);

      return url.toString();
    } catch {
      return undefined;
    }
  }
}

export default OtlpDestinationFactory;

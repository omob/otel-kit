import type { NodeSDK } from "@opentelemetry/sdk-node";
import { TelemetryErrorCode } from "../enums/telemetry-error-code.enum";
import TelemetryConfigError from "../errors/telemetry-config.error";
import type SdkFactory from "../factories/sdk.factory";
import { ITelemetryConfig } from "../telemetry.types";

const DEFAULT_SHUTDOWN_TIMEOUT_MILLIS = 5_000;
const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ["SIGTERM", "SIGINT"];

class TelemetryService {
  private sdk?: NodeSDK;
  private shutdownPromise?: Promise<void>;
  private signalHandlers = new Map<NodeJS.Signals, () => void>();

  start(config: ITelemetryConfig): void {
    if (this.sdk || config.enabled === false) {
      return;
    }

    try {
      this.startSdk(config);
    } catch (error) {
      this.reportStartupError(error as Error, config);
    }
  }

  async shutdown(timeoutMillis = DEFAULT_SHUTDOWN_TIMEOUT_MILLIS): Promise<void> {
    const sdk = this.sdk;

    if (!sdk) {
      return this.shutdownPromise ?? Promise.resolve();
    }

    this.sdk = undefined;
    this.removeShutdownHandlers();

    this.shutdownPromise = Promise.race([sdk.shutdown(), this.expireAfter(timeoutMillis)]).catch((error) => {
      this.sdk = sdk;
      throw error;
    });

    return this.shutdownPromise;
  }

  get isStarted(): boolean {
    return this.sdk !== undefined;
  }

  private startSdk(config: ITelemetryConfig): void {
    if (!config.serviceName) {
      throw new TelemetryConfigError(TelemetryErrorCode.MISSING_SERVICE_NAME, "serviceName is required");
    }

    const sdk = this.loadSdkFactory().createSdk(config);

    sdk.start();

    this.sdk = sdk;
    this.shutdownPromise = undefined;

    if (config.handleShutdownSignals !== false) {
      this.registerShutdownHandlers(config);
    }
  }

  // telemetry must never stop a service from booting, so a bad configuration disables it instead of throwing
  private reportStartupError(error: Error, config: ITelemetryConfig): void {
    if (config.onStartupError) {
      config.onStartupError(error);

      return;
    }

    console.error("@omob/otel-kit is disabled, its configuration was rejected:", error.message);
  }

  // the sdk drags in every exporter, so it stays out of the module graph of apps that only import the span helpers
  private loadSdkFactory(): typeof SdkFactory {
    return require("../factories/sdk.factory").default;
  }

  private registerShutdownHandlers(config: ITelemetryConfig): void {
    const timeoutMillis = config.shutdownTimeoutMillis ?? DEFAULT_SHUTDOWN_TIMEOUT_MILLIS;

    for (const signal of SHUTDOWN_SIGNALS) {
      const handler = () => {
        this.shutdown(timeoutMillis)
          .catch((error) => console.error("@omob/otel-kit failed to flush telemetry on shutdown", error))
          .finally(() => this.resumeSignal(signal, config.exitOnSignal === true));
      };

      this.signalHandlers.set(signal, handler);
      process.on(signal, handler);
    }
  }

  private removeShutdownHandlers(): void {
    this.signalHandlers.forEach((handler, signal) => process.removeListener(signal, handler));
    this.signalHandlers.clear();
  }

  // hand the signal back so the host's own handlers run and the process exits with the conventional code
  private resumeSignal(signal: NodeJS.Signals, exitOnSignal: boolean): void {
    if (exitOnSignal) {
      process.exit(0);
    }

    if (process.listenerCount(signal) === 0) {
      process.kill(process.pid, signal);
    }
  }

  private expireAfter(millis: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, millis).unref());
  }
}

export default new TelemetryService();

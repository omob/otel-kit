import type { NodeSDK } from "@opentelemetry/sdk-node";
import { TelemetryErrorCode } from "../enums/telemetry-error-code.enum";
import TelemetryConfigError from "../errors/telemetry-config.error";
import type SdkFactory from "../factories/sdk.factory";
import { ITelemetryConfig } from "../telemetry.types";

const DEFAULT_SHUTDOWN_TIMEOUT_MILLIS = 5_000;
const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ["SIGTERM", "SIGINT"];

class TelemetryService {
  private sdk?: NodeSDK;

  start(config: ITelemetryConfig): void {
    if (this.sdk || config.enabled === false) {
      return;
    }

    if (!config.serviceName) {
      throw new TelemetryConfigError(TelemetryErrorCode.MISSING_SERVICE_NAME, "serviceName is required");
    }

    this.sdk = this.loadSdkFactory().createSdk(config);
    this.sdk.start();

    if (config.handleShutdownSignals !== false) {
      this.registerShutdownHandlers(config.shutdownTimeoutMillis ?? DEFAULT_SHUTDOWN_TIMEOUT_MILLIS);
    }
  }

  async shutdown(timeoutMillis = DEFAULT_SHUTDOWN_TIMEOUT_MILLIS): Promise<void> {
    const sdk = this.sdk;

    if (!sdk) {
      return;
    }

    this.sdk = undefined;

    await Promise.race([sdk.shutdown(), this.expireAfter(timeoutMillis)]);
  }

  get isStarted(): boolean {
    return this.sdk !== undefined;
  }

  // the sdk drags in every exporter, so it stays out of the module graph of apps that only import the span helpers
  private loadSdkFactory(): typeof SdkFactory {
    return require("../factories/sdk.factory").default;
  }

  private registerShutdownHandlers(timeoutMillis: number): void {
    for (const signal of SHUTDOWN_SIGNALS) {
      process.once(signal, () => {
        this.shutdown(timeoutMillis)
          .catch((error) => console.error("otel-kit failed to flush telemetry on shutdown", error))
          .finally(() => process.exit(0));
      });
    }
  }

  private expireAfter(millis: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, millis).unref());
  }
}

export default new TelemetryService();

import {
  context,
  ContextManager,
  diag,
  DiagConsoleLogger,
  metrics,
  propagation,
  ProxyTracerProvider,
  TextMapPropagator,
  trace,
} from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import type { Instrumentation } from "@opentelemetry/instrumentation";
import type { NodeSDK } from "@opentelemetry/sdk-node";
import { TelemetryErrorCode } from "../enums/telemetry-error-code.enum";
import { TelemetryGlobal } from "../enums/telemetry-global.enum";
import TelemetryConfigError from "../errors/telemetry-config.error";
import type SdkFactory from "../factories/sdk.factory";
import { ICpuUsageHandle, ITelemetryConfig } from "../telemetry.types";
import { observeCpuUsage } from "./cpu-usage.service";

const DEFAULT_SHUTDOWN_TIMEOUT_MILLIS = 5_000;
const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ["SIGTERM", "SIGINT"];
const PROVIDER_GLOBALS = [TelemetryGlobal.TRACER_PROVIDER, TelemetryGlobal.METER_PROVIDER, TelemetryGlobal.LOGGER_PROVIDER];
const RELEASE_GLOBAL: Record<TelemetryGlobal, () => void> = {
  [TelemetryGlobal.TRACER_PROVIDER]: () => trace.disable(),
  [TelemetryGlobal.METER_PROVIDER]: () => metrics.disable(),
  [TelemetryGlobal.LOGGER_PROVIDER]: () => logs.disable(),
  [TelemetryGlobal.PROPAGATOR]: () => propagation.disable(),
  [TelemetryGlobal.CONTEXT_MANAGER]: () => context.disable(),
};

class TelemetryService {
  private sdk?: NodeSDK;
  private shutdownPromise?: Promise<void>;
  private cpuUsage?: ICpuUsageHandle;
  private instrumentations?: Instrumentation[];
  private ownedGlobals: TelemetryGlobal[] = [];
  private startCount = 0;
  private signalHandlers = new Map<NodeJS.Signals, () => void>();

  start(config: ITelemetryConfig): void {
    if (this.sdk || config.enabled === false) {
      return;
    }

    try {
      this.startSdk(config);
    } catch (error) {
      this.releaseGlobals();
      this.reportStartupError(error as Error, config);
    }
  }

  async shutdown(timeoutMillis = DEFAULT_SHUTDOWN_TIMEOUT_MILLIS): Promise<void> {
    const sdk = this.sdk;

    if (!sdk) {
      return this.shutdownPromise ?? Promise.resolve();
    }

    const cpuUsage = this.cpuUsage;
    const startCountAtShutdown = this.startCount;

    this.sdk = undefined;
    this.cpuUsage = undefined;
    this.removeShutdownHandlers();
    // the flush does not need them, and freeing them now lets a start() during the flush register its own
    this.releaseProviders();

    this.shutdownPromise = Promise.race([sdk.shutdown(), this.expireAfter(timeoutMillis)]).then(
      () => cpuUsage?.stop(),
      (error) => {
        if (this.startCount === startCountAtShutdown) {
          this.sdk = sdk;
          this.cpuUsage = cpuUsage;
        } else {
          cpuUsage?.stop();
        }

        throw error;
      }
    );

    return this.shutdownPromise;
  }

  get isStarted(): boolean {
    return this.sdk !== undefined;
  }

  private startSdk(config: ITelemetryConfig): void {
    if (!config.serviceName) {
      throw new TelemetryConfigError(TelemetryErrorCode.MISSING_SERVICE_NAME, "serviceName is required");
    }

    this.configureDiagnostics(config);

    const sdkFactory = this.loadSdkFactory();
    const propagator = sdkFactory.createPropagator(config);
    // a fresh set cannot patch modules the app already loaded, so a restart keeps the first set and sdk.start() rebinds it
    const sdk = sdkFactory.createSdk(config, () => (this.instrumentations ??= sdkFactory.createInstrumentations(config)));
    const contextManager = sdkFactory.createContextManager();

    // released here rather than at shutdown, so requests a host is still draining keep context and propagation
    this.releaseGlobals();

    const providersBefore = this.globalProviders();

    const sdkEnabled = !sdkFactory.isDisabledByEnvironment();

    if (sdkEnabled) {
      this.registerContext(propagator, contextManager);
    }

    try {
      sdk.start();
    } finally {
      const providersAfter = this.globalProviders();

      this.ownedGlobals.push(...PROVIDER_GLOBALS.filter((provider) => providersBefore[provider] !== providersAfter[provider]));
    }

    this.sdk = sdk;
    this.startCount += 1;
    this.shutdownPromise = undefined;

    // registered after start so the instrument binds to the sdk's meter provider, not the no-op global
    if (sdkEnabled && config.metrics?.cpuUsage) {
      this.cpuUsage = observeCpuUsage();
    }

    if (config.handleShutdownSignals !== false) {
      this.registerShutdownHandlers(config);
    }
  }

  private registerContext(propagator: TextMapPropagator, contextManager: ContextManager): void {
    if (propagation.setGlobalPropagator(propagator)) {
      this.ownedGlobals.push(TelemetryGlobal.PROPAGATOR);
    }

    if (context.setGlobalContextManager(contextManager)) {
      contextManager.enable();
      this.ownedGlobals.push(TelemetryGlobal.CONTEXT_MANAGER);
    }
  }

  // NodeSDK discards whether its registrations were accepted, so ownership is read off the globals it may have replaced
  private globalProviders(): Record<string, unknown> {
    return {
      [TelemetryGlobal.TRACER_PROVIDER]: (trace.getTracerProvider() as ProxyTracerProvider).getDelegate(),
      [TelemetryGlobal.METER_PROVIDER]: metrics.getMeterProvider(),
      [TelemetryGlobal.LOGGER_PROVIDER]: logs.getLoggerProvider(),
    };
  }

  private releaseProviders(): void {
    const providers = this.ownedGlobals.filter((owned) => PROVIDER_GLOBALS.includes(owned));

    providers.forEach((provider) => RELEASE_GLOBAL[provider]());
    this.ownedGlobals = this.ownedGlobals.filter((owned) => !providers.includes(owned));
  }

  // the api refuses a second registration of any global, so a restarted sdk would otherwise feed the shut-down providers
  private releaseGlobals(): void {
    this.ownedGlobals.forEach((owned) => RELEASE_GLOBAL[owned]());
    this.ownedGlobals = [];
  }

  // otel writes its own failures through diag, which discards everything until a logger is installed
  private configureDiagnostics(config: ITelemetryConfig): void {
    if (config.diagLogLevel === undefined) {
      return;
    }

    diag.setLogger(config.diagLogger ?? new DiagConsoleLogger(), config.diagLogLevel);
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

import { ExporterType } from "../../src/enums/exporter-type.enum";
import { TelemetryErrorCode } from "../../src/enums/telemetry-error-code.enum";
import Telemetry from "../../src/services/telemetry.service";
import { ITelemetryConfig } from "../../src/telemetry.types";

const silentConfig: ITelemetryConfig = {
  serviceName: "kreela-api",
  traces: { exporter: ExporterType.NONE },
  metrics: { exporter: ExporterType.NONE },
  logs: { exporter: ExporterType.NONE },
  handleShutdownSignals: false,
};

const SIGNALS: NodeJS.Signals[] = ["SIGTERM", "SIGINT"];

const startAndCaptureSignalListeners = (config: ITelemetryConfig) => {
  const existing = new Map(SIGNALS.map((signal) => [signal, process.listeners(signal)]));

  Telemetry.start(config);

  const added = new Map(
    SIGNALS.map((signal) => [
      signal,
      process.listeners(signal).filter((listener) => !existing.get(signal)!.includes(listener)),
    ])
  );

  added.forEach((listeners, signal) => listeners.forEach((listener) => process.removeListener(signal, listener)));

  return added;
};

const withFakeInstrumentation = () => {
  const SdkFactory = require("../../src/factories/sdk.factory").default;
  let FreshTelemetry = Telemetry;

  jest.isolateModules(() => {
    FreshTelemetry = require("../../src/services/telemetry.service").default;
  });

  const instrumentation = {
    instrumentationName: "fake",
    instrumentationVersion: "1.0.0",
    getConfig: () => ({ enabled: true }),
    setConfig: jest.fn(),
    setTracerProvider: jest.fn(),
    setMeterProvider: jest.fn(),
    enable: jest.fn(),
  };
  const create = jest.spyOn(SdkFactory, "createInstrumentations").mockReturnValue([instrumentation]);

  return { FreshTelemetry, instrumentation, create };
};

afterEach(() => Telemetry.shutdown());

describe("Telemetry.start", () => {
  it("does nothing when telemetry is disabled", () => {
    Telemetry.start({ ...silentConfig, enabled: false });

    expect(Telemetry.isStarted).toBe(false);
  });

  it("disables itself rather than letting a bad configuration stop the host from booting", () => {
    const onStartupError = jest.fn();

    expect(() => Telemetry.start({ ...silentConfig, serviceName: "", onStartupError })).not.toThrow();

    expect(onStartupError).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: TelemetryErrorCode.MISSING_SERVICE_NAME })
    );
    expect(Telemetry.isStarted).toBe(false);
  });

  it("stays retryable after a rejected configuration", () => {
    Telemetry.start({ ...silentConfig, traces: { exporter: "nope" as ExporterType }, onStartupError: jest.fn() });

    expect(Telemetry.isStarted).toBe(false);

    Telemetry.start(silentConfig);

    expect(Telemetry.isStarted).toBe(true);
  });

  it("starts the sdk once and ignores repeat calls", () => {
    Telemetry.start(silentConfig);

    expect(Telemetry.isStarted).toBe(true);
    expect(() => Telemetry.start({ ...silentConfig, serviceName: "" })).not.toThrow();
    expect(Telemetry.isStarted).toBe(true);
  });

  it("registers one flush handler per shutdown signal by default", () => {
    const added = startAndCaptureSignalListeners({ ...silentConfig, handleShutdownSignals: undefined });

    SIGNALS.forEach((signal) => expect(added.get(signal)).toHaveLength(1));
  });

  it("leaves the shutdown signals alone when the host app owns them", () => {
    const added = startAndCaptureSignalListeners(silentConfig);

    SIGNALS.forEach((signal) => expect(added.get(signal)).toHaveLength(0));
  });
});

describe("Telemetry cpu usage", () => {
  const cpuUsageService = require("../../src/services/cpu-usage.service");

  afterEach(() => jest.restoreAllMocks());

  it("observes cpu usage after the sdk starts when asked to", async () => {
    const { metrics } = require("@opentelemetry/api");
    const stop = jest.fn();
    let providerAtObserve: unknown;
    const observe = jest.spyOn(cpuUsageService, "observeCpuUsage").mockImplementation(() => {
      providerAtObserve = metrics.getMeterProvider();
      return { stop };
    });
    const noopProvider = metrics.getMeterProvider();

    Telemetry.start({ ...silentConfig, metrics: { exporter: ExporterType.OTLP, cpuUsage: true } });

    expect(observe).toHaveBeenCalledTimes(1);
    expect(providerAtObserve).not.toBe(noopProvider);

    await Telemetry.shutdown();

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("keeps observing when a failed shutdown puts the sdk back", async () => {
    const stop = jest.fn();
    jest.spyOn(cpuUsageService, "observeCpuUsage").mockReturnValue({ stop });
    const { NodeSDK } = require("@opentelemetry/sdk-node");
    jest.spyOn(NodeSDK.prototype, "shutdown").mockRejectedValueOnce(new Error("exporter down"));

    Telemetry.start({ ...silentConfig, metrics: { exporter: ExporterType.NONE, cpuUsage: true } });

    await expect(Telemetry.shutdown()).rejects.toThrow("exporter down");
    expect(stop).not.toHaveBeenCalled();

    await Telemetry.shutdown();

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, false])("leaves cpu usage alone when cpuUsage is %p", (cpuUsage) => {
    const observe = jest.spyOn(cpuUsageService, "observeCpuUsage");

    Telemetry.start({ ...silentConfig, metrics: { exporter: ExporterType.NONE, cpuUsage } });

    expect(observe).not.toHaveBeenCalled();
  });
});

describe("Telemetry diagnostics", () => {
  it("stays silent about its own internals unless a level is configured", () => {
    const { diag } = require("@opentelemetry/api");
    const setLogger = jest.spyOn(diag, "setLogger");

    Telemetry.start(silentConfig);

    expect(setLogger).not.toHaveBeenCalled();

    setLogger.mockRestore();
  });

  it("routes otel's own failures to the supplied logger", () => {
    const { diag, DiagLogLevel } = require("@opentelemetry/api");
    const setLogger = jest.spyOn(diag, "setLogger");
    const diagLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(), verbose: jest.fn() };

    Telemetry.start({ ...silentConfig, diagLogLevel: DiagLogLevel.ERROR, diagLogger });

    expect(setLogger).toHaveBeenCalledWith(diagLogger, DiagLogLevel.ERROR);

    setLogger.mockRestore();
  });
});

describe("Telemetry shutdown handlers", () => {
  it("removes its signal listeners on shutdown so restarts do not leak them", async () => {
    const before = SIGNALS.map((signal) => process.listenerCount(signal));

    Telemetry.start({ ...silentConfig, handleShutdownSignals: undefined });
    await Telemetry.shutdown();

    SIGNALS.forEach((signal, index) => expect(process.listenerCount(signal)).toBe(before[index]));
  });
});

describe("Telemetry.shutdown", () => {
  it("resolves when telemetry was never started", async () => {
    await expect(Telemetry.shutdown()).resolves.toBeUndefined();
  });

  it("releases the sdk so a later start succeeds", async () => {
    Telemetry.start(silentConfig);
    await Telemetry.shutdown();

    expect(Telemetry.isStarted).toBe(false);

    Telemetry.start(silentConfig);

    expect(Telemetry.isStarted).toBe(true);
  });

  it("hands the global providers to the sdk of a later start", async () => {
    const { metrics, trace } = require("@opentelemetry/api");
    const { logs } = require("@opentelemetry/api-logs");
    const exporting: ITelemetryConfig = {
      ...silentConfig,
      traces: { exporter: ExporterType.CONSOLE },
      metrics: { exporter: ExporterType.CONSOLE, exportIntervalMillis: 60_000 },
      logs: { exporter: ExporterType.CONSOLE },
    };
    jest.spyOn(console, "dir").mockImplementation(() => undefined);
    const providers = () => [metrics.getMeterProvider(), trace.getTracerProvider().getDelegate(), logs.getLoggerProvider()];

    Telemetry.start(exporting);
    const first = providers();
    await Telemetry.shutdown();

    Telemetry.start(exporting);
    const second = providers();

    second.forEach((provider, index) => expect(provider).not.toBe(first[index]));

    await Telemetry.shutdown();
    jest.restoreAllMocks();
  });

  it("rebinds the first set of instrumentations to the sdk of a later start", async () => {
    const { FreshTelemetry, instrumentation, create } = withFakeInstrumentation();

    FreshTelemetry.start(silentConfig);
    await FreshTelemetry.shutdown();
    FreshTelemetry.start(silentConfig);

    expect(create).toHaveBeenCalledTimes(1);
    expect(instrumentation.setTracerProvider).toHaveBeenCalledTimes(2);

    await FreshTelemetry.shutdown();
    create.mockRestore();
  });

  it("patches nothing for a rejected configuration", () => {
    const { FreshTelemetry, create } = withFakeInstrumentation();

    FreshTelemetry.start({ ...silentConfig, traces: { exporter: "nope" as ExporterType }, onStartupError: jest.fn() });

    expect(create).not.toHaveBeenCalled();

    FreshTelemetry.start(silentConfig);

    expect(FreshTelemetry.isStarted).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);

    create.mockRestore();
    return FreshTelemetry.shutdown();
  });

  it("ignores a start while a shutdown is still in progress", async () => {
    Telemetry.start(silentConfig);
    const pending = Telemetry.shutdown();

    Telemetry.start(silentConfig);

    expect(Telemetry.isStarted).toBe(false);

    await pending;
    Telemetry.start(silentConfig);

    expect(Telemetry.isStarted).toBe(true);
  });

  it("leaves a provider the host registered itself in place", async () => {
    const { metrics } = require("@opentelemetry/api");
    const { MeterProvider } = require("@opentelemetry/sdk-metrics");
    const hostProvider = new MeterProvider();

    metrics.setGlobalMeterProvider(hostProvider);
    Telemetry.start(silentConfig);
    await Telemetry.shutdown();

    expect(metrics.getMeterProvider()).toBe(hostProvider);

    metrics.disable();
  });

  it("leaves a context manager and propagator the host registered itself in place", async () => {
    const { context, propagation, createContextKey, ROOT_CONTEXT } = require("@opentelemetry/api");
    const { AsyncLocalStorageContextManager } = require("@opentelemetry/context-async-hooks");
    const { W3CBaggagePropagator } = require("@opentelemetry/core");
    const key = createContextKey("host");
    const hostManager = new AsyncLocalStorageContextManager().enable();

    context.setGlobalContextManager(hostManager);
    propagation.setGlobalPropagator(new W3CBaggagePropagator());
    Telemetry.start(silentConfig);
    await Telemetry.shutdown();

    expect(context.with(ROOT_CONTEXT.setValue(key, "kept"), () => context.active().getValue(key))).toBe("kept");
    expect(propagation.fields()).toEqual(["baggage"]);

    context.disable();
    propagation.disable();
  });
});

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
});

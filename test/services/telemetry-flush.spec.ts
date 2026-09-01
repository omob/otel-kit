const mockShutdown = jest.fn();

jest.mock("@opentelemetry/sdk-node", () => ({
  NodeSDK: class {
    start() {
      return undefined;
    }

    shutdown() {
      return mockShutdown();
    }
  },
}));

import Telemetry from "../../src/services/telemetry.service";

const start = () => Telemetry.start({ serviceName: "kreela-api", handleShutdownSignals: false });

describe("Telemetry.shutdown", () => {
  it("gives up on a stalled exporter once the timeout elapses", async () => {
    mockShutdown.mockReturnValue(new Promise(() => undefined));
    start();

    await expect(Telemetry.shutdown(20)).resolves.toBeUndefined();
    expect(Telemetry.isStarted).toBe(false);
  });

  it("surfaces an exporter that fails to flush", async () => {
    mockShutdown.mockRejectedValue(new Error("collector unreachable"));
    start();

    await expect(Telemetry.shutdown()).rejects.toThrow("collector unreachable");
  });

  it("makes concurrent callers wait for the same flush", async () => {
    let settle: () => void = () => undefined;
    mockShutdown.mockReturnValue(new Promise<void>((resolve) => (settle = resolve)));
    start();

    let firstDone = false;
    let secondDone = false;
    const first = Telemetry.shutdown().then(() => (firstDone = true));
    const second = Telemetry.shutdown().then(() => (secondDone = true));

    await Promise.resolve();

    expect(firstDone).toBe(false);
    expect(secondDone).toBe(false);

    settle();
    await Promise.all([first, second]);

    expect(mockShutdown).toHaveBeenCalledTimes(1);
  });

  it("keeps the sdk so a failed flush can be retried", async () => {
    mockShutdown.mockRejectedValue(new Error("collector unreachable"));
    start();

    await expect(Telemetry.shutdown()).rejects.toThrow("collector unreachable");

    expect(Telemetry.isStarted).toBe(true);

    mockShutdown.mockResolvedValue(undefined);
    await Telemetry.shutdown();

    expect(Telemetry.isStarted).toBe(false);
  });

  it("flushes only once across repeated calls", async () => {
    mockShutdown.mockResolvedValue(undefined);
    start();

    await Telemetry.shutdown();
    await Telemetry.shutdown();

    expect(mockShutdown).toHaveBeenCalledTimes(1);
  });
});

import { AggregationTemporality, InMemoryMetricExporter, MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { metrics } from "@opentelemetry/api";
import { observeConnectionPool } from "../../src/services/connection-pool.service";

const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
const provider = new MeterProvider({ readers: [reader] });

const collect = async () => {
  exporter.reset();
  await reader.forceFlush();

  const metricsByName = new Map<string, { value: number; attributes: Record<string, unknown> }[]>();

  for (const resource of exporter.getMetrics()) {
    for (const scope of resource.scopeMetrics) {
      for (const metric of scope.metrics) {
        metricsByName.set(
          metric.descriptor.name,
          metric.dataPoints.map((point) => ({ value: point.value as number, attributes: point.attributes }))
        );
      }
    }
  }

  return metricsByName;
};

beforeAll(() => metrics.setGlobalMeterProvider(provider));
afterAll(async () => provider.shutdown());

describe("observeConnectionPool", () => {
  it("reports the pool's limit, usage and queue under the standard metric names", async () => {
    const handle = observeConnectionPool({
      name: "biller",
      system: "postgresql",
      read: () => ({ max: 5, used: 5, idle: 0, pending: 35 }),
    });

    const collected = await collect();

    expect(collected.get("db.client.connection.max")?.[0].value).toBe(5);
    expect(collected.get("db.client.connection.pending_requests")?.[0].value).toBe(35);

    const counts = collected.get("db.client.connection.count") ?? [];
    const used = counts.find((p) => p.attributes["db.client.connection.state"] === "used");
    const idle = counts.find((p) => p.attributes["db.client.connection.state"] === "idle");

    expect(used?.value).toBe(5);
    expect(idle?.value).toBe(0);
    expect(used?.attributes["db.client.connection.pool.name"]).toBe("biller");
    expect(used?.attributes["db.system.name"]).toBe("postgresql");

    handle.stop();
  });

  it("records how long callers waited for a connection, in seconds", async () => {
    const handle = observeConnectionPool({ name: "waits", read: () => ({ max: 1, used: 1, idle: 0, pending: 0 }) });

    handle.recordWait(344);

    const waits = (await collect()).get("db.client.connection.wait_time") ?? [];

    expect((waits[0].value as unknown as { sum: number }).sum).toBeCloseTo(0.344, 3);

    handle.stop();
  });

  it("ignores waits recorded after the pool is no longer observed", async () => {
    const handle = observeConnectionPool({ name: "stale", read: () => ({ max: 1, used: 0, idle: 1, pending: 0 }) });

    handle.stop();
    handle.recordWait(500);

    const waits = (await collect()).get("db.client.connection.wait_time") ?? [];

    expect(waits.some((p) => p.attributes["db.client.connection.pool.name"] === "stale")).toBe(false);
  });

  it("adds pools that share a name into one series", async () => {
    const primary = observeConnectionPool({ name: "ledger", read: () => ({ max: 10, used: 4, idle: 6, pending: 1 }) });
    const replica = observeConnectionPool({ name: "ledger", read: () => ({ max: 5, used: 5, idle: 0, pending: 3 }) });

    const collected = await collect();
    const ledger = (name: string) =>
      (collected.get(name) ?? []).filter((p) => p.attributes["db.client.connection.pool.name"] === "ledger");

    expect(ledger("db.client.connection.max").map((p) => p.value)).toEqual([15]);
    expect(ledger("db.client.connection.pending_requests").map((p) => p.value)).toEqual([4]);
    expect(ledger("db.client.connection.count").find((p) => p.attributes["db.client.connection.state"] === "used")?.value).toBe(9);

    primary.stop();
    replica.stop();
  });

  it("keeps a shared series going until its last pool stops", async () => {
    const readPrimary = jest.fn(() => ({ max: 10, used: 1, idle: 9, pending: 0 }));
    const readReplica = jest.fn(() => ({ max: 5, used: 1, idle: 4, pending: 0 }));
    const primary = observeConnectionPool({ name: "shared", read: readPrimary });
    const replica = observeConnectionPool({ name: "shared", read: readReplica });
    const sharedMax = async () =>
      ((await collect()).get("db.client.connection.max") ?? [])
        .filter((p) => p.attributes["db.client.connection.pool.name"] === "shared")
        .map((p) => p.value);

    primary.stop();

    expect(await sharedMax()).toEqual([5]);

    replica.stop();
    primary.stop();
    readPrimary.mockClear();
    readReplica.mockClear();
    await collect();

    expect(readPrimary).not.toHaveBeenCalled();
    expect(readReplica).not.toHaveBeenCalled();
  });

  it("leaves out a pool whose read throws, and keeps the rest of its group", async () => {
    const healthy = observeConnectionPool({ name: "flaky", read: () => ({ max: 5, used: 2, idle: 3, pending: 0 }) });
    const broken = observeConnectionPool({
      name: "flaky",
      read: () => {
        throw new Error("pool closed");
      },
    });

    const max = ((await collect()).get("db.client.connection.max") ?? []).filter(
      (p) => p.attributes["db.client.connection.pool.name"] === "flaky"
    );

    expect(max.map((p) => p.value)).toEqual([5]);

    healthy.stop();
    broken.stop();
  });

  it("reports nothing, rather than zeros, when no pool in a group can be read", async () => {
    const broken = observeConnectionPool({
      name: "unreadable",
      read: () => {
        throw new Error("pool closed");
      },
    });

    const reported = ((await collect()).get("db.client.connection.max") ?? []).some(
      (p) => p.attributes["db.client.connection.pool.name"] === "unreadable"
    );

    expect(reported).toBe(false);

    broken.stop();
  });

  it("warns when a pool joins a group under a different system", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const first = observeConnectionPool({ name: "mixed", system: "postgresql", read: () => ({ max: 1, used: 0, idle: 1, pending: 0 }) });
    const second = observeConnectionPool({ name: "mixed", system: "mysql", read: () => ({ max: 1, used: 0, idle: 1, pending: 0 }) });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("mixed"));

    first.stop();
    second.stop();
    warn.mockRestore();
  });

  it("stops reporting once the pool is no longer observed", async () => {
    const handle = observeConnectionPool({ name: "gone", read: () => ({ max: 9, used: 1, idle: 8, pending: 0 }) });

    handle.stop();

    const collected = await collect();
    const reported = (collected.get("db.client.connection.max") ?? []).some(
      (p) => p.attributes["db.client.connection.pool.name"] === "gone"
    );

    expect(reported).toBe(false);
  });
});

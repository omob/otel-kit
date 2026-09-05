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

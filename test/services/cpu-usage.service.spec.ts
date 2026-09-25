import { AggregationTemporality, InMemoryMetricExporter, MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { metrics } from "@opentelemetry/api";
import { observeCpuUsage } from "../../src/services/cpu-usage.service";

const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
const provider = new MeterProvider({ readers: [reader] });

const collectCpuTime = async () => {
  exporter.reset();
  await reader.forceFlush();

  return exporter
    .getMetrics()
    .flatMap((resource) => resource.scopeMetrics)
    .flatMap((scope) => scope.metrics)
    .filter((metric) => metric.descriptor.name === "process.cpu.time")
    .flatMap((metric) => metric.dataPoints.map((point) => ({ value: point.value as number, attributes: point.attributes })));
};

beforeAll(() => metrics.setGlobalMeterProvider(provider));
afterAll(async () => provider.shutdown());

describe("observeCpuUsage", () => {
  it("reports user and system cpu time in seconds, one series per mode", async () => {
    const handle = observeCpuUsage(() => ({ user: 2_500_000, system: 750_000 }));

    const points = await collectCpuTime();

    expect(points).toHaveLength(2);
    expect(points.find((p) => p.attributes["cpu.mode"] === "user")?.value).toBe(2.5);
    expect(points.find((p) => p.attributes["cpu.mode"] === "system")?.value).toBe(0.75);

    handle.stop();
  });

  it("stops reading once no longer observed", async () => {
    const read = jest.fn(() => ({ user: 1, system: 1 }));
    const handle = observeCpuUsage(read);

    handle.stop();
    await collectCpuTime();

    expect(read).not.toHaveBeenCalled();
  });

  it("reads the process's own usage by default", async () => {
    const handle = observeCpuUsage();

    const points = await collectCpuTime();

    expect(points.find((p) => p.attributes["cpu.mode"] === "user")?.value).toBeGreaterThan(0);

    handle.stop();
  });
});

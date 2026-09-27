import { AggregationTemporality, InMemoryMetricExporter, MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { metrics } from "@opentelemetry/api";
import { getHeapStatistics } from "node:v8";
import { observeHeapLimit } from "../../src/services/heap-limit.service";

const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
const provider = new MeterProvider({ readers: [reader] });

const collectHeapLimit = async () => {
  exporter.reset();
  await reader.forceFlush();

  return exporter
    .getMetrics()
    .flatMap((resource) => resource.scopeMetrics)
    .flatMap((scope) => scope.metrics)
    .filter((metric) => metric.descriptor.name === "ritele.v8js.memory.heap.limit");
};

beforeAll(() => metrics.setGlobalMeterProvider(provider));
afterAll(async () => provider.shutdown());

describe("observeHeapLimit", () => {
  it("reports the V8 heap ceiling in bytes", async () => {
    const handle = observeHeapLimit(() => 4_345_298_944);

    const [heapLimit] = await collectHeapLimit();

    expect(heapLimit.descriptor.unit).toBe("By");
    expect(heapLimit.dataPoints.map((point) => point.value)).toEqual([4_345_298_944]);

    handle.stop();
  });

  it("reads the process's own heap_size_limit by default", async () => {
    const handle = observeHeapLimit();

    const [heapLimit] = await collectHeapLimit();

    expect(heapLimit.dataPoints[0].value).toBe(getHeapStatistics().heap_size_limit);

    handle.stop();
  });

  it("stops reading once no longer observed", async () => {
    const read = jest.fn(() => 1);
    const handle = observeHeapLimit(read);

    handle.stop();
    await collectHeapLimit();

    expect(read).not.toHaveBeenCalled();
  });
});

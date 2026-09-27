import { metrics, ObservableResult } from "@opentelemetry/api";
import { getHeapStatistics } from "node:v8";
import { RuntimeMetric } from "../enums/runtime-metric.enum";
import { InstrumentationScope } from "../enums/instrumentation-scope.enum";
import { IMetricObserverHandle } from "../telemetry.types";

export function observeHeapLimit(read: () => number = () => getHeapStatistics().heap_size_limit): IMetricObserverHandle {
  const heapLimit = metrics.getMeter(InstrumentationScope.KIT).createObservableGauge(RuntimeMetric.HEAP_LIMIT, { unit: "By" });

  const observe = (observer: ObservableResult) => observer.observe(read());

  heapLimit.addCallback(observe);

  return { stop: () => heapLimit.removeCallback(observe) };
}

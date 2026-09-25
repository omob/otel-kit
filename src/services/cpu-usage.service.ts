import { metrics, ObservableResult } from "@opentelemetry/api";
import { CpuMode, CpuUsageAttribute, CpuUsageMetric } from "../enums/cpu-usage-metric.enum";
import { ICpuUsageHandle, ICpuUsageReading } from "../telemetry.types";

const METER_NAME = "@omob/otel-kit";
const MICROSECONDS_PER_SECOND = 1_000_000;

export function observeCpuUsage(read: () => ICpuUsageReading = () => process.cpuUsage()): ICpuUsageHandle {
  const cpuTime = metrics.getMeter(METER_NAME).createObservableCounter(CpuUsageMetric.CPU_TIME, { unit: "s" });

  const observe = (observer: ObservableResult) => {
    const usage = read();

    observer.observe(usage.user / MICROSECONDS_PER_SECOND, { [CpuUsageAttribute.MODE]: CpuMode.USER });
    observer.observe(usage.system / MICROSECONDS_PER_SECOND, { [CpuUsageAttribute.MODE]: CpuMode.SYSTEM });
  };

  cpuTime.addCallback(observe);

  return { stop: () => cpuTime.removeCallback(observe) };
}

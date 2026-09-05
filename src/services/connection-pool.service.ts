import { BatchObservableResult, metrics, ObservableGauge } from "@opentelemetry/api";
import { ConnectionPoolAttribute, ConnectionPoolMetric, ConnectionPoolState } from "../enums/connection-pool-metric.enum";
import { IConnectionPoolHandle, IConnectionPoolOptions } from "../telemetry.types";

const METER_NAME = "@omob/otel-kit";

export function observeConnectionPool(options: IConnectionPoolOptions): IConnectionPoolHandle {
  const meter = metrics.getMeter(METER_NAME);

  const attributes = {
    [ConnectionPoolAttribute.POOL_NAME]: options.name,
    ...(options.system ? { [ConnectionPoolAttribute.SYSTEM]: options.system } : {}),
  };

  const max = meter.createObservableGauge(ConnectionPoolMetric.MAX, { unit: "{connection}" });
  const count = meter.createObservableGauge(ConnectionPoolMetric.COUNT, { unit: "{connection}" });
  const pending = meter.createObservableGauge(ConnectionPoolMetric.PENDING_REQUESTS, { unit: "{request}" });
  // the sdk's default buckets top out at 10000, which is shaped for milliseconds and puts every wait in the first bucket
  const waitTime = meter.createHistogram(ConnectionPoolMetric.WAIT_TIME, {
    unit: "s",
    advice: { explicitBucketBoundaries: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10] },
  });

  const gauges: ObservableGauge[] = [max, count, pending];

  const collect = (observer: BatchObservableResult) => {
    const snapshot = options.read();

    observer.observe(max, snapshot.max, attributes);
    observer.observe(count, snapshot.used, { ...attributes, [ConnectionPoolAttribute.STATE]: ConnectionPoolState.USED });
    observer.observe(count, snapshot.idle, { ...attributes, [ConnectionPoolAttribute.STATE]: ConnectionPoolState.IDLE });
    observer.observe(pending, snapshot.pending, attributes);
  };

  meter.addBatchObservableCallback(collect, gauges);

  let observing = true;

  return {
    recordWait: (millis: number) => {
      if (observing) {
        waitTime.record(millis / 1000, attributes);
      }
    },
    stop: () => {
      observing = false;
      meter.removeBatchObservableCallback(collect, gauges);
    },
  };
}

import { BatchObservableResult, diag, Meter, metrics, ObservableGauge } from "@opentelemetry/api";
import { ConnectionPoolAttribute, ConnectionPoolMetric, ConnectionPoolState } from "../enums/connection-pool-metric.enum";
import { InstrumentationScope } from "../enums/instrumentation-scope.enum";
import { IConnectionPoolHandle, IConnectionPoolOptions, IConnectionPoolSnapshot } from "../telemetry.types";
import { IConnectionPoolGroup, IConnectionPoolMember } from "./connection-pool.types";
import { warn } from "../utils/warn";

// keyed by meter, so pools registered after a restart never join a group bound to the shut-down provider
const groupsByMeter = new WeakMap<Meter, Map<string, IConnectionPoolGroup>>();

export function observeConnectionPool(options: IConnectionPoolOptions): IConnectionPoolHandle {
  const meter = metrics.getMeter(InstrumentationScope.KIT);
  const groups = groupsByMeter.get(meter) ?? new Map<string, IConnectionPoolGroup>();

  groupsByMeter.set(meter, groups);

  // pools sharing a name are one pool to the database, such as a primary and a replica on the same host
  const existing = groups.get(options.name);

  if (existing && existing.system !== options.system) {
    warn(
      `@omob/otel-kit reports pool "${options.name}" as ${existing.system ?? "no system"}, as first registered, not ${options.system ?? "no system"}`
    );
  }

  const group = existing ?? createGroup(meter, options);
  const member: IConnectionPoolMember = { read: options.read };

  groups.set(options.name, group);
  group.members.add(member);

  let observing = true;

  return {
    recordWait: (millis: number) => {
      if (observing) {
        group.waitTime.record(millis / 1000, group.attributes);
      }
    },
    stop: () => {
      if (!observing) {
        return;
      }

      observing = false;
      group.members.delete(member);

      if (group.members.size === 0) {
        group.stop();
        groups.delete(options.name);
      }
    },
  };
}

function createGroup(meter: Meter, options: IConnectionPoolOptions): IConnectionPoolGroup {
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
  const members = new Set<IConnectionPoolMember>();

  const collect = (observer: BatchObservableResult) => {
    const readings = [...members].flatMap(readSafely);

    // zeros would make a pool that can't be read look like an empty one
    if (readings.length === 0) {
      return;
    }

    const snapshot = sumSnapshots(readings);

    observer.observe(max, snapshot.max, attributes);
    observer.observe(count, snapshot.used, { ...attributes, [ConnectionPoolAttribute.STATE]: ConnectionPoolState.USED });
    observer.observe(count, snapshot.idle, { ...attributes, [ConnectionPoolAttribute.STATE]: ConnectionPoolState.IDLE });
    observer.observe(pending, snapshot.pending, attributes);
  };

  meter.addBatchObservableCallback(collect, gauges);

  return {
    members,
    system: options.system,
    attributes,
    waitTime,
    stop: () => meter.removeBatchObservableCallback(collect, gauges),
  };
}

// one pool failing to report must not take the others in its group down with it
function readSafely(member: IConnectionPoolMember): IConnectionPoolSnapshot[] {
  try {
    return [member.read()];
  } catch (error) {
    diag.debug(`@omob/otel-kit skipped a connection pool reading: ${(error as Error).message}`);

    return [];
  }
}

function sumSnapshots(snapshots: IConnectionPoolSnapshot[]): IConnectionPoolSnapshot {
  return snapshots.reduce(
    (total, snapshot) => ({
      max: total.max + snapshot.max,
      used: total.used + snapshot.used,
      idle: total.idle + snapshot.idle,
      pending: total.pending + snapshot.pending,
    }),
    { max: 0, used: 0, idle: 0, pending: 0 }
  );
}

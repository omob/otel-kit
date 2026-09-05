// the semantic conventions for these are still incubating, whose subpath export only resolves under node16
export enum ConnectionPoolMetric {
  COUNT = "db.client.connection.count",
  MAX = "db.client.connection.max",
  PENDING_REQUESTS = "db.client.connection.pending_requests",
  WAIT_TIME = "db.client.connection.wait_time",
}

export enum ConnectionPoolAttribute {
  POOL_NAME = "db.client.connection.pool.name",
  STATE = "db.client.connection.state",
  SYSTEM = "db.system.name",
}

export enum ConnectionPoolState {
  USED = "used",
  IDLE = "idle",
}

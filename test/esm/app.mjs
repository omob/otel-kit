import { Redis } from "ioredis";

// @opentelemetry/instrumentation-ioredis wraps Redis.prototype.sendCommand; shimmer marks wrapped functions.
const patched = Redis.prototype.sendCommand.__wrapped === true;
process.stdout.write(JSON.stringify({ patched }));

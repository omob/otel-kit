# Troubleshooting

**Some libraries produce no spans, but `http` and `pg` do.** Your app is almost certainly ESM (`"type": "module"`). Two things must both be true: telemetry is started with `node --import ./dist/instrumentation.js …` (not `--require`, and not an `import` inside your entry file — see the README), and you are on Node 18.19 or later. Check with `OTEL_LOG_LEVEL=debug`: patched modules log `Applying instrumentation patch for module on require hook` (CommonJS) or `… on import hook` (ESM). If you only ever see `dns`, `net`, `http` and `pg`, the loader hook is not active.

A rejected configuration produces a `TelemetryConfigError`. It is **reported, not thrown** — telemetry switches itself off and your service still boots. `onStartupError` decides where that goes; by default it is logged.

| Error code | Cause |
| --- | --- |
| `MISSING_SERVICE_NAME` | `serviceName` empty or missing. |
| `INVALID_SAMPLE_RATIO` | `sampleRatio` outside 0–1. |
| `UNSUPPORTED_EXPORTER` | Exporter can't handle that signal, e.g. `prometheus` for traces. |
| `UNSUPPORTED_PROPAGATOR` | Unknown propagator name. |
| `MISSING_OPTIONAL_DEPENDENCY` | Exporter selected but its package isn't installed. |

**No traces showing up? Read the `trace_flags` on your own log lines first.** If you use pino, bunyan or winston, the log instrumentation stamps every line with the active trace:

```json
{"trace_id":"9d497527a7ec14c5a81325251113283d","span_id":"b58894198a10765d","trace_flags":"00"}
```

That one field splits the problem in half:

- **`trace_flags: "00"`** — the span was created and then dropped by the sampler. Nothing was ever sent, so the collector is irrelevant. Raise `sampleRatio` to 1, or check whether an inbound `traceparent` arrived already marked unsampled — parent-based sampling honours the caller's decision.
- **`trace_flags: "01"`** — the span was sampled and handed to the exporter, so the problem is downstream: the endpoint, the path, or the network.
- **no `trace_id` at all** — the SDK never started, or it started after your app loaded. Check the `--require` flag.

Then turn on OpenTelemetry's own logging — it is off by default, which is why a bad endpoint or an unreachable collector produces silence rather than an error:

```ts
import { DiagLogLevel } from "@opentelemetry/api";

Telemetry.start({ ..., diagLogLevel: DiagLogLevel.ERROR });
```

Pass `diagLogger` to send it to your own logger instead of the console. With that on, most causes announce themselves. Without it, check in order: is `enabled` true; is `traces.exporter` something other than `none`; is the path in `ignoreIncomingPaths`; is `sampleRatio` dropping them; is the collector URL reachable from inside the container.

**Jaeger returns a 500 with `json: unsupported value: NaN`?** A span carried a `NaN` numeric attribute, and Go's JSON encoder cannot represent one — so Jaeger fails the whole trace, not just that attribute. Some instrumentations produce it by parsing a port or a header that was not there. The package drops non-finite attribute values before export, so this should not reach you; if you have set `sanitizeAttributes: false`, that is why.

**Everything arrives under the wrong service name?** `OTEL_SERVICE_NAME` and `OTEL_RESOURCE_ATTRIBUTES` are read by the SDK's own resource detectors, and detected attributes win over the ones you pass in code. A service mesh or a shared Helm chart injecting either will silently rename your service. Set `resourceDetection: false` to stop that.

**Traces stop at your service** — a caller's trace doesn't continue into yours: they're probably using a propagation format you haven't listed in `propagators`.

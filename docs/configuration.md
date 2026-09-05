# Configuration

Every option `Telemetry.start` accepts. See also [recipes](recipes.md) and [troubleshooting](troubleshooting.md).

## Options

Only `serviceName` is required. Everything else has a working default.

**The service**

| Option | Default | What it does |
| --- | --- | --- |
| `serviceName` | **required** | Name your service appears under. |
| `serviceVersion` | — | Shows on every span as `service.version`. |
| `environment` | — | Shows as `deployment.environment.name`. |
| `enabled` | `true` | `false` turns everything off and loads no SDK. |
| `resourceAttributes` | `{}` | Extra attributes on every span, metric and log. |
| `resourceDetection` | `true` | Auto-detects host and process attributes. Stamps `process.command_args` — your argv — on everything, so set `false` if you pass secrets as flags. |

**Traces**

| Option | Default | What it does |
| --- | --- | --- |
| `traces.exporter` | `none` | `none` · `console` · `otlp` · `gcp` |
| `traces.sampleRatio` | keep all | `0.1` keeps 10%. Children follow their parent's decision. |
| `traces.sampler` | — | A sampler of your own. Takes precedence over `sampleRatio`. |
| `traces.otlp.url` | — | Collector endpoint. Also takes `headers` and `timeoutMillis`. |
| `traces.otlp.protocol` | `http/protobuf` | `http/protobuf` · `http/json` · `grpc` |
| `traces.gcp.projectId` | `$GCP_PROJECT_ID` | Also takes `keyFile`; falls back to application default credentials. |
| `traces.batch` | SDK defaults | `maxQueueSize`, `maxExportBatchSize`, `scheduledDelayMillis`, `exportTimeoutMillis`. Raise the queue if you drop spans under load. |
| `traces.additionalProcessors` | `[]` | Extra span processors — scrub attributes, enrich spans, or dual-write to a second collector. |
| `traces.sanitizeAttributes` | `true` | Drops `NaN` and `Infinity` attribute values, which some backends cannot represent. |
| `spanLimits.attributeValueLengthLimit` | `4096` | Caps attribute size so one oversized request can't produce an unbounded span. |

**Metrics and logs**

| Option | Default | What it does |
| --- | --- | --- |
| `metrics.exporter` | `none` | `none` · `console` · `otlp` · `gcp` · `prometheus` |
| `metrics.exportIntervalMillis` | `60000` | How often metrics are pushed. Prometheus ignores it — it's pull-based. |
| `metrics.prometheus` | `127.0.0.1:9464` | `host`, `port`, `endpoint`. Binds loopback by default — the endpoint is unauthenticated, so only widen it behind a private network. |
| `metrics.views` | `[]` | Histogram buckets and cardinality limits. |
| `logs.exporter` | `none` | `none` · `console` · `otlp` |

**Instrumentation and propagation**

| Option | Default | What it does |
| --- | --- | --- |
| `instrumentation.disable` | `[]` | Instrumentations to switch off, e.g. `[InstrumentationName.DNS]`. |
| `instrumentation.enable` | `[]` | Switch on one that's off by default. Beats `disable`. |
| `instrumentation.only` | unset | Allow-list. When set, everything not in `only` or `enable` is off. Use it when you want a small, predictable set — `[InstrumentationName.HTTP, InstrumentationName.PG]` — instead of subtracting from the full auto set. |
| `instrumentation.esmHook` | `true` | Registers the `import-in-the-middle` loader hook so ESM imports are instrumented (Node ≥ 18.19). Set `false` if the host already registers one, e.g. `--import @opentelemetry/auto-instrumentations-node/register`. |
| `instrumentation.ignoreIncomingPaths` | `[]` | No spans for these paths. Put your health check here. |
| `instrumentation.config` | `{}` | Options for individual instrumentations, passed to OpenTelemetry unchanged. |
| `instrumentation.additional` | `[]` | Instrumentations outside the auto set — community ones, or your own. |
| `propagators` | `tracecontext`, `baggage` | Trace context formats to read and write. |

**Lifecycle and diagnostics**

| Option | Default | What it does |
| --- | --- | --- |
| `handleShutdownSignals` | `true` | Flush on SIGTERM/SIGINT, then hand the signal back. |
| `exitOnSignal` | `false` | Call `process.exit(0)` after flushing instead of handing the signal back. |
| `shutdownTimeoutMillis` | `5000` | Give up if the flush hangs, so shutdown can't stall. |
| `onStartupError` | logs and continues | Called instead of throwing when the configuration is rejected. |
| `diagLogLevel` | off | Turns on OpenTelemetry's own internal logging. |
| `diagLogger` | console | Where that internal logging goes. |

## Shutting down

Spans sit in a batch buffer for up to five seconds, so a process that exits without flushing loses them — on every deploy, which is exactly when you want them.

By default the package listens for SIGTERM and SIGINT, flushes, and then **hands the signal back**: your own handlers still run, and if there are none the process terminates with the conventional exit code (143 for SIGTERM, 130 for SIGINT). It never calls `process.exit` itself unless you ask it to with `exitOnSignal: true`.

If your app already drains connections, own the order yourself — close the server first so no new spans are created, then flush:

```ts
Telemetry.start({ ..., handleShutdownSignals: false });

const drain = async (code: number) => {
  await app.close();
  await Telemetry.shutdown();
  process.exit(code);
};

process.on("SIGTERM", () => drain(143));
process.on("SIGINT", () => drain(130));
```

Do not leave `handleShutdownSignals` on *and* call `Telemetry.shutdown()` from your own handler — one flush runs, both callers await it, but the ordering of your drain is no longer guaranteed.

## Turning things off

Every signal is optional and off by default — see the [readme](../README.md#metrics-and-logs) for turning the other two on. Omit what you don't want:

```ts
Telemetry.start({
  serviceName: "my-service",
  traces: { exporter: ExporterType.OTLP, otlp: { url } },
  // no metrics block, no logs block — nothing is created for them
});
```

To disable everything at once, set `enabled: false`. `Telemetry.start` becomes a no-op, no SDK is loaded. Use it for tests.

## When configuration is rejected

A telemetry mistake should not stop your service from serving traffic. If the configuration is rejected, `Telemetry.start` does **not** throw: it logs, leaves telemetry off, and lets your app boot. Pass `onStartupError` to route that into your own logger or alerting:

```ts
Telemetry.start({ ..., onStartupError: (error) => logger.error({ error }, "telemetry disabled") });
```

Pass a handler that rethrows if you would rather fail the boot.

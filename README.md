# @omob/otel-kit

OpenTelemetry setup for Node services, in one function call.

You pick where traces, metrics and logs go. The package handles the SDK, the sampling, the shutdown flush, and the boilerplate around spans.

## The words, briefly

If you're new to OpenTelemetry, this is everything you need to read the rest of this page.

A **trace** is the story of one request, start to finish. A **span** is one timed step inside that story. Spans nest, so a trace is a tree:

```
GET /login              240ms   ← the trace starts here
├─ user.lookup          180ms
│  └─ mongodb.find      175ms   ← this one you get for free
└─ token.generate        12ms
```

Each span carries a name, a start and end time, a status (did it fail), and **attributes** — key/value labels like `user.id` or `http.method`. Every span in that tree shares one **trace ID**, which is how the tree gets reassembled at the other end.

You get most spans for free. **Instrumentation** is code that wraps common libraries — HTTP, Mongo, Postgres, Redis — and opens a span whenever they're used. You never call it. `withSpan` is for the steps only you know are worth timing, like the two named above.

**Sampling** is deciding what to keep. Tracing every request at scale is expensive, so `sampleRatio: 0.1` keeps a tenth. The choice is made once at the root and the whole tree follows it, so you never get half a trace.

**Propagation** is how a trace survives a network hop. Your service puts the trace ID in an outgoing header; the next service reads it and continues the same trace instead of starting a new one. Both sides must agree on the header format — that's what `propagators` configures.

An **exporter** is where the finished data is sent: your collector, Jaeger, Google Cloud, or the console. A **resource** is the facts about the service itself — name, version, environment — stamped on everything you send.

Traces answer "what happened in this one request". **Metrics** are numbers over time ("requests per second"), and **logs** are the text lines you already write. This package can send all three; most people start with traces alone.

## Install

```bash
npm install @omob/otel-kit @opentelemetry/api
```

OTLP exporters are included. Install these only if you use them:

```bash
npm install @opentelemetry/exporter-prometheus                      # for Prometheus metrics
npm install @google-cloud/opentelemetry-cloud-trace-exporter \
            @google-cloud/opentelemetry-cloud-monitoring-exporter   # for Google Cloud
```

If you pick an exporter you haven't installed, startup fails and tells you which package to install.

## Quick start

Create `src/instrumentation.ts`:

```ts
import "dotenv/config";
import { ExporterType, Telemetry } from "@omob/otel-kit";

Telemetry.start({
  serviceName: "my-service",
  serviceVersion: process.env.APP_VERSION,
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV !== "test",
  traces: {
    exporter: ExporterType.OTLP,
    otlp: { url: "http://localhost:4318/v1/traces" },
    sampleRatio: 0.1,
  },
  instrumentation: { ignoreIncomingPaths: ["/health"] },
});
```

Load it before your app:

```json
{ "scripts": { "start": "node --require ./dist/instrumentation.js dist/server.js" } }
```

That's it. HTTP, database and framework calls are traced automatically.

### Why `--require`

Instrumentation can only patch libraries loaded *after* it starts. `--require` guarantees that.

Importing it at the top of your entry file also works, as long as nothing you want traced is imported above it. One reordered import and tracing silently stops — hence the flag.

## Your own spans

`withSpan` runs your function inside a span. It starts the span, makes it the parent of anything that happens inside, ends it when your function settles, and records the error if one is thrown.

Add one when you want a step to show up as its own line in the trace: a slow query, an external API call, a step you suspect. Skip it for cheap in-memory work — a span costs more than the code it measures.

```ts
import { withSpan } from "@omob/otel-kit";

async function login({ email, password }) {
  return withSpan("login", { attributes: { "auth.method": "password" } }, async (span) => {
    const user = await findUser(email);
    span.setAttribute("user.id", user.id);

    return withSpan("token.generate", () => generateToken(user));
  });
}
```

Throw anywhere inside and the span is marked failed, the exception is recorded, and the error still propagates to your caller unchanged. Spans always end, on success or failure.

Not every failure is a fault. A wrong password is an expected outcome, and marking it as a span error means your error rate tracks how often users mistype. Pass `isError` to say which throws actually count:

```ts
withSpan("login", { isError: (e) => !(e instanceof AppError) || e.statusCode >= 500 }, handler);
```

Never put emails, tokens or passwords in attributes — spans are stored unredacted.

Two more helpers:

```ts
import { currentTraceId, getTracer } from "@omob/otel-kit";

currentTraceId();            // trace id of the active span, or undefined
getTracer("auth-module");    // pass as `tracer` in withSpan options to name the scope
```

`currentTraceId()` is worth putting in your error handler, so support can jump from an error response straight to the trace:

```ts
fastify.setErrorHandler((err, request, reply) =>
  reply.status(err.statusCode ?? 500).send({ message: err.message, traceId: currentTraceId() })
);
```

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

Every signal is optional and off by default. Omit what you don't want:

```ts
Telemetry.start({
  serviceName: "my-service",
  traces: { exporter: ExporterType.OTLP, otlp: { url } },
  // no metrics block, no logs block — nothing is created for them
});
```

To disable everything at once, set `enabled: false`. `Telemetry.start` becomes a no-op, no SDK is loaded. Use it for tests.

## When configuration is wrong

A telemetry mistake should not stop your service from serving traffic. If the configuration is rejected, `Telemetry.start` does **not** throw: it logs, leaves telemetry off, and lets your app boot. Pass `onStartupError` to route that into your own logger or alerting:

```ts
Telemetry.start({ ..., onStartupError: (error) => logger.error({ error }, "telemetry disabled") });
```

Pass a handler that rethrows if you would rather fail the boot.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `serviceName` | **required** | Name your service appears under. |
| `serviceVersion` | — | Shows on every span as `service.version`. |
| `environment` | — | Shows as `deployment.environment.name`. |
| `enabled` | `true` | `false` turns everything off. |
| `resourceAttributes` | `{}` | Extra attributes on every span, metric and log. |
| `resourceDetection` | `true` | Auto-detects host and process attributes. Note this stamps `process.command_args` — your argv — on everything; set `false` if you pass secrets as flags. |
| `spanLimits.attributeValueLengthLimit` | `4096` | Caps attribute size so one oversized request can't produce an unbounded span. |
| `traces.exporter` | `none` | `none` · `console` · `otlp` · `gcp` |
| `traces.sampleRatio` | keep all | `0.1` keeps 10%. Children follow their parent's decision. |
| `traces.otlp.url` | — | Collector endpoint. Also takes `headers` and `timeoutMillis`. |
| `traces.batch` | SDK defaults | `maxQueueSize`, `maxExportBatchSize`, `scheduledDelayMillis`, `exportTimeoutMillis`. Raise the queue if you drop spans under load. |
| `traces.gcp.projectId` | `$GCP_PROJECT_ID` | Also takes `keyFile`; falls back to application default credentials. |
| `metrics.exporter` | `none` | `none` · `console` · `otlp` · `gcp` · `prometheus` |
| `metrics.exportIntervalMillis` | `60000` | How often metrics are pushed. Prometheus ignores it — it's pull-based. |
| `metrics.prometheus` | `127.0.0.1:9464` | `host`, `port`, `endpoint`. Binds loopback by default — the endpoint is unauthenticated, so only widen it behind a private network. |
| `logs.exporter` | `none` | `none` · `console` · `otlp` |
| `instrumentation.disable` | `[]` | Instrumentations to switch off, e.g. `[InstrumentationName.DNS]`. |
| `instrumentation.enable` | `[]` | Switch on one that's off by default, e.g. `FS`. Beats `disable`. |
| `instrumentation.ignoreIncomingPaths` | `[]` | No spans for these paths. Put your health check here. |
| `instrumentation.additional` | `[]` | Your own instrumentations. |
| `propagators` | `tracecontext`, `baggage` | Trace context formats to read and write. |
| `handleShutdownSignals` | `true` | Flush on SIGTERM/SIGINT, then hand the signal back. |
| `exitOnSignal` | `false` | Call `process.exit(0)` after flushing instead of handing the signal back. |
| `onStartupError` | logs and continues | Called instead of throwing when the configuration is rejected. |
| `shutdownTimeoutMillis` | `5000` | Give up if the flush hangs, so shutdown can't stall. |

## Recipes

**Jaeger** — Jaeger accepts OTLP directly, so there's no Jaeger exporter to install:

```ts
traces: { exporter: ExporterType.OTLP, otlp: { url: "http://jaeger:4318/v1/traces" } }
```

If services calling you send Jaeger's `uber-trace-id` header instead of W3C `traceparent`, accept both — otherwise their trace and yours end up unlinked:

```ts
propagators: [PropagatorType.TRACE_CONTEXT, PropagatorType.BAGGAGE, PropagatorType.JAEGER]
```

All listed formats are written on outgoing calls, and an incoming call joins the upstream trace if any of them matches. `B3` and `B3_MULTI` cover Zipkin and Envoy/Istio meshes.

**Prometheus** — serves a scrape endpoint instead of pushing:

```ts
metrics: { exporter: ExporterType.PROMETHEUS, prometheus: { port: 9464 } }
```

Then scrape `http://your-service:9464/metrics`.

**Google Cloud**:

```ts
traces: { exporter: ExporterType.GCP, gcp: { projectId: "my-project" } }
```

Uses `GOOGLE_APPLICATION_CREDENTIALS` if it points at a readable file, otherwise application default credentials.

**Seeing spans locally** — no collector needed:

```ts
traces: { exporter: ExporterType.CONSOLE, sampleRatio: 1 }
```

Spans print on shutdown, since they're batched.

**Quieter traces** — the noisiest instrumentations are usually DNS and net, especially with a database driver reconnecting:

```ts
instrumentation: { disable: [InstrumentationName.DNS, InstrumentationName.NET] }
```

## When something's wrong

Configuration mistakes throw `TelemetryConfigError` at startup rather than failing quietly later:

| Error code | Cause |
| --- | --- |
| `MISSING_SERVICE_NAME` | `serviceName` empty or missing. |
| `INVALID_SAMPLE_RATIO` | `sampleRatio` outside 0–1. |
| `UNSUPPORTED_EXPORTER` | Exporter can't handle that signal, e.g. `prometheus` for traces. |
| `UNSUPPORTED_PROPAGATOR` | Unknown propagator name. |
| `MISSING_OPTIONAL_DEPENDENCY` | Exporter selected but its package isn't installed. |

**No traces showing up?** In order: is `enabled` true; is `traces.exporter` something other than `none`; is the path in `ignoreIncomingPaths`; is `sampleRatio` dropping them; is the collector URL reachable from inside the container.

**Traces stop at your service** — a caller's trace doesn't continue into yours: they're probably using a propagation format you haven't listed in `propagators`.

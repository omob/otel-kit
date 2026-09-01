# @omob/otel-kit

OpenTelemetry setup for Node services, in one function call.

```mermaid
flowchart LR
    R(["a request arrives"])

    R --> M["METRICS<br/>counts and latencies, aggregated<br/>-<br/>is something wrong?"]
    R --> T["TRACES<br/>one request, span by span<br/>-<br/>where is it wrong?"]
    R --> L["LOGS<br/>the lines you wrote<br/>-<br/>why is it wrong?"]

    M -- "a latency spike,<br/>at 14:02" --> T
    T -- "trace_id stamped<br/>on every line" --> L

    style T stroke-width:3px
```

Those are the three signals of observability, and they answer different questions. Metrics tell you *something* broke. Traces tell you *where* — which service, which query, which call. Logs tell you *why*, once you know where to look.

Tracing is the one that connects the other two, and it is what this package is mostly for. You pick where traces, metrics and logs go; it handles the SDK, the sampling, the shutdown flush, and the boilerplate around spans — and stamps `trace_id` into your logs so the third column lines up with the second.

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

That is everything for most setups. OTLP — protobuf, JSON and gRPC — and Prometheus are already included.

Extra packages are needed for Google Cloud only, and which one depends on the route you take:

| If you use | Install |
| --- | --- |
| `ExporterType.GCP` for **traces** | `@google-cloud/opentelemetry-cloud-trace-exporter` |
| `ExporterType.GCP` for **metrics** | `@google-cloud/opentelemetry-cloud-monitoring-exporter` |
| Google Cloud over **OTLP** | `google-auth-library` — and neither of the above |

They are independent: exporting traces to Google needs the trace package only. Google is deprecating both in favour of the OTLP route, which is covered under [Recipes](#recipes).

If you pick an exporter whose package is not installed, startup fails and names the package.

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
    exporter: ExporterType.CONSOLE,
    sampleRatio: Number(process.env.OTEL_TRACES_SAMPLE_RATIO ?? 1),
  },

  // metrics and logs stay off until you add their block. Uncomment to turn them on —
  // you get HTTP latency, event loop and heap metrics, and your existing pino or winston
  // output bridged with its trace id, without writing any instrumentation yourself.
  // metrics: { exporter: ExporterType.OTLP, otlp: { url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT } },
  // logs: { exporter: ExporterType.OTLP, otlp: { url: process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT } },

  instrumentation: { ignoreIncomingPaths: ["/health"] },
});
```

`CONSOLE` needs no infrastructure — spans print to stdout, so you can confirm tracing works before you have anywhere to send it. Swap it for a real destination once you do:

```ts
traces: {
  exporter: ExporterType.OTLP,
  otlp: { url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT },
  sampleRatio: Number(process.env.OTEL_TRACES_SAMPLE_RATIO ?? 1),
}
```

**Nothing listens on port 4318 unless you run something there.** If you point at a collector that is not up, every export fails with `ECONNREFUSED` and you see no error at all — OpenTelemetry's internal logging is off by default. The quickest real destination is Jaeger, which ingests OTLP directly:

```bash
docker run -d --name jaeger -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one:1.62.0
```

Then set `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces` and open the UI at http://localhost:16686.

Load it before your app:

```json
{ "scripts": { "start": "node --require ./dist/instrumentation.js dist/server.js" } }
```

That's it. HTTP, database and framework calls are traced automatically.

Keep the ratio at 1 while you are setting things up. Sampling below 1 is a production concern, and turning it down before you have seen a single trace is the most common reason nothing appears in a backend. Dial it down later with the env var.

**On Fastify, turn its instrumentation on.** It ships disabled, along with `fs`, and there is a wrinkle worth reading below:

```ts
instrumentation: { enable: [InstrumentationName.FASTIFY], ignoreIncomingPaths: ["/health"] }
```

Without it, every request is one bare `GET` span with no `http.route`, so nothing groups by route. Express, Koa, Hapi, NestJS, Mongo, Postgres, Redis, Kafka and outbound HTTP need no such step — they are on by default. The wrinkle: the bundled Fastify instrumentation is deprecated upstream, which is *why* it is disabled. It works, and the alternative is covered under [Recipes](#recipes).

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

## Metrics and logs

Both are off until you add their block. Neither needs code beyond the config.

**Metrics** — add a `metrics` block:

```ts
metrics: {
  exporter: ExporterType.OTLP,
  otlp: { url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT },
  exportIntervalMillis: 60_000,
}
```

You immediately get, with no instrumentation of your own:

- `http.server.duration` and `http.client.duration` — request latency in and out, by route and status
- `nodejs.eventloop.delay.p50` / `p90` / `p99`, `nodejs.eventloop.utilization` — the event loop, which is what saturates first on a busy Node service
- `v8js.memory.heap.*` — heap usage and limit

For a pull-based setup, swap the exporter and Prometheus scrapes you instead:

```ts
metrics: { exporter: ExporterType.PROMETHEUS, prometheus: { port: 9464 } }
```

**Logs** — add a `logs` block:

```ts
logs: { exporter: ExporterType.OTLP, otlp: { url: process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT } }
```

You do not change how you log. If you use pino, winston or bunyan, the log instrumentation bridges what you already write into OpenTelemetry, carrying the `trace_id` that ties each line to its span — so a trace links straight to the logs from that request.

Two things to weigh before turning logs on. Your log volume goes to two places, so you pay to store it twice unless you drop stdout collection. And any gap in your redaction now reaches a second system: check what your logger emits — response bodies and auth headers are the usual leaks — before pointing it at a backend.

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

Every signal is optional and off by default — see [Metrics and logs](#metrics-and-logs) for turning the other two on. Omit what you don't want:

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

**Per-instrumentation options** — anything documented upstream works here. `instrumentation.config` is keyed by package name and handed to OpenTelemetry unchanged:

```ts
instrumentation: {
  enable: [InstrumentationName.FASTIFY],
  ignoreIncomingPaths: ["/health"],
  config: {
    [InstrumentationName.HTTP]: {
      ignoreOutgoingRequestHook: (options) => options.hostname === "metrics.internal",
      headersToSpanAttributes: { server: { requestHeaders: ["x-request-id"] } },
    },
    [InstrumentationName.PG]: { enhancedDatabaseReporting: true },
    [InstrumentationName.FASTIFY]: { requestHook: (span, info) => span.setAttribute("route", info.request.routerPath) },
  },
}
```

`disable`, `enable` and `ignoreIncomingPaths` are conveniences layered on top of the same map, and they win where they overlap — so `ignoreIncomingPaths` merges into your HTTP options rather than replacing them.

**Every instrumentation in [`@opentelemetry/auto-instrumentations-node`](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/packages/auto-instrumentations-node) works here** — all 41 of them, Express, Koa, Hapi, NestJS, Restify, Postgres, MySQL, Mongo, Redis, Kafka, gRPC, AWS SDK and the rest. They are on by default, `InstrumentationName` has an entry for each, and their own options go through `instrumentation.config` untouched.

Each documents its options in its own README:

- most live in [opentelemetry-js-contrib](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/packages) under `packages/instrumentation-<name>`
- HTTP and gRPC live in [opentelemetry-js](https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages) under `experimental/packages/opentelemetry-instrumentation-<name>`

`InstrumentationName` values *are* the package names, so the enum entry tells you which README to open.

Anything **not** in that set — a community instrumentation, or one you wrote — goes through `instrumentation.additional`, which takes instrumentation instances directly.

Three defaults worth knowing, all decided upstream rather than here:

- `fs` is off by default. It emits a span per file read and drowns everything else.
- `fastify` is off by default because `@opentelemetry/instrumentation-fastify` is **deprecated** in favour of [`@fastify/otel`](https://www.npmjs.com/package/@fastify/otel), maintained by the Fastify team. `enable: [InstrumentationName.FASTIFY]` still works and still produces route spans, but it is unmaintained; `@fastify/otel` registers as a Fastify plugin and reports through the same global API this package sets up.
- database instrumentations replace query values with `?`. `enhancedDatabaseReporting: true` puts the real parameters in your spans — think about customer data before turning it on.

**A gRPC collector** — OTLP defaults to HTTP/protobuf on port 4318. For a collector speaking gRPC on 4317:

```ts
traces: { exporter: ExporterType.OTLP, otlp: { protocol: OtlpProtocol.GRPC, url: "http://collector:4317" } }
```

Note the HTTP protocols need the full signal path (`/v1/traces`); gRPC takes the base URL. A missing path is a silent 404 on every export.

**Scrubbing attributes before they leave** — add your own span processor:

```ts
traces: { exporter: ExporterType.OTLP, additionalProcessors: [new RedactingSpanProcessor()] }
```

**Prometheus** — serves a scrape endpoint instead of pushing:

```ts
metrics: { exporter: ExporterType.PROMETHEUS, prometheus: { port: 9464 } }
```

Then scrape `http://your-service:9464/metrics`.

**Google Cloud** — works, and is on a clock:

```ts
traces: { exporter: ExporterType.GCP, gcp: { projectId: "my-project" } }
```

Uses `GOOGLE_APPLICATION_CREDENTIALS` if it points at a readable file, otherwise application default credentials. Give the service account the **Cloud Trace Agent** role; it only needs to write.

Google has **deprecated** `@google-cloud/opentelemetry-cloud-trace-exporter` and will archive it after **30 October 2026**, directing users to OTLP instead ([migration guide](https://github.com/GoogleCloudPlatform/opentelemetry-operations-js/blob/main/MIGRATION.md)).

**Google Cloud over OTLP** — the destination Google is moving everyone to:

```ts
import { GoogleAuth } from "google-auth-library";

const client = await new GoogleAuth({ scopes: "https://www.googleapis.com/auth/cloud-platform" }).getClient();

Telemetry.start({
  serviceName: "my-service",
  resourceAttributes: { "gcp.project_id": "my-project" },
  traces: {
    exporter: ExporterType.OTLP,
    otlp: {
      url: "https://telemetry.googleapis.com/v1/traces",
      headers: async () => Object.fromEntries((await client.getRequestHeaders()).entries()),
    },
  },
});
```

Three things differ from a normal collector. The endpoint is `https://telemetry.googleapis.com` — for HTTP the exporter needs the full signal path, so `/v1/traces`. The project is a **resource attribute**, `gcp.project_id`, not part of the URL. And `headers` must be a **function**: Google's OAuth2 tokens expire after an hour, so a static header stops working mid-run. `headers` accepts either a plain object or an async factory for exactly this.

This route needs `google-auth-library` in your project, but no Google exporter package.

**Quieter traces** — the noisiest instrumentations are usually DNS and net, especially with a database driver reconnecting:

```ts
instrumentation: { disable: [InstrumentationName.DNS, InstrumentationName.NET] }
```

## Troubleshooting

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

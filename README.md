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

They are independent: exporting traces to Google needs the trace package only. Google is deprecating both in favour of the OTLP route, which is covered under [recipes](https://github.com/omob/otel-kit/blob/main/docs/recipes.md).

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

If your app is ESM (`"type": "module"`), use `--import` instead, and keep it on the command line rather than as an `import` at the top of your entry file:

```json
{ "scripts": { "start": "node --import ./dist/instrumentation.js dist/server.js" } }
```

ESM links every module in the graph before any of them runs, so an `import "./instrumentation.js"` inside `server.js` starts telemetry after Fastify, ioredis or kafkajs have already loaded — too late to patch them. `--import` runs first. Node 20.6 or later is needed for ESM instrumentation; on older runtimes only CommonJS requires are patched.

That's it. HTTP, database and framework calls are traced automatically.

Keep the ratio at 1 while you are setting things up. Sampling below 1 is a production concern, and turning it down before you have seen a single trace is the most common reason nothing appears in a backend. Dial it down later with the env var.

**On Fastify, turn its instrumentation on.** It ships disabled, along with `fs`, and there is a wrinkle worth reading below:

```ts
instrumentation: { enable: [InstrumentationName.FASTIFY], ignoreIncomingPaths: ["/health"] }
```

Without it, every request is one bare `GET` span with no `http.route`, so nothing groups by route. Express, Koa, Hapi, NestJS, Mongo, Postgres, Redis, Kafka and outbound HTTP need no such step — they are on by default. The wrinkle: the bundled Fastify instrumentation is deprecated upstream, which is *why* it is disabled. It works, and the alternative is covered under [recipes](https://github.com/omob/otel-kit/blob/main/docs/recipes.md).

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

## More

- [Configuration](https://github.com/omob/otel-kit/blob/main/docs/configuration.md) — every option, shutdown behaviour, and what happens when a config is rejected
- [Recipes](https://github.com/omob/otel-kit/blob/main/docs/recipes.md) — Jaeger, Google Cloud, Prometheus, gRPC collectors, per-instrumentation options
- [Troubleshooting](https://github.com/omob/otel-kit/blob/main/docs/troubleshooting.md) — no traces appearing, wrong service name, broken propagation
- [Concepts](https://github.com/omob/otel-kit/blob/main/docs/concepts.md) — traces, spans, sampling and propagation, if OpenTelemetry is new to you

## Licence

MIT

# Changelog

## 0.3.0

Added

- `architecture`, an optional block for backends that draw a system diagram from telemetry. `component` (`type`, `layer`, `domain`, `owner`), `intendedDependencies` and `concurrency` become `archscope.*` resource attributes on every span; other backends ignore them.
- `architecture.docTraceRatio`: a second, independent sampling decision. A chosen root trace is always recorded and marked in W3C `tracestate` (`as=d`), and every downstream service on the same trace records it too, whatever its own `sampleRatio`. The decision uses the leading bytes of the trace id where `TraceIdRatioBasedSampler` uses the trailing ones, so documentation traces are not a subset of production-sampled traces. Rejected outside 0–1 with `INVALID_DOC_TRACE_RATIO`.
- `architecture.peers`: map outbound hosts (exact or `*.suffix`) to a `peer.service` name on client and producer spans, so several hostnames render as one component.
- `withSpan` accepts `peer` and `component`, shorthands for `peer.service` and `archscope.component` attributes.
- `DOC_TRACE_STATE_KEY` / `DOC_TRACE_STATE_VALUE` are exported for collectors and tests that look for the mark.

## 0.2.0

Breaking

- `InstrumentationName.FASTIFY` is now `@fastify/otel` rather than `@opentelemetry/instrumentation-fastify`, which upstream deprecated and dropped from the auto set in 0.72. Fastify hosts need `npm i @fastify/otel`. Options under `config[InstrumentationName.FASTIFY]` go to that package, so a `requestHook` written for the old instrumentation receives a different second argument — the Fastify request, not a layer-type record. Anything keying `instrumentation.config` by the old package-name string rather than the enum has to be updated.

Added

- `observeConnectionPool` reports a pool's limit, usage and queue depth under OpenTelemetry's standard `db.client.connection.*` metrics. The limit only exists inside the process, so no database exporter can report it — which makes pool saturation look like a slow database.
- ESM apps are instrumented. `import-in-the-middle`'s loader hook is registered before any instrumentation is built, so packages reached through `import` are patched. Only `require` was hooked before, and an ESM app lost every span from Fastify, ioredis, kafkajs and anything else it imported. Set `instrumentation.esmHook: false` where the host registers a loader itself.
- `instrumentation.only`, an allow-list: name what you want and everything else is off. `dns.lookup` and `tcp.connect` show up as edges to nowhere in anything that builds a dependency graph from traces.

Fixed

- `@opentelemetry/auto-instrumentations-node` moves to 0.80, the release built against the `@opentelemetry/instrumentation` 0.222 this package pins. npm was installing a nested copy of the instrumentation core under every instrumentation, so a hook registered on one copy never reached the others.
- A missing optional dependency costs you one instrumentation instead of all telemetry. Enabling Fastify without `@fastify/otel` installed disabled the entire SDK — no HTTP, no database, no queue spans — behind a single line on stderr.
- A loader hook that cannot be registered, as in a bundled `dist` where `import-in-the-middle` is no longer a sibling of the emitted file, warns and leaves CommonJS instrumentation working rather than taking the SDK down with it.
- `url.path` is trimmed to the path component before export. `@fastify/otel` assigns the raw request url, which puts query-string tokens and ids on every server span.

## 0.1.1

Added

- `traces.otlp.headers`, `metrics.otlp.headers` and `logs.otlp.headers` accept an async factory as well as a plain object. Backends whose credentials expire — Google Cloud's OTLP endpoint refreshes its OAuth2 token hourly — cannot be reached with a static header map.

Documentation

- A Fastify `requestHook` example used a property that does not exist on the hook argument. Every code sample in the readme and docs is now compiled against the built package in CI, so a sample that would not work cannot be merged.
- The readme is now a usage page — install, quick start, spans, metrics and logs — at roughly half its former length, with the option reference, recipes, troubleshooting and concepts moved to `docs/`. npm shows the short page; the depth is a click away.
- The quick start shows the metrics and logs blocks commented out, so both are visible where you configure everything else rather than only in a later section.
- A section on enabling metrics and logs, and what each gives you without writing any instrumentation: HTTP latency, event loop and heap metrics, and your existing pino, winston or bunyan output bridged with its trace id.
- Install instructions say which Google package each route needs. Both were listed together, implying you needed both for traces alone, and the OTLP route needs neither.
- The quick start starts on the console exporter, which needs nothing running. It pointed at `http://localhost:4318` before, where most people have nothing listening — and a refused export is silent, so the first experience of the package was an empty backend.
- A recipe for Google Cloud over OTLP, which is where Google is moving everyone: `@google-cloud/opentelemetry-cloud-trace-exporter` is deprecated and will be archived after 30 October 2026.

## 0.1.0

First release.

- `Telemetry.start` / `Telemetry.shutdown` with pluggable trace, metric and log exporters: OTLP over protobuf, JSON or gRPC, Google Cloud, Prometheus and console.
- `withSpan` handles `recordException`, span status and `end` on every path, with `isError` to keep expected failures out of your error rate.
- Ratio sampling or your own sampler, configurable propagators for W3C, B3 and Jaeger, per-instrumentation enable, disable and options.
- Buffered spans flush on SIGTERM and SIGINT, then the signal is handed back so the host's own shutdown runs.
- A rejected configuration disables telemetry and reports through `onStartupError` rather than stopping the host from booting.
- Prometheus binds loopback, span attributes are capped, and non-finite attribute values are dropped before export.

# Changelog

## 0.5.0

Added

- `metrics.cpuUsage` and `observeCpuUsage()` report `process.cpu.time` in seconds, one series per `cpu.mode`. The flag registers the observer after the SDK starts, so it cannot bind to the no-op meter. Off by default; leave it off where `@opentelemetry/host-metrics` or the host-metrics instrumentation already reports the same metric.
- `architecture.cpuLimit`, the CPU limit of one replica in cores, emitted as `ritele.cpu.limit`. A non-positive or non-finite value is dropped with a `diag` warning, as `concurrency` limits are.
- `service.instance.id` is on the resource by default, a random id generated once per process, since NodeSDK's default detectors never set it and a capacity model counts replicas by it. A value from `resourceAttributes` or `OTEL_RESOURCE_ATTRIBUTES` replaces it; see the `resourceAttributes` row in the configuration docs for which wins. The id changes every time the process starts, so a backend that copies resource attributes onto metric labels starts new series on each restart; set it to the pod name where that matters.

Fixed

- `Telemetry.start()` after `Telemetry.shutdown()` exported nothing. The API refuses a second registration of a global provider, so the new SDK's tracer, meter and logger providers were ignored in favour of the shut-down ones, and the new instrumentations could not patch modules the app had already loaded. The kit now frees the globals it registered, and only those: its providers when shutdown is called, and its context manager and propagator at the next start, so requests still draining keep their trace headers. A restart rebinds the instrumentations of the first start to the new SDK, and may begin while the previous flush is still running. With `OTEL_SDK_DISABLED` set, the kit registers no globals, patches no modules and observes no CPU usage. Tracers, meters and handles obtained before a restart stay with the old SDK; see the configuration docs.

## 0.4.0

Breaking

- The architecture attributes are emitted under `ritele.*` rather than `archscope.*`, following the rename of the backend that reads them. `component.name`, `component.type`, `layer`, `domain`, `owner`, `intended_dependencies` and `concurrency.<key>` all move; nothing else changes, and their shapes and meanings are identical. Ritele's ingest reads only the new namespace, so a service on 0.3.0 has its architecture metadata ignored — as it would be by any other backend, and as a service on 0.4.0 would be by a backend still on the old one. A node a backend has already observed keeps whatever `archscope.*` keys it recorded: nothing rewrites stored attributes on upgrade, so expect both namespaces on existing nodes until they age out. The `tracestate` documentation mark stays `as=d`: it is a wire value that collectors and downstream services already match on, and renaming it would strand doc traces mid-flight.

## 0.3.0

Added

- An `architecture` block for backends that draw a system diagram from telemetry. `component`, `intendedDependencies` and `concurrency` ride on the resource as `archscope.*` attributes, so every span from the process carries what the service is, what it is meant to call and what bounds it. Backends that do not look for the namespace ignore it.
- `architecture.docTraceRatio`, a second sampling decision that runs beside `traces.sampleRatio`. A chosen root trace is always recorded and marked in W3C `tracestate` as `as=d`, and the mark travels to every service downstream, so they record it whatever their own rate. The choice folds the trace id exactly as `TraceIdRatioBasedSampler` does and takes from the top of that range where the ratio sampler takes from the bottom, so the two sets never overlap: a documentation trace is one you would not otherwise have kept. Sampling 1% of traffic hides a dependency that is called twice a day; a separate 2% does not. It wraps whatever sampler you configure, custom samplers included, and a value outside 0–1 is rejected with `INVALID_DOC_TRACE_RATIO`. An inbound mark counts only when the request is already sampled, so the header alone cannot make a caller's traffic record.
- `architecture.peers`, mapping outbound hosts to a stable name on `peer.service`, exact or `*.suffix`. Three regional hostnames for one provider otherwise draw three nodes. Matching reads the host attribute on the span, which HTTP, undici, pg and ioredis set at span start and the messaging instrumentations never set.
- `withSpan` takes `peer` and `component`, shorthands for the `peer.service` and `archscope.component.name` attributes, for calls that no instrumentation covers.
- `ArchitectureComponentType` and `DocTraceState` are exported, the latter for collectors and tests that look for the documentation mark.

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

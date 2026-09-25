# Changelog

## 0.7.1

Changed

- **The `node` binary's path no longer leaves the process.** The detected process details still carried `process.executable.path`, such as `/Users/<you>/.nvm/versions/node/v20.19.6/bin/node`, which names the user, and `process.executable.name`, which comes from `process.title` and is often that same full path, whenever node is started by its absolute path (systemd, pm2, a Docker `CMD ["/usr/local/bin/node", …]`). Both are now left out, alongside the command line, script path and user name that 0.6.0 dropped. `process.runtime.*` still reports the Node version. If you set `process.title` to tell workers apart, pass that label through `resourceAttributes` instead.
- **Personal machines send pseudonyms for their host name and id.** On macOS, Windows, and Linux with a desktop session, `host.name` is usually the owner's name (`Ada-MacBook-Pro`) and `host.id` is a hardware fingerprint. Both are now replaced by stable pseudonyms such as `host-3fa9c1d2e4b7`, the same on every run, so a backend still tells machines apart and keys hosts as before. The name's pseudonym is keyed by the machine id, which never leaves the machine, so guessing likely names can't reverse it. Linux servers, containers and pods are unchanged; macOS and Windows servers count as personal under `AUTO`, so set `hostName: HostNameMode.KEEP` on those if you want their real names. The new `hostName` option (`HostNameMode.AUTO`, `KEEP`, `HASH`, `HIDE`) overrides the choice. **Upgrading from a developer machine:** its host series change identity once, since the values they are keyed by change.
- **`OTEL_NODE_RESOURCE_DETECTORS` no longer bypasses these protections.** The kit now resolves the variable itself, so the detectors it names are the kit's filtered ones, and `hostName` applies to them. Unknown names are ignored with a `diag` warning, and the kit's `all` also includes `container`.

## 0.7.0

**Upgrading?** Check two things:

1. Before 1.0, a `^0.6.0` range never picks up 0.7 — npm treats every 0.x minor as breaking. Bump the version in your `package.json` explicitly.
2. If `OTEL_METRICS_EXPORTER=none` is set anywhere (a `.env` file, a base image, a shared chart — the Jaeger quick start suggests it), it now switches off your `metrics` block as well. The kit warns at startup when that happens.

Added

- **`container.id`**, detected at startup under Docker and on hosts with cgroup v1, from the official `@opentelemetry/resource-detector-container`. Most current Kubernetes clusters (containerd with cgroup v2, as on EKS, GKE and AKS) don't expose it to the process, so it is left out there. Setting `OTEL_NODE_RESOURCE_DETECTORS` still hands detection back to the SDK, which has no container detector.
- **A Kubernetes recipe** that passes `k8s.pod.name`, `k8s.pod.uid`, `k8s.namespace.name`, `k8s.node.name` and `k8s.container.name` in through `OTEL_RESOURCE_ATTRIBUTES` and the downward API. Namespace, pod and container name are what the cluster's own metrics are labelled with, so they are what lines your telemetry up with CPU throttling, restarts and out-of-memory kills.

Changed

- **`OTEL_METRICS_EXPORTER=none` now wins over a `metrics` block.** It used to switch off only the default that follows traces, so writing a block, most often just to set `cpuUsage`, silently disabled the standard off switch. It now turns metrics off whatever the code says. Only `none` is read.
- **`cpuUsage` follows the metrics that are actually exported.** With metrics switched off, the CPU observer is not registered, so it can no longer report into a meter provider your app set up for itself. The off switch covers what the kit exports; instrumentation metrics still go to a meter provider your app registered itself, as before.

Documented

- A `metrics` block without a URL keeps the collector derived from traces only when there is one. Otherwise it falls back to `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`, `OTEL_EXPORTER_OTLP_ENDPOINT`, or `localhost:4318`.
- The CPU capacity examples now include the traces block they depend on for a collector.

## 0.6.0

**Upgrading?** Most services need no change. Check four things:

1. **Traces go to a backend that doesn't take metrics** (Jaeger, for example)? Set `OTEL_METRICS_EXPORTER=none`. Otherwise the kit tries to send it metrics every 30 seconds, and every attempt fails — silently, unless `diagLogLevel` is set.
2. **Auth only in `OTEL_EXPORTER_OTLP_TRACES_HEADERS`?** Set `OTEL_EXPORTER_OTLP_METRICS_HEADERS` too, or the new metrics are sent without it.
3. **You pay per metric series or per request?** Metrics now export every 30 seconds instead of 60, and turn on by themselves when traces go over OTLP.
4. **A monorepo started from the root?** Set `serviceVersion` per service; otherwise all of them report the root `package.json` version.

Changed

- **Metrics turn on with OTLP traces.** With `traces.exporter: otlp` and no `metrics` block, metrics go to the same collector, with the headers set in code or `OTEL_EXPORTER_OTLP_HEADERS`: the traces URL with `/v1/traces` swapped for `/v1/metrics`, the one in `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, or `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` if you set it. A traces URL with any other path sends no metrics. `OTEL_METRICS_EXPORTER=none` or `metrics: { exporter: ExporterType.NONE }` turns them off. An OTLP `metrics` block without a URL keeps that collector and its headers, so it can add `cpuUsage` or an interval on its own.
- **Metrics export every 30 seconds, not 60**, so a one-minute chart is never two minutes behind. `metrics.exportIntervalMillis` sets it back.
- **Runtime metrics stay on under `instrumentation.only`.** Event loop, heap and GC metrics used to vanish as soon as you listed your instrumentations. `runtimeMetrics: false` turns them off.
- **Your command line no longer leaves the process.** The detected process details used to include `process.command`, `process.command_args` and `process.owner`: your argv, script path and user name, on every span. They are gone. If you set `OTEL_NODE_RESOURCE_DETECTORS`, the SDK's own detectors run as before and do include them.

Added

- **`service.version` fills itself in** from the `package.json` npm or pnpm ran your start script from, so each deploy shows as a new version without configuration.
- **`ritele.trace.sample_probability`** on the resource: how likely this service is to keep a trace it starts, `sampleRatio + docTraceRatio` capped at 1. The two ranges never overlap, so they add. It is left out when traces aren't exported or you pass your own `traces.sampler`.
- **`telemetry.sdk.*`** (the SDK's name, language and version) is back on the resource. The kit's own resource used to replace it.

Documented

- The HTTP latency metrics are `http.server.request.duration` and `http.client.request.duration`, in seconds. The bundled instrumentation reports nothing else, and `OTEL_SEMCONV_STABILITY_OPT_IN` no longer changes that.
- The pg instrumentation reports pool metrics for `pg-pool`, but they are only right with a single pool. Register pools with `observeConnectionPool()` and read the `@omob/otel-kit` scope.
- kafkajs reports `messaging.client.sent.messages`, `messaging.client.consumed.messages` and `messaging.process.duration`.

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

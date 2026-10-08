# Changelog

## 0.12.0

**Upgrading?** If metrics such as GC time, request counts or CPU time have looked doubled or impossible — GC above 100%, a series whose start time keeps changing — this release is likely the fix: see the first item below.

Fixed

- **A `--require` preload no longer starts a second SDK.** Node runs `--require` preloads again in the thread that serves `module.register()` hooks, which otel-kit registers for ESM by default. Every service started as `node --require ./instrumentation.js server.js` therefore ran two SDKs in one process, exporting the same scopes, and the same resource wherever `service.instance.id` comes from `OTEL_RESOURCE_ATTRIBUTES`, as it usually does from the pod name: runtime metrics from the second thread's own isolate, and `process.cpu.time` twice. A backend saw two cumulative streams with different start times under one series. Neither SDK logged anything about the other, at any `diagLogLevel`. Reproduced on Node 18 through 24, in every release since 0.2.0. `Telemetry.start()` now does nothing outside the main thread, including your own `worker_threads`, which inherit the preload too and caused the same doubling. Before upgrading, `instrumentation.esmHook: false` avoids it for CommonJS apps.

Added

- **A warning when the auto-instrumentations' `register` module is loaded** through `NODE_OPTIONS`, `--require` or `--import`. It registers a second set of instrumentations and its own SDK, so everything is recorded twice.
- **An instrumentation in `instrumentation.additional` replaces the kit's own copy.** Passing, say, your own `HttpInstrumentation` used to patch `http` a second time and record every request twice. Now the kit leaves its copy out and runs yours, hooks and all; its `instrumentation.config` and `ignoreIncomingPaths` settings for that instrumentation no longer apply, so put them on your instance.

Documented

- Don't register `@opentelemetry/auto-instrumentations-node` yourself; the kit does. The `esmHook` example no longer suggests its `register` module, which double-registers; use `@opentelemetry/instrumentation/hook.mjs` for a loader hook alone.
- A troubleshooting entry for metrics that read double or above 100%.

## 0.11.0

**Upgrading?** Check two things:

1. **`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` already set somewhere** — a base image, a shared ConfigMap — with no `logs` block in code? It used to be ignored; it now turns logs on, and your log lines start leaving the process. Remove it, or set `OTEL_LOGS_EXPORTER=none`, if that isn't what you want.
2. **`disableLogSending` set only to stop pino, winston or bunyan sending records while logs were off?** You can drop it: the kit now does that itself, and sends records once logs have a destination.

Added

- **`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` turns logs on without code.** With no `logs` block, setting the variable is enough. Headers set on your traces in code don't go with it, since logs often go to another vendor; `OTEL_EXPORTER_OTLP_HEADERS` still applies to every signal, as the OpenTelemetry standard defines it. Without the variable, logs stay off as before.
- **A `logs` block without a URL follows the traces collector,** with its headers and `/v1/traces` swapped for `/v1/logs`, the same way metrics do. `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` wins over that, without the traces headers; with neither, it uses `OTEL_EXPORTER_OTLP_ENDPOINT`, and otherwise the kit sends no logs and warns, instead of retrying a local collector. A `logs: { exporter: ExporterType.NONE }` in code keeps logs off whatever the variables say.
- **`OTEL_LOGS_EXPORTER=none` turns logs off,** winning over a `logs` block like its metrics counterpart.

Changed

- **pino, winston and bunyan send log records only when logs are exported.** They used to send records into a pipeline that, with logs off, exported nowhere; with logs on, a forgotten `disableLogSending: true` left a working exporter with nothing to send. Log sending now follows whether logs have a destination, decided again on every start, and a `disableLogSending` you set in `instrumentation.config` still wins. Trace ids in your log lines are unaffected.

## 0.10.0

**Upgrading?** Check three things:

1. **A `metrics` block without a URL, and traces that aren't going over OTLP** (or whose URL the kit can't map)? It used to retry `localhost:4318` silently for the life of the process. It now sends nothing and warns at startup, unless `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` or `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Give the block a URL if you relied on the local default.
2. **Raw ids in `url.path`, `url.query` or `url.full`?** They are masked as `*` by default now. Set `traces.redactPathSegments: false` to keep them.
3. **Your own name for the sample ratio variable?** The kit now reads the standard `OTEL_TRACES_SAMPLER_ARG` when `traces.sampleRatio` isn't set in code, so you can pass it straight through. If you followed the old quick start, which read `OTEL_TRACES_SAMPLE_RATIO`, rename that key: the kit doesn't read the old name. A ratio set in code still wins, so you can upgrade first and rename the key in a later deploy.

Changed

- **A metrics block never falls back to an unrelated local collector.** Metrics follow traces, an explicit URL, or an endpoint variable; with none of those, the kit sends no metrics and says why at startup. Traces are unchanged: an OTLP traces exporter with no URL still uses the standard local default, because a sidecar collector on `localhost` is a real deployment. A traces URL must now use `http` or `https` for metrics to follow it — `collector:4318/v1/traces` parses, as scheme `collector:`, but reaches nothing.
- **Ids in request paths and query strings are masked.** Account and phone numbers, emails, UUIDs, long tokens and document numbers such as licence or passport numbers in `url.path`, `url.query` and `url.full` are sent as `*`; query values that aren't identifiers, such as `page=2`, are left alone. `http.route` keeps the route template. The rules were tested both ways against every path segment of a large production codebase, and long hyphenated route names such as `process-multi-payment-wallet-credit-retry` stay readable. They are rules, not a guarantee: short technical names with digits (`sha256`, `base64`) are masked too, and ids made only of letters under 24 characters are not. `traces.redactPathSegments` has its own switch, separate from `sanitizeAttributes`, and `traces.redactQuery: QueryRedaction.DROP` removes query strings entirely, for values such as names that no rule can recognise. It applies even with path masking off. The kit masks `url.*` values whatever set them, your own instrumentation hooks included.
- **Configuration warnings are visible by default.** An invalid CPU or concurrency limit, an unknown resource detector, a peer pattern the kit can't use, or a skipped Fastify instrumentation used to warn through `diag`, which is silent unless `diagLogLevel` is set. They now go to your `diagLogger` when `diagLogLevel` is `WARN` or more detailed, and to the console otherwise — including at `ERROR`, which would otherwise swallow them.
- **One pool failing to report no longer blanks its group.** A pool whose `read` throws is left out of that collection, and the others in its group still report. Registering a pool under an existing name with a different `system` prints a warning, since the first registration's labels are kept.
- **Pools that share a name add into one series.** Registering two pools under one name used to leave two callbacks writing the same series. Their readings are now summed, and the series keeps going until the last one stops.

Added

- **The kit reads the standard sampler variables.** With no `traces.sampleRatio` in code, `OTEL_TRACES_SAMPLER` and `OTEL_TRACES_SAMPLER_ARG` set it: a ratio, or `always_on`/`always_off`. The kit's sampler always follows a sampled caller, so `always_off` stops the traces this service starts, not the ones it continues; `architecture.docTraceRatio` still records its documentation traces. A ratio outside 0–1, or one that isn't a number, is ignored with a warning instead of dropping every trace.
- **`CPU_LIMIT_MILLICORES` sets `architecture.cpuLimit`** when the code doesn't, so the Kubernetes recipe needs no conversion code.
- **Blank environment variables count as unset** everywhere the kit reads one, as a ConfigMap key left empty arrives as `""`.
- **A knex recipe** for connection pools, naming each pool `host:port/database`.

## 0.9.0

Added

- **The V8 heap ceiling, as `ritele.v8js.memory.heap.limit`** — `heap_size_limit` in bytes, the size at which Node runs out of memory. The runtime metrics report how much heap is used but not where the ceiling is, so a chart had nothing to compare usage against. It is sent whenever metrics are exported and runtime metrics are on, and `runtimeMetrics: false`, or disabling the runtime instrumentation, turns it off with the rest. OpenTelemetry has no standard metric for the ceiling: `v8js.memory.heap.limit` is retired and meant the size of each heap space, so the kit names this one under `ritele.*` rather than give the old name a new meaning.

Changed

- **The kit's own metrics only go to the kit's own meter provider.** If your app registered a meter provider before `Telemetry.start()`, the SDK can't replace it, and `cpuUsage` used to report into yours. It and the heap ceiling are now left out in that case, since the kit isn't the one exporting metrics.

## 0.8.0

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

# Changelog

## Unreleased

Added

- `observeConnectionPool` reports a pool's limit, usage and queue depth under OpenTelemetry's standard `db.client.connection.*` metrics. The limit only exists inside the process, so no database exporter can report it — which makes pool saturation look like a slow database.

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

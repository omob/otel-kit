# Changelog

## 0.2.0

Added

- `diagLogLevel` / `diagLogger` surface OpenTelemetry's own internal logging, which is off by default and is why a bad endpoint or an unreachable collector used to fail in silence.
- `traces.otlp.protocol` selects `http/protobuf`, `http/json` or `grpc`.
- `traces.sampler` accepts a sampler of your own, taking precedence over `sampleRatio`.
- `traces.additionalProcessors` accepts extra span processors, for scrubbing attributes or dual-writing during a collector migration.
- `metrics.views` passes through histogram buckets and cardinality limits.
- `InstrumentationName` now covers all 41 auto-instrumentations. `fs` and `fastify` are the two the upstream package leaves off by default; enable them with `instrumentation.enable`.
- An `exports` map, so the published surface stays the public one.

Fixed

- Every OTLP exporter package is now a declared dependency instead of resolving through hoisting, which failed under pnpm and Yarn PnP.

## 0.1.0

First release.

- `Telemetry.start` / `Telemetry.shutdown` with pluggable trace, metric and log exporters: OTLP, Google Cloud, Prometheus and console.
- `withSpan` handles `recordException`, span status and `end` on every path, with `isError` to keep expected failures out of your error rate.
- Ratio sampling, configurable propagators for W3C, B3 and Jaeger, and per-instrumentation enable and disable.
- Buffered spans flush on SIGTERM and SIGINT, then the signal is handed back so the host's own shutdown runs.
- A rejected configuration disables telemetry and reports through `onStartupError` rather than stopping the host from booting.
- Prometheus binds loopback and span attributes are capped by default.

# Recipes

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
      headers: async () => ({ authorization: `Bearer ${(await client.getAccessToken()).token}` }),
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

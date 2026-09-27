import http from "node:http";
import { ExporterType, InstrumentationName, OtlpProtocol, Telemetry } from "../../dist/index.js";

const received = { metrics: [], resource: {}, urlPaths: [] };
const collector = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    if (req.url === "/v1/traces") {
      for (const resourceSpans of JSON.parse(body).resourceSpans ?? []) {
        for (const scope of resourceSpans.scopeSpans) {
          for (const span of scope.spans) {
            const path = span.attributes.find((attribute) => attribute.key === "url.path");
            if (path) received.urlPaths.push(Object.values(path.value)[0]);
          }
        }
      }
    }

    if (req.url === "/v1/metrics") {
      for (const resourceMetrics of JSON.parse(body).resourceMetrics ?? []) {
        for (const { key, value } of resourceMetrics.resource.attributes) received.resource[key] = Object.values(value)[0];
        for (const scope of resourceMetrics.scopeMetrics) received.metrics.push(...scope.metrics.map((m) => m.name));
      }
    }
    res.end("{}");
  });
});
await new Promise((resolve) => collector.listen(0, "127.0.0.1", resolve));

Telemetry.start({
  serviceName: "health-fixture",
  traces: {
    exporter: ExporterType.OTLP,
    sampleRatio: 0.1,
    otlp: { protocol: OtlpProtocol.HTTP_JSON, url: `http://127.0.0.1:${collector.address().port}/v1/traces` },
  },
  instrumentation: { only: [InstrumentationName.HTTP] },
  runtimeMetrics: process.env.OTEL_KIT_TEST_RUNTIME_METRICS !== "false",
  handleShutdownSignals: false,
});

const { default: appHttp } = await import("node:http");
const app = appHttp.createServer((req, res) => res.end("ok"));
await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
await new Promise((resolve) => appHttp.get(`http://127.0.0.1:${app.address().port}/`, (res) => res.resume().on("end", resolve)));
// a sampled caller makes the server record this request whatever the 10% ratio decides, and a raw socket keeps
// client instrumentation from replacing the header
const { connect } = await import("node:net");
await new Promise((resolve) => {
  const socket = connect(app.address().port, "127.0.0.1", () =>
    socket.write(
      "GET /customers/22123456789 HTTP/1.1\r\nHost: app\r\n" +
        "traceparent: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01\r\nConnection: close\r\n\r\n"
    )
  );
  socket.on("data", () => undefined).on("close", resolve);
});
await new Promise((resolve) => setTimeout(resolve, 100));
app.close();

await Telemetry.shutdown();
collector.close();

process.stdout.write(
  JSON.stringify({ metrics: [...new Set(received.metrics)], resource: received.resource, urlPaths: received.urlPaths })
);

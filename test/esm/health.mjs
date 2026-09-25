import http from "node:http";
import { ExporterType, InstrumentationName, OtlpProtocol, Telemetry } from "../../dist/index.js";

const received = { metrics: [], resource: {} };
const collector = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
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
await new Promise((resolve) => setTimeout(resolve, 100));
app.close();

await Telemetry.shutdown();
collector.close();

process.stdout.write(JSON.stringify({ metrics: [...new Set(received.metrics)], resource: received.resource }));

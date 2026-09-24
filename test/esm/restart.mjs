import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ExporterType, InstrumentationName, Telemetry } from "../../dist/index.js";

let exporter;

const start = () => {
  exporter = new InMemorySpanExporter();
  Telemetry.start({
    serviceName: "restart-fixture",
    traces: { exporter: ExporterType.NONE, additionalProcessors: [new SimpleSpanProcessor(exporter)] },
    instrumentation: { only: [InstrumentationName.HTTP] },
    handleShutdownSignals: false,
  });
};

start();

const http = await import("node:http");
const server = http.createServer((req, res) => res.end("ok"));
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

const hit = () =>
  new Promise((resolve) => http.get(`http://127.0.0.1:${server.address().port}/`, (res) => res.resume().on("end", resolve)));

const httpSpans = async () => {
  await hit();
  await new Promise((resolve) => setTimeout(resolve, 50));
  return exporter.getFinishedSpans();
};

const beforeRestart = await httpSpans();
await Telemetry.shutdown();
start();
const afterRestart = await httpSpans();

server.close();
await Telemetry.shutdown();

const serverSpan = afterRestart.find((s) => s.kind === 1);
const clientSpan = afterRestart.find((s) => s.kind === 2);

process.stdout.write(JSON.stringify({
  beforeRestart: beforeRestart.length,
  afterRestart: afterRestart.length,
  linkedAfterRestart: serverSpan?.parentSpanContext?.spanId === clientSpan?.spanContext().spanId,
}));

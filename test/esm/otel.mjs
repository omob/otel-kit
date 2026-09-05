import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ExporterType, InstrumentationName, Telemetry } from "../../dist/index.js";

const esmHook = process.env.OTEL_KIT_TEST_ESM_HOOK !== "false";
const exporter = new InMemorySpanExporter();
globalThis.__otelKitTestExporter = exporter;

Telemetry.start({
  serviceName: "esm-fixture",
  traces: { exporter: ExporterType.NONE, additionalProcessors: [new SimpleSpanProcessor(exporter)], sampleRatio: 0 },
  instrumentation: {
    only: [InstrumentationName.HTTP, InstrumentationName.UNDICI, InstrumentationName.IOREDIS],
    enable: [InstrumentationName.FASTIFY],
    esmHook,
  },
  architecture: {
    component: { type: "service", layer: "core", domain: "tests" },
    docTraceRatio: 1,                       // sampleRatio is 0, so any recorded span is a documentation trace
    peers: { "127.0.0.1": "loopback-peer" },
  },
  handleShutdownSignals: false,
});

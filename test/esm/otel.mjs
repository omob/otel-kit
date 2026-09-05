import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ExporterType, InstrumentationName, Telemetry } from "../../dist/index.js";

const esmHook = process.env.OTEL_KIT_TEST_ESM_HOOK !== "false";
const exporter = new InMemorySpanExporter();
globalThis.__otelKitTestExporter = exporter;

Telemetry.start({
  serviceName: "esm-fixture",
  traces: { exporter: ExporterType.NONE, additionalProcessors: [new SimpleSpanProcessor(exporter)] },
  instrumentation: {
    only: [InstrumentationName.HTTP, InstrumentationName.IOREDIS],
    enable: [InstrumentationName.FASTIFY],
    esmHook,
  },
  handleShutdownSignals: false,
});

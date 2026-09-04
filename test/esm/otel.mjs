import { ExporterType, InstrumentationName, Telemetry } from "../../dist/index.js";

const esmHook = process.env.OTEL_KIT_TEST_ESM_HOOK !== "false";

Telemetry.start({
  serviceName: "esm-fixture",
  traces: { exporter: ExporterType.CONSOLE },
  instrumentation: { only: [InstrumentationName.IOREDIS], esmHook },
  handleShutdownSignals: false,
});

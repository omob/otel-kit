const { appendFileSync } = require("node:fs");
const { isMainThread } = require("node:worker_threads");
const { ExporterType, Telemetry } = require("../../dist/index.js");

Telemetry.start({
  serviceName: "preload-fixture",
  traces: { exporter: ExporterType.NONE },
  handleShutdownSignals: false,
});

if (Telemetry.isStarted) {
  appendFileSync(process.env.OTEL_KIT_TEST_STARTS, `${isMainThread ? "main" : "worker"}\n`);
}

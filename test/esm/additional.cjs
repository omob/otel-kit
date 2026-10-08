const { HttpInstrumentation } = require("@opentelemetry/instrumentation-http");
const { ExporterType, Telemetry } = require("../../dist/index.js");

Telemetry.start({
  serviceName: "additional-fixture",
  traces: { exporter: ExporterType.NONE },
  handleShutdownSignals: false,
  instrumentation: { additional: [new HttpInstrumentation()] },
});

const http = require("node:http");

console.log(JSON.stringify({ httpPatched: http.request.__wrapped === true && http.Server.prototype.emit.__wrapped === true }));

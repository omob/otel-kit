import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { ExporterType } from "../../src/enums/exporter-type.enum";
import { TelemetryErrorCode } from "../../src/enums/telemetry-error-code.enum";
import MetricReaderFactory from "../../src/factories/metric-reader.factory";

describe("MetricReaderFactory", () => {
  it("builds no reader when metrics are switched off", () => {
    expect(MetricReaderFactory.createReader({ exporter: ExporterType.NONE })).toBeUndefined();
  });

  it("builds a periodic reader for push exporters", () => {
    const reader = MetricReaderFactory.createReader({ exporter: ExporterType.CONSOLE });

    expect(reader).toBeInstanceOf(PeriodicExportingMetricReader);
  });

  it("builds a pull based prometheus reader", async () => {
    const reader = MetricReaderFactory.createReader({
      exporter: ExporterType.PROMETHEUS,
      prometheus: { host: "127.0.0.1", port: 19464, endpoint: "/metrics" },
    });

    expect(reader).toBeInstanceOf(PrometheusExporter);

    await reader?.shutdown();
  });

  it("explains which optional dependency the prometheus exporter needs", () => {
    jest.isolateModules(() => {
      jest.doMock("@opentelemetry/exporter-prometheus", () => {
        throw Object.assign(new Error("not installed"), { code: "MODULE_NOT_FOUND" });
      });

      const Factory = require("../../src/factories/metric-reader.factory").default;

      expect(() => Factory.createReader({ exporter: ExporterType.PROMETHEUS })).toThrow(
        expect.objectContaining({
          errorCode: TelemetryErrorCode.MISSING_OPTIONAL_DEPENDENCY,
          message: expect.stringContaining("@opentelemetry/exporter-prometheus"),
        })
      );
    });
  });

  it("explains which optional dependency the gcp exporter needs", () => {
    expect(() => MetricReaderFactory.createReader({ exporter: ExporterType.GCP })).toThrow(
      expect.objectContaining({
        errorCode: TelemetryErrorCode.MISSING_OPTIONAL_DEPENDENCY,
        message: expect.stringContaining("@google-cloud/opentelemetry-cloud-monitoring-exporter"),
      })
    );
  });
});

import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import { ExporterType } from "../../src/enums/exporter-type.enum";
import { TelemetryErrorCode } from "../../src/enums/telemetry-error-code.enum";
import TraceExporterFactory from "../../src/factories/trace-exporter.factory";

describe("TraceExporterFactory", () => {
  it("builds no exporter when tracing is switched off", () => {
    expect(TraceExporterFactory.createExporter({ exporter: ExporterType.NONE })).toBeUndefined();
  });

  it("builds a console exporter", () => {
    expect(TraceExporterFactory.createExporter({ exporter: ExporterType.CONSOLE })).toBeInstanceOf(
      ConsoleSpanExporter
    );
  });

  it("builds an otlp exporter", () => {
    const exporter = TraceExporterFactory.createExporter({
      exporter: ExporterType.OTLP,
      otlp: { url: "http://collector:4318/v1/traces" },
    });

    expect(exporter).toBeInstanceOf(OTLPTraceExporter);
  });

  it("rejects an exporter that cannot export traces", () => {
    expect(() => TraceExporterFactory.createExporter({ exporter: ExporterType.PROMETHEUS })).toThrow(
      expect.objectContaining({ errorCode: TelemetryErrorCode.UNSUPPORTED_EXPORTER })
    );
  });

  it("explains which optional dependency the gcp exporter needs", () => {
    expect(() => TraceExporterFactory.createExporter({ exporter: ExporterType.GCP })).toThrow(
      expect.objectContaining({
        errorCode: TelemetryErrorCode.MISSING_OPTIONAL_DEPENDENCY,
        message: expect.stringContaining("@google-cloud/opentelemetry-cloud-trace-exporter"),
      })
    );
  });
});

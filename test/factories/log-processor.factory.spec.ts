import { BatchLogRecordProcessor, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { ExporterType } from "../../src/enums/exporter-type.enum";
import { TelemetryErrorCode } from "../../src/enums/telemetry-error-code.enum";
import LogProcessorFactory from "../../src/factories/log-processor.factory";

describe("LogProcessorFactory", () => {
  it("builds no processor when logs are switched off", () => {
    expect(LogProcessorFactory.createProcessors({ exporter: ExporterType.NONE })).toEqual([]);
  });

  it("writes console logs through a simple processor", () => {
    expect(LogProcessorFactory.createProcessors({ exporter: ExporterType.CONSOLE })[0]).toBeInstanceOf(
      SimpleLogRecordProcessor
    );
  });

  it("batches otlp logs", () => {
    expect(LogProcessorFactory.createProcessors({ exporter: ExporterType.OTLP })[0]).toBeInstanceOf(
      BatchLogRecordProcessor
    );
  });

  it("rejects an exporter that cannot export logs", () => {
    expect(() => LogProcessorFactory.createProcessors({ exporter: ExporterType.GCP })).toThrow(
      expect.objectContaining({ errorCode: TelemetryErrorCode.UNSUPPORTED_EXPORTER })
    );
  });
});

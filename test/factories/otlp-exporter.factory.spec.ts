import { OtlpProtocol } from "../../src/enums/otlp-protocol.enum";
import { TelemetryErrorCode } from "../../src/enums/telemetry-error-code.enum";
import { TelemetrySignal } from "../../src/enums/telemetry-signal.enum";
import OtlpExporterFactory from "../../src/factories/otlp-exporter.factory";

describe("OtlpExporterFactory", () => {
  it.each([
    [TelemetrySignal.TRACES, "OTLPTraceExporter"],
    [TelemetrySignal.METRICS, "OTLPMetricExporter"],
    [TelemetrySignal.LOGS, "OTLPLogExporter"],
  ])("defaults %s to the protobuf exporter", (signal, exporterName) => {
    expect(OtlpExporterFactory.createExporter<object>(signal).constructor.name).toBe(exporterName);
  });

  it("builds an exporter for a configured endpoint", () => {
    const exporter = OtlpExporterFactory.createExporter<object>(TelemetrySignal.TRACES, {
      url: "http://collector:4318/v1/traces",
    });

    expect(exporter.constructor.name).toBe("OTLPTraceExporter");
  });

  it.each([OtlpProtocol.HTTP_PROTOBUF, OtlpProtocol.HTTP_JSON, OtlpProtocol.GRPC])(
    "builds a trace exporter for the %s protocol",
    (protocol) => {
      expect(OtlpExporterFactory.createExporter<object>(TelemetrySignal.TRACES, { protocol })).toBeDefined();
    }
  );

  it.each([OtlpProtocol.HTTP_PROTOBUF, OtlpProtocol.HTTP_JSON, OtlpProtocol.GRPC])(
    "builds a metric exporter for the %s protocol",
    (protocol) => {
      expect(OtlpExporterFactory.createExporter<object>(TelemetrySignal.METRICS, { protocol })).toBeDefined();
    }
  );

  it("accepts a dynamic headers factory, which token-refreshing backends require", async () => {
    const headers = async () => ({ authorization: "Bearer refreshed-token" });

    const exporter = OtlpExporterFactory.createExporter<object>(TelemetrySignal.TRACES, {
      url: "https://telemetry.googleapis.com/v1/traces",
      headers,
    });

    expect(exporter).toBeDefined();
    await expect(headers()).resolves.toEqual({ authorization: "Bearer refreshed-token" });
  });

  it("rejects an unknown protocol", () => {
    expect(() =>
      OtlpExporterFactory.createExporter<object>(TelemetrySignal.TRACES, { protocol: "carrier-pigeon" as OtlpProtocol })
    ).toThrow(expect.objectContaining({ errorCode: TelemetryErrorCode.UNSUPPORTED_PROTOCOL }));
  });
});

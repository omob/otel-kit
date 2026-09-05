describe("package entry point", () => {
  it("exposes the public surface", () => {
    const entry = require("../src/index");

    expect(Object.keys(entry).sort()).toEqual(
      ["DOC_TRACE_STATE_KEY", "DOC_TRACE_STATE_VALUE", "ExporterType", "InstrumentationName", "OtlpProtocol", "PropagatorType", "Telemetry", "TelemetryConfigError", "TelemetryErrorCode", "TelemetrySignal", "currentTraceId", "getTracer", "observeConnectionPool", "withSpan"].sort()
    );
  });

  it("keeps the sdk out of the module graph of apps that only import the span helpers", () => {
    jest.isolateModules(() => {
      jest.doMock("@opentelemetry/sdk-node", () => {
        throw new Error("the sdk was loaded at import time");
      });

      expect(() => require("../src/index")).not.toThrow();
    });
  });

  it("loads the sdk when telemetry starts", () => {
    jest.isolateModules(() => {
      jest.doMock("@opentelemetry/sdk-node", () => {
        throw new Error("the sdk was loaded at import time");
      });

      const { Telemetry } = require("../src/index");
      const onStartupError = jest.fn();

      Telemetry.start({ serviceName: "kreela-api", handleShutdownSignals: false, onStartupError });

      expect(onStartupError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "the sdk was loaded at import time" })
      );
    });
  });
});

import { TelemetryErrorCode } from "../../src/enums/telemetry-error-code.enum";
import { loadOptionalDependency } from "../../src/utils/optional-dependency";

describe("loadOptionalDependency", () => {
  it("returns an installed module", () => {
    expect(loadOptionalDependency("@opentelemetry/exporter-prometheus")).toHaveProperty("PrometheusExporter");
  });

  it("names the module the host project has to install", () => {
    expect(() => loadOptionalDependency("@not-installed/exporter")).toThrow(
      expect.objectContaining({
        errorCode: TelemetryErrorCode.MISSING_OPTIONAL_DEPENDENCY,
        message: expect.stringContaining("@not-installed/exporter"),
      })
    );
  });

  it("rethrows a module that is installed but fails to load", () => {
    jest.isolateModules(() => {
      jest.doMock("@opentelemetry/exporter-prometheus", () => {
        throw new Error("exporter blew up on import");
      });

      const { loadOptionalDependency: load } = require("../../src/utils/optional-dependency");

      expect(() => load("@opentelemetry/exporter-prometheus")).toThrow("exporter blew up on import");
    });
  });
});

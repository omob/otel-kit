import TelemetryConfigError from "../errors/telemetry-config.error";
import { TelemetryErrorCode } from "../enums/telemetry-error-code.enum";

export function loadOptionalDependency<T>(moduleName: string): T {
  try {
    return require(moduleName) as T;
  } catch (error) {
    // a module that exists but fails to load is a real bug, not a missing install
    if ((error as NodeJS.ErrnoException).code !== "MODULE_NOT_FOUND") {
      throw error;
    }

    throw new TelemetryConfigError(
      TelemetryErrorCode.MISSING_OPTIONAL_DEPENDENCY,
      `${moduleName} is not installed. Add it to the host project to use this exporter.`
    );
  }
}

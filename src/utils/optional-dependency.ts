import TelemetryConfigError from "../errors/telemetry-config.error";
import { TelemetryErrorCode } from "../enums/telemetry-error-code.enum";

export function loadOptionalDependency<T>(moduleName: string): T {
  try {
    require.resolve(moduleName);
  } catch {
    throw new TelemetryConfigError(
      TelemetryErrorCode.MISSING_OPTIONAL_DEPENDENCY,
      `${moduleName} is not installed. Add it to the host project to use this exporter.`
    );
  }

  // resolving separately keeps a genuine load failure inside the module from being reported as a missing install
  return require(moduleName) as T;
}

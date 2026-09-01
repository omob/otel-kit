import { TelemetryErrorCode } from "../enums/telemetry-error-code.enum";

class TelemetryConfigError extends Error {
  public readonly errorCode: TelemetryErrorCode;

  constructor(errorCode: TelemetryErrorCode, message: string) {
    super(message);

    this.name = "TelemetryConfigError";
    this.errorCode = errorCode;

    Error.captureStackTrace(this, this.constructor);
  }
}

export default TelemetryConfigError;

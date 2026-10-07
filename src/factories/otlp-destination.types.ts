import { OtlpEnvironmentVariable } from "../enums/otlp-environment-variable.enum";
import { TelemetrySignal } from "../enums/telemetry-signal.enum";

export type DerivedSignal = TelemetrySignal.METRICS | TelemetrySignal.LOGS;

export interface ISignalEnvironment {
  endpoint: OtlpEnvironmentVariable;
  exporter: OtlpEnvironmentVariable;
  path: string;
}

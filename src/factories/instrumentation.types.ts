import type { InstrumentationConfig } from "@opentelemetry/instrumentation";

export interface ILogInstrumentationConfig extends InstrumentationConfig {
  disableLogSending?: boolean;
}

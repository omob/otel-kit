import { IOtlpOptions } from "../telemetry.types";

export function toOtlpExporterOptions(options: IOtlpOptions = {}) {
  return {
    ...(options.url ? { url: options.url } : {}),
    ...(options.headers ? { headers: options.headers } : {}),
    ...(options.timeoutMillis ? { timeoutMillis: options.timeoutMillis } : {}),
  };
}

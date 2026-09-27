import { IOtlpOptions } from "../telemetry.types";

export function toOtlpExporterOptions(options: IOtlpOptions = {}) {
  return {
    ...(options.url?.trim() ? { url: options.url.trim() } : {}),
    ...(options.headers ? { headers: options.headers } : {}),
    ...(options.timeoutMillis !== undefined ? { timeoutMillis: options.timeoutMillis } : {}),
  };
}

import { diag } from "@opentelemetry/api";

let diagnosticsConfigured = false;

// a host that routed OTel diagnostics to its own logger expects the kit's warnings there; everyone else would miss them
export function routeWarningsToDiagnostics(configured: boolean): void {
  diagnosticsConfigured = configured;
}

export function warn(message: string): void {
  if (diagnosticsConfigured) {
    diag.warn(message);
  } else {
    console.warn(message);
  }
}

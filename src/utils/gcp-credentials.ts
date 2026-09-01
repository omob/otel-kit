import { existsSync } from "fs";
import { IGcpOptions } from "../telemetry.types";

export function toGcpExporterOptions(options: IGcpOptions = {}) {
  const keyFile = options.keyFile ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const projectId = options.projectId ?? process.env.GCP_PROJECT_ID;

  // an unreadable keyFile must be omitted entirely so the exporter falls back to application default credentials
  return {
    ...(projectId ? { projectId } : {}),
    ...(keyFile && existsSync(keyFile) ? { keyFile } : {}),
  };
}

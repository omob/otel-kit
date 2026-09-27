import { existsSync } from "fs";
import { EnvironmentVariable } from "../enums/environment-variable.enum";
import { IGcpOptions } from "../telemetry.types";
import { readEnvironment } from "./environment";

export function toGcpExporterOptions(options: IGcpOptions = {}) {
  const keyFile = options.keyFile ?? readEnvironment(EnvironmentVariable.GOOGLE_APPLICATION_CREDENTIALS);
  const projectId = options.projectId ?? readEnvironment(EnvironmentVariable.GCP_PROJECT_ID);

  // an unreadable keyFile must be omitted entirely so the exporter falls back to application default credentials
  return {
    ...(projectId ? { projectId } : {}),
    ...(keyFile && existsSync(keyFile) ? { keyFile } : {}),
  };
}

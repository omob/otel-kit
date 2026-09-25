import { randomUUID } from "node:crypto";
import { diag } from "@opentelemetry/api";
import { defaultResource, resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_INSTANCE_ID, ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import type { Resource } from "@opentelemetry/resources";
import { ArchitectureAttribute } from "../enums/architecture-attribute.enum";
import { ExporterType } from "../enums/exporter-type.enum";
import { IArchitectureConfig, ITelemetryConfig, ResourceAttributeValue } from "../telemetry.types";

// still an incubating convention, whose subpath export only resolves under node16 module resolution
const ATTR_DEPLOYMENT_ENVIRONMENT_NAME = "deployment.environment.name";
// NodeSDK's default detectors never set it; one id per process, kept across Telemetry restarts
const SERVICE_INSTANCE_ID = randomUUID();

class ResourceFactory {
  static createResource(config: ITelemetryConfig): Resource {
    const attributes: Record<string, ResourceAttributeValue> = {
      [ATTR_SERVICE_INSTANCE_ID]: SERVICE_INSTANCE_ID,
      ...config.resourceAttributes,
      ...ResourceFactory.architectureAttributes(config.architecture),
      ...ResourceFactory.sampleProbability(config),
      [ATTR_SERVICE_NAME]: config.serviceName,
    };
    const serviceVersion = config.serviceVersion ?? process.env.npm_package_version;

    if (serviceVersion) {
      attributes[ATTR_SERVICE_VERSION] = serviceVersion;
    }

    if (config.environment) {
      attributes[ATTR_DEPLOYMENT_ENVIRONMENT_NAME] = config.environment;
    }

    return defaultResource().merge(resourceFromAttributes(attributes));
  }

  // the doc-trace range never overlaps the ratio sampler's, so the two probabilities add rather than compound;
  // a custom sampler's rate is unknown, and a guess would scale span counts wrongly
  static sampleProbability(config: ITelemetryConfig): Record<string, ResourceAttributeValue> {
    const traces = config.traces;

    if (!traces || traces.exporter === ExporterType.NONE || traces.sampler) {
      return {};
    }

    const sampleRatio = traces.sampleRatio ?? 1;
    const docTraceRatio = config.architecture?.docTraceRatio ?? 0;

    return { [ArchitectureAttribute.SAMPLE_PROBABILITY]: Math.min(1, sampleRatio + docTraceRatio) };
  }

  // architectural intent travels on the resource so every span from this process carries it
  static architectureAttributes(architecture: IArchitectureConfig | undefined): Record<string, ResourceAttributeValue> {
    if (!architecture) {
      return {};
    }

    const out: Record<string, ResourceAttributeValue> = {};
    const { component, intendedDependencies, concurrency, cpuLimit } = architecture;

    const componentAttributes: Array<[ArchitectureAttribute, string | undefined]> = [
      [ArchitectureAttribute.COMPONENT_TYPE, component?.type],
      [ArchitectureAttribute.LAYER, component?.layer],
      [ArchitectureAttribute.DOMAIN, component?.domain],
      [ArchitectureAttribute.OWNER, component?.owner],
    ];

    for (const [attribute, value] of componentAttributes) {
      if (value) {
        out[attribute] = value;
      }
    }

    if (intendedDependencies?.length) {
      out[ArchitectureAttribute.INTENDED_DEPENDENCIES] = intendedDependencies;
    }

    for (const [key, limit] of Object.entries(concurrency ?? {})) {
      if (Number.isFinite(limit) && limit > 0) {
        out[`${ArchitectureAttribute.CONCURRENCY_PREFIX}${key}`] = limit;
      } else {
        diag.warn(`@omob/otel-kit ignores the concurrency limit "${key}: ${limit}"; it must be a positive number`);
      }
    }

    if (cpuLimit !== undefined) {
      if (Number.isFinite(cpuLimit) && cpuLimit > 0) {
        out[ArchitectureAttribute.CPU_LIMIT] = cpuLimit;
      } else {
        diag.warn(`@omob/otel-kit ignores the CPU limit "${cpuLimit}"; it must be a positive number of cores`);
      }
    }

    return out;
  }
}

export default ResourceFactory;

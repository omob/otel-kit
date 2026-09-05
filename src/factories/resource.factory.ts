import { diag } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import type { Resource } from "@opentelemetry/resources";
import { ArchitectureAttribute } from "../enums/architecture-attribute.enum";
import { IArchitectureConfig, ITelemetryConfig, ResourceAttributeValue } from "../telemetry.types";

// still an incubating convention, whose subpath export only resolves under node16 module resolution
const ATTR_DEPLOYMENT_ENVIRONMENT_NAME = "deployment.environment.name";

class ResourceFactory {
  static createResource(config: ITelemetryConfig): Resource {
    const attributes: Record<string, ResourceAttributeValue> = {
      ...config.resourceAttributes,
      ...ResourceFactory.architectureAttributes(config.architecture),
      [ATTR_SERVICE_NAME]: config.serviceName,
    };

    if (config.serviceVersion) {
      attributes[ATTR_SERVICE_VERSION] = config.serviceVersion;
    }

    if (config.environment) {
      attributes[ATTR_DEPLOYMENT_ENVIRONMENT_NAME] = config.environment;
    }

    return resourceFromAttributes(attributes);
  }

  // architectural intent travels on the resource so every span from this process carries it
  static architectureAttributes(architecture: IArchitectureConfig | undefined): Record<string, ResourceAttributeValue> {
    if (!architecture) {
      return {};
    }

    const out: Record<string, ResourceAttributeValue> = {};
    const { component, intendedDependencies, concurrency } = architecture;

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

    return out;
  }
}

export default ResourceFactory;

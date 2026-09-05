import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import type { Resource } from "@opentelemetry/resources";
import { IArchitectureConfig, ITelemetryConfig, ResourceAttributeValue } from "../telemetry.types";

// still an incubating convention, whose subpath export only resolves under node16 module resolution
const ATTR_DEPLOYMENT_ENVIRONMENT_NAME = "deployment.environment.name";

export const ARCH_ATTR = {
  componentType: "archscope.component.type",
  layer: "archscope.layer",
  domain: "archscope.domain",
  owner: "archscope.owner",
  intendedDeps: "archscope.intended_deps",
  concurrencyPrefix: "archscope.concurrency.",
} as const;

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

    if (component?.type) out[ARCH_ATTR.componentType] = component.type;
    if (component?.layer) out[ARCH_ATTR.layer] = component.layer;
    if (component?.domain) out[ARCH_ATTR.domain] = component.domain;
    if (component?.owner) out[ARCH_ATTR.owner] = component.owner;

    if (intendedDependencies?.length) {
      out[ARCH_ATTR.intendedDeps] = JSON.stringify(intendedDependencies);
    }

    for (const [key, limit] of Object.entries(concurrency ?? {})) {
      if (Number.isFinite(limit) && limit > 0) {
        out[`${ARCH_ATTR.concurrencyPrefix}${key}`] = limit;
      }
    }

    return out;
  }
}

export default ResourceFactory;

import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import type { Resource } from "@opentelemetry/resources";
import { ITelemetryConfig, ResourceAttributeValue } from "../telemetry.types";

// still an incubating convention, whose subpath export only resolves under node16 module resolution
const ATTR_DEPLOYMENT_ENVIRONMENT_NAME = "deployment.environment.name";

class ResourceFactory {
  static createResource(config: ITelemetryConfig): Resource {
    const attributes: Record<string, ResourceAttributeValue> = {
      ...config.resourceAttributes,
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
}

export default ResourceFactory;

import { envDetector, hostDetector, processDetector } from "@opentelemetry/resources";
import type { ResourceDetector } from "@opentelemetry/resources";
import { ProcessAttribute } from "../enums/process-attribute.enum";

const RESOURCE_DETECTORS_ENV = "OTEL_NODE_RESOURCE_DETECTORS";

class ResourceDetectorFactory {
  // undefined defers to NodeSDK, which honours an explicit OTEL_NODE_RESOURCE_DETECTORS list as given
  static createDetectors(): ResourceDetector[] | undefined {
    if (process.env[RESOURCE_DETECTORS_ENV]) {
      return undefined;
    }

    return [envDetector, ResourceDetectorFactory.createProcessDetector(), hostDetector];
  }

  // argv routinely carries secrets passed as flags, and the owner and script path identify the host
  static createProcessDetector(): ResourceDetector {
    return {
      detect: (config) => {
        const { attributes = {} } = processDetector.detect(config);

        for (const dropped of Object.values(ProcessAttribute)) {
          delete attributes[dropped];
        }

        return { attributes };
      },
    };
  }
}

export default ResourceDetectorFactory;

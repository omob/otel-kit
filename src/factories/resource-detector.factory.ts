import { createHash, createHmac } from "node:crypto";
import { diag } from "@opentelemetry/api";
import { containerDetector } from "@opentelemetry/resource-detector-container";
import { envDetector, hostDetector, osDetector, processDetector, serviceInstanceIdDetector } from "@opentelemetry/resources";
import type { DetectedResourceAttributes, ResourceDetector } from "@opentelemetry/resources";
import { HostAttribute } from "../enums/host-attribute.enum";
import { HostNameMode } from "../enums/host-name-mode.enum";
import { ProcessAttribute } from "../enums/process-attribute.enum";
import { ResourceDetectorName } from "../enums/resource-detector-name.enum";

const RESOURCE_DETECTORS_ENV = "OTEL_NODE_RESOURCE_DETECTORS";
const DEFAULT_DETECTORS = [
  ResourceDetectorName.ENV,
  ResourceDetectorName.PROCESS,
  ResourceDetectorName.HOST,
  ResourceDetectorName.CONTAINER,
];
// laptops and desktops, usually named after their owner; Linux counts only with a graphical session or under WSL
const PERSONAL_PLATFORMS: NodeJS.Platform[] = ["darwin", "win32"];
const DESKTOP_SESSION_ENV = ["DISPLAY", "WAYLAND_DISPLAY", "XDG_CURRENT_DESKTOP", "WSL_DISTRO_NAME"];
const PSEUDONYM_PREFIX = "host-";
const PSEUDONYM_LENGTH = 12;

class ResourceDetectorFactory {
  // the kit resolves OTEL_NODE_RESOURCE_DETECTORS itself, so the list it names still goes through the same filters
  static createDetectors(hostName = HostNameMode.AUTO): ResourceDetector[] {
    const detectors: Record<ResourceDetectorName, ResourceDetector[]> = {
      [ResourceDetectorName.ENV]: [envDetector],
      [ResourceDetectorName.HOST]: [ResourceDetectorFactory.createHostDetector(hostName)],
      [ResourceDetectorName.OS]: [osDetector],
      [ResourceDetectorName.PROCESS]: [ResourceDetectorFactory.createProcessDetector()],
      [ResourceDetectorName.SERVICE_INSTANCE]: [serviceInstanceIdDetector],
      [ResourceDetectorName.CONTAINER]: [containerDetector],
      [ResourceDetectorName.ALL]: [],
      [ResourceDetectorName.NONE]: [],
    };
    const requested = ResourceDetectorFactory.requestedDetectors();

    if (requested.includes(ResourceDetectorName.ALL)) {
      return Object.values(detectors).flat();
    }

    const names = requested.includes(ResourceDetectorName.NONE) ? [] : requested;

    return names.flatMap((name) => detectors[name]);
  }

  static createHostDetector(
    hostName: HostNameMode,
    platform: NodeJS.Platform = process.platform,
    environment: NodeJS.ProcessEnv = process.env
  ): ResourceDetector {
    const mode = hostName === HostNameMode.AUTO ? ResourceDetectorFactory.autoMode(platform, environment) : hostName;

    if (mode === HostNameMode.KEEP) {
      return hostDetector;
    }

    return {
      detect: (config) => {
        const { attributes = {} } = hostDetector.detect(config);

        return { attributes: ResourceDetectorFactory.withoutHostIdentity(attributes, mode) };
      },
    };
  }

  static pseudonym(value: string): string {
    return `${PSEUDONYM_PREFIX}${createHash("sha256").update(value).digest("hex").slice(0, PSEUDONYM_LENGTH)}`;
  }

  // keyed by the machine id, which never leaves the process, so guessing likely host names cannot reverse it
  static namePseudonym(hostName: string, machineId: string): string {
    return `${PSEUDONYM_PREFIX}${createHmac("sha256", machineId).update(hostName).digest("hex").slice(0, PSEUDONYM_LENGTH)}`;
  }

  // argv routinely carries secrets passed as flags, and the owner and the script and binary paths name the user
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

  private static autoMode(platform: NodeJS.Platform, environment: NodeJS.ProcessEnv): HostNameMode {
    const desktop =
      PERSONAL_PLATFORMS.includes(platform) || DESKTOP_SESSION_ENV.some((variable) => Boolean(environment[variable]));

    return desktop ? HostNameMode.HASH : HostNameMode.KEEP;
  }

  private static withoutHostIdentity(attributes: DetectedResourceAttributes, mode: HostNameMode): DetectedResourceAttributes {
    const hidden = { ...attributes };
    const name = hidden[HostAttribute.NAME];
    const machineId = Promise.resolve(hidden[HostAttribute.ID]);

    // the machine id is a hardware fingerprint; hashed, it still keys the host
    hidden[HostAttribute.ID] = machineId.then((id) => (typeof id === "string" ? ResourceDetectorFactory.pseudonym(id) : undefined));

    if (mode === HostNameMode.HIDE || typeof name !== "string") {
      delete hidden[HostAttribute.NAME];
    } else {
      hidden[HostAttribute.NAME] = machineId.then((id) =>
        typeof id === "string" ? ResourceDetectorFactory.namePseudonym(name, id) : undefined
      );
    }

    return hidden;
  }

  private static requestedDetectors(): ResourceDetectorName[] {
    const configured = process.env[RESOURCE_DETECTORS_ENV];

    if (!configured) {
      return DEFAULT_DETECTORS;
    }

    const known = new Set<string>(Object.values(ResourceDetectorName));
    const names = configured.split(",").map((name) => name.trim()).filter(Boolean);

    for (const unknown of names.filter((name) => !known.has(name))) {
      diag.warn(`@omob/otel-kit ignores the unknown resource detector "${unknown}" in ${RESOURCE_DETECTORS_ENV}`);
    }

    return names.filter((name): name is ResourceDetectorName => known.has(name));
  }
}

export default ResourceDetectorFactory;

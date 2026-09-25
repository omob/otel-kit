import { containerDetector } from "@opentelemetry/resource-detector-container";
import ResourceDetectorFactory from "../../src/factories/resource-detector.factory";

describe("ResourceDetectorFactory", () => {
  it("detects the process without its command line, script, owner or executable", () => {
    const { attributes } = ResourceDetectorFactory.createProcessDetector().detect();

    const keys = Object.keys(attributes ?? {});

    expect(attributes?.["process.pid"]).toBe(process.pid);
    expect(keys).not.toContain("process.command");
    expect(keys).not.toContain("process.command_args");
    expect(keys).not.toContain("process.owner");
    expect(keys).not.toContain("process.executable.name");
    expect(keys).not.toContain("process.executable.path");
  });

  it("defers to OTEL_NODE_RESOURCE_DETECTORS when it is set", () => {
    process.env.OTEL_NODE_RESOURCE_DETECTORS = "env,host";

    const detectors = ResourceDetectorFactory.createDetectors();

    delete process.env.OTEL_NODE_RESOURCE_DETECTORS;

    expect(detectors).toBeUndefined();
    expect(ResourceDetectorFactory.createDetectors()).toHaveLength(4);
  });

  it("detects the container the process runs in", () => {
    expect(ResourceDetectorFactory.createDetectors()).toContain(containerDetector);
  });
});

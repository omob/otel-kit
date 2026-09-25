import { containerDetector } from "@opentelemetry/resource-detector-container";
import { hostDetector } from "@opentelemetry/resources";
import { HostNameMode } from "../../src/enums/host-name-mode.enum";
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

  it("runs env, process, host and container detection by default", () => {
    expect(ResourceDetectorFactory.createDetectors()).toHaveLength(4);
  });

  const detectHost = async (
    mode: HostNameMode,
    platform: NodeJS.Platform,
    environment: NodeJS.ProcessEnv = {}
  ): Promise<Record<string, unknown>> => {
    const detect = jest.spyOn(hostDetector, "detect").mockReturnValue({
      attributes: { "host.name": "Ada-MacBook-Pro.local", "host.id": "0f1e2d3c-machine", "host.arch": "arm64" },
    });

    try {
      const { attributes = {} } = ResourceDetectorFactory.createHostDetector(mode, platform, environment).detect();

      return { ...attributes, "host.name": await attributes["host.name"], "host.id": await attributes["host.id"] };
    } finally {
      detect.mockRestore();
    }
  };

  it.each([
    [HostNameMode.AUTO, "darwin", {}, "hashed"],
    [HostNameMode.AUTO, "win32", {}, "hashed"],
    [HostNameMode.AUTO, "linux", {}, "real"],
    [HostNameMode.AUTO, "linux", { XDG_CURRENT_DESKTOP: "GNOME" }, "hashed"],
    [HostNameMode.AUTO, "linux", { WSL_DISTRO_NAME: "Ubuntu" }, "hashed"],
    [HostNameMode.KEEP, "darwin", {}, "real"],
    [HostNameMode.HASH, "linux", {}, "hashed"],
    [HostNameMode.HIDE, "linux", {}, "hidden"],
  ] as const)("with hostName %p on %p %p, sends %p host identity", async (mode, platform, environment, expected) => {
    const attributes = await detectHost(mode, platform, environment);
    const byExpectation = {
      real: () => expect(attributes).toMatchObject({ "host.name": "Ada-MacBook-Pro.local", "host.id": "0f1e2d3c-machine" }),
      hashed: () =>
        expect(attributes).toMatchObject({
          "host.name": ResourceDetectorFactory.namePseudonym("Ada-MacBook-Pro.local", "0f1e2d3c-machine"),
          "host.id": ResourceDetectorFactory.pseudonym("0f1e2d3c-machine"),
        }),
      hidden: () => {
        expect(attributes["host.name"]).toBeUndefined();
        expect(attributes["host.id"]).toBe(ResourceDetectorFactory.pseudonym("0f1e2d3c-machine"));
      },
    };

    byExpectation[expected]();
    expect(attributes["host.arch"]).toBe("arm64");
  });

  it("keys the host name pseudonym by the machine id, so a guessed name does not reproduce it", () => {
    const pseudonym = ResourceDetectorFactory.namePseudonym("Ada-MacBook-Pro.local", "0f1e2d3c-machine");

    expect(pseudonym).toMatch(/^host-[0-9a-f]{12}$/);
    expect(pseudonym).not.toBe(ResourceDetectorFactory.pseudonym("Ada-MacBook-Pro.local"));
    expect(ResourceDetectorFactory.namePseudonym("Ada-MacBook-Pro.local", "0f1e2d3c-machine")).toBe(pseudonym);
  });

  it("sends no host name on a personal machine that has no machine id", async () => {
    const detect = jest.spyOn(hostDetector, "detect").mockReturnValue({ attributes: { "host.name": "Ada-MacBook-Pro.local" } });

    try {
      const { attributes = {} } = ResourceDetectorFactory.createHostDetector(HostNameMode.HASH, "darwin").detect();

      expect(await attributes["host.name"]).toBeUndefined();
      expect(await attributes["host.id"]).toBeUndefined();
    } finally {
      detect.mockRestore();
    }
  });

  it("gives each machine the same pseudonym on every run, and names no one", () => {
    const pseudonym = ResourceDetectorFactory.pseudonym("Ada-MacBook-Pro.local");

    expect(pseudonym).toMatch(/^host-[0-9a-f]{12}$/);
    expect(ResourceDetectorFactory.pseudonym("Ada-MacBook-Pro.local")).toBe(pseudonym);
    expect(ResourceDetectorFactory.pseudonym("Grace-MacBook-Pro.local")).not.toBe(pseudonym);
  });

  it.each([
    ["host,process", 2],
    ["all", 6],
    ["none", 0],
    ["host, bogus", 1],
    ["all,none", 6],
  ])("resolves OTEL_NODE_RESOURCE_DETECTORS=%p through the kit's own filtered detectors", (value, count) => {
    process.env.OTEL_NODE_RESOURCE_DETECTORS = value;

    try {
      const detectors = ResourceDetectorFactory.createDetectors(HostNameMode.HIDE);

      expect(detectors).toHaveLength(count);
      expect(detectors).not.toContain(hostDetector);
    } finally {
      delete process.env.OTEL_NODE_RESOURCE_DETECTORS;
    }
  });

  it("detects the container the process runs in", () => {
    expect(ResourceDetectorFactory.createDetectors()).toContain(containerDetector);
  });
});

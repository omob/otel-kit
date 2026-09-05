import ResourceFactory from "../../src/factories/resource.factory";

describe("ResourceFactory", () => {
  it("maps the service identity onto semantic convention attributes", () => {
    const resource = ResourceFactory.createResource({
      serviceName: "kreela-api",
      serviceVersion: "2.3.4",
      environment: "staging",
    });

    expect(resource.attributes).toMatchObject({
      "service.name": "kreela-api",
      "service.version": "2.3.4",
      "deployment.environment.name": "staging",
    });
  });

  it("omits the attributes that were not configured", () => {
    const resource = ResourceFactory.createResource({ serviceName: "kreela-api" });

    expect(resource.attributes).not.toHaveProperty("service.version");
    expect(resource.attributes).not.toHaveProperty("deployment.environment.name");
  });

  it("keeps custom attributes but never lets them override the service name", () => {
    const resource = ResourceFactory.createResource({
      serviceName: "kreela-api",
      resourceAttributes: { team: "platform", "service.name": "spoofed" },
    });

    expect(resource.attributes).toMatchObject({ team: "platform", "service.name": "kreela-api" });
  });
});

describe("ResourceFactory architecture attributes", () => {
  it("emits archscope.* resource attributes from the architecture block", () => {
    const resource = ResourceFactory.createResource({
      serviceName: "wallet",
      architecture: {
        component: { type: "service", layer: "core", domain: "payments", owner: "team-wallet" },
        intendedDependencies: ["postgresql:ledger", "kafka:transfers"],
        concurrency: { http: 200, pgPool: 20, bogus: -1 },
      },
    });
    expect(resource.attributes).toMatchObject({
      "archscope.component.type": "service",
      "archscope.layer": "core",
      "archscope.domain": "payments",
      "archscope.owner": "team-wallet",
      "archscope.intended_deps": JSON.stringify(["postgresql:ledger", "kafka:transfers"]),
      "archscope.concurrency.http": 200,
      "archscope.concurrency.pgPool": 20,
    });
    expect(resource.attributes["archscope.concurrency.bogus"]).toBeUndefined();
  });

  it("emits nothing without an architecture block", () => {
    const keys = Object.keys(ResourceFactory.createResource({ serviceName: "x" }).attributes);
    expect(keys.some((k) => k.startsWith("archscope."))).toBe(false);
  });
});

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

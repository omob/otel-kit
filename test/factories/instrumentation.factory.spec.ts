import type { Instrumentation } from "@opentelemetry/instrumentation";
import type { IncomingMessage } from "http";
import { InstrumentationName } from "../../src/enums/instrumentation-name.enum";
import InstrumentationFactory from "../../src/factories/instrumentation.factory";
import { IInstrumentationConfig } from "../../src/telemetry.types";

const namesOf = (instrumentations: Instrumentation[]) =>
  instrumentations.map((instrumentation) => instrumentation.instrumentationName);

const ignoreHookFor = (config: IInstrumentationConfig) => {
  const http = InstrumentationFactory.createInstrumentations(config).find(
    (instrumentation) => instrumentation.instrumentationName === InstrumentationName.HTTP
  );

  return (http?.getConfig() as { ignoreIncomingRequestHook: (request: IncomingMessage) => boolean })
    .ignoreIncomingRequestHook;
};

describe("InstrumentationFactory", () => {
  it("leaves the fs instrumentation off by default", () => {
    expect(namesOf(InstrumentationFactory.createInstrumentations())).not.toContain(InstrumentationName.FS);
  });

  it("drops every instrumentation in the disable list", () => {
    const names = namesOf(InstrumentationFactory.createInstrumentations({ disable: [InstrumentationName.DNS] }));

    expect(names).not.toContain(InstrumentationName.DNS);
    expect(names).toContain(InstrumentationName.HTTP);
  });

  it("turns on an instrumentation that is off by default", () => {
    const names = namesOf(InstrumentationFactory.createInstrumentations({ enable: [InstrumentationName.FS] }));

    expect(names).toContain(InstrumentationName.FS);
  });

  it("lets enable win over disable for the same instrumentation", () => {
    const names = namesOf(
      InstrumentationFactory.createInstrumentations({
        disable: [InstrumentationName.DNS],
        enable: [InstrumentationName.DNS],
      })
    );

    expect(names).toContain(InstrumentationName.DNS);
  });

  it("appends additional instrumentations", () => {
    const additional = { instrumentationName: "custom" } as Instrumentation;

    expect(namesOf(InstrumentationFactory.createInstrumentations({ additional: [additional] }))).toContain("custom");
  });

  it.each(["/health", "/health/live", "/health?verbose=true"])("ignores incoming requests to %s", (url) => {
    const hook = ignoreHookFor({ ignoreIncomingPaths: ["/health"] });

    expect(hook({ url } as IncomingMessage)).toBe(true);
  });

  it.each(["/healthy", "/api/health", "/"])("keeps tracing incoming requests to %s", (url) => {
    const hook = ignoreHookFor({ ignoreIncomingPaths: ["/health"] });

    expect(hook({ url } as IncomingMessage)).toBe(false);
  });

  it("passes upstream instrumentation options straight through", () => {
    const requestHook = jest.fn();
    const [mongodb, http] = [InstrumentationName.MONGODB, InstrumentationName.HTTP];

    const instrumentations = InstrumentationFactory.createInstrumentations({
      config: { [mongodb]: { enhancedDatabaseReporting: true }, [http]: { requestHook } },
    });

    const configOf = (name: string) =>
      instrumentations.find((i) => i.instrumentationName === name)?.getConfig() as Record<string, unknown>;

    expect(configOf(mongodb).enhancedDatabaseReporting).toBe(true);
    expect(configOf(http).requestHook).toBe(requestHook);
  });

  it("merges ignored paths into upstream http options rather than replacing them", () => {
    const requestHook = jest.fn();

    const http = InstrumentationFactory.createInstrumentations({
      config: { [InstrumentationName.HTTP]: { requestHook } },
      ignoreIncomingPaths: ["/health"],
    }).find((i) => i.instrumentationName === InstrumentationName.HTTP);

    const config = http?.getConfig() as Record<string, unknown>;

    expect(config.requestHook).toBe(requestHook);
    expect(typeof config.ignoreIncomingRequestHook).toBe("function");
  });

  it("lets disable win over an upstream option that enables the same instrumentation", () => {
    const names = namesOf(
      InstrumentationFactory.createInstrumentations({
        config: { [InstrumentationName.DNS]: { enabled: true } },
        disable: [InstrumentationName.DNS],
      })
    );

    expect(names).not.toContain(InstrumentationName.DNS);
  });

  it("keeps the http instrumentation disabled when it is both disabled and given ignored paths", () => {
    const names = namesOf(
      InstrumentationFactory.createInstrumentations({
        disable: [InstrumentationName.HTTP],
        ignoreIncomingPaths: ["/health"],
      })
    );

    expect(names).not.toContain(InstrumentationName.HTTP);
  });
});

describe("InstrumentationFactory only / esmHook", () => {
  const enabledNames = (list: Instrumentation[]) =>
    list.filter((i) => i.getConfig().enabled !== false).map((i) => i.instrumentationName);

  it("only: disables everything not listed", () => {
    const list = InstrumentationFactory.createInstrumentations({ only: [InstrumentationName.HTTP] });
    const enabled = enabledNames(list);
    expect(enabled).toContain(InstrumentationName.HTTP);
    expect(enabled).not.toContain(InstrumentationName.DNS);
    expect(enabled).not.toContain(InstrumentationName.NET);
    expect(namesOf(list)).toEqual([InstrumentationName.HTTP]); // auto-instrumentations drops disabled entries entirely
  });

  it("only: entries in enable are also allowed", () => {
    const enabled = enabledNames(
      InstrumentationFactory.createInstrumentations({ only: [InstrumentationName.HTTP], enable: [InstrumentationName.PG] }),
    );
    expect(enabled).toEqual(expect.arrayContaining([InstrumentationName.HTTP, InstrumentationName.PG]));
    expect(enabled).not.toContain(InstrumentationName.FASTIFY);
  });

  it("only: turns on an instrumentation that is off by default", () => {
    expect(namesOf(InstrumentationFactory.createInstrumentations({ only: [InstrumentationName.FS] }))).toEqual([
      InstrumentationName.FS,
    ]);
  });

  it("keeps the rest of the sdk when @fastify/otel is not installed", () => {
    jest.isolateModules(() => {
      jest.doMock("../../src/utils/optional-dependency", () => ({
        loadOptionalDependency: () => {
          throw new Error("@fastify/otel is not installed. Add it to the host project.");
        },
      }));

      const factory = require("../../src/factories/instrumentation.factory").default;
      const names = namesOf(factory.createInstrumentations({ enable: [InstrumentationName.FASTIFY] }));

      expect(names).toContain(InstrumentationName.HTTP);
      expect(names).not.toContain(InstrumentationName.FASTIFY);
    });
  });

  it("registers the ESM loader hook by default and can be turned off", () => {
    const hook = require("../../src/utils/esm-hook");
    const spy = jest.spyOn(hook, "registerEsmHook").mockReturnValue(true);
    InstrumentationFactory.createInstrumentations({});
    expect(spy).toHaveBeenCalledTimes(1);
    InstrumentationFactory.createInstrumentations({ esmHook: false });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

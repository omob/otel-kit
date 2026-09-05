import { diag } from "@opentelemetry/api";
import { getNodeAutoInstrumentations, InstrumentationConfigMap } from "@opentelemetry/auto-instrumentations-node";
import type { Instrumentation } from "@opentelemetry/instrumentation";
import type { IncomingMessage } from "http";
import { InstrumentationName } from "../enums/instrumentation-name.enum";
import { IFastifyInstrumentationConfig, IFastifyOtelModule, IInstrumentationConfig } from "../telemetry.types";
import { registerEsmHook } from "../utils/esm-hook";
import { loadOptionalDependency } from "../utils/optional-dependency";

class InstrumentationFactory {
  static createInstrumentations(config: IInstrumentationConfig = {}): Instrumentation[] {
    const options: Record<string, unknown> = { ...config.config };

    // registering after the app has imported a module is too late to patch it
    if (config.esmHook !== false && !registerEsmHook()) {
      diag.warn("@omob/otel-kit could not register the ESM loader hook, only CommonJS requires are instrumented");
    }

    if (config.only) {
      const allowed = new Set<string>([...config.only, ...(config.enable ?? [])]);

      for (const name of Object.values(InstrumentationName)) {
        options[name] = { ...(options[name] as object), enabled: allowed.has(name) };
      }
    }

    for (const name of config.disable ?? []) {
      options[name] = { ...(options[name] as object), enabled: false };
    }

    for (const name of config.enable ?? []) {
      options[name] = { ...(options[name] as object), enabled: true };
    }

    if (config.ignoreIncomingPaths?.length) {
      options[InstrumentationName.HTTP] = {
        ...(options[InstrumentationName.HTTP] as object),
        ignoreIncomingRequestHook: InstrumentationFactory.createIgnorePathHook(config.ignoreIncomingPaths),
      };
    }

    const { [InstrumentationName.FASTIFY]: fastify, ...autoOptions } = options;

    return [
      ...getNodeAutoInstrumentations(autoOptions as InstrumentationConfigMap),
      ...InstrumentationFactory.createFastify(fastify as IFastifyInstrumentationConfig | undefined),
      ...(config.additional ?? []),
    ];
  }

  private static createFastify(options: IFastifyInstrumentationConfig | undefined): Instrumentation[] {
    if (options?.enabled !== true) {
      return [];
    }

    // @fastify/otel is the host's to install, and its absence must cost fastify spans rather than the whole sdk
    try {
      const { FastifyOtelInstrumentation } = loadOptionalDependency<IFastifyOtelModule>(InstrumentationName.FASTIFY);

      return [new FastifyOtelInstrumentation({ registerOnInitialization: true, ...options })];
    } catch (error) {
      diag.warn(`@omob/otel-kit skipped fastify instrumentation: ${(error as Error).message}`);

      return [];
    }
  }

  private static createIgnorePathHook(ignoredPaths: string[]) {
    return (request: IncomingMessage) => {
      const path = (request.url ?? "").split("?")[0];

      return ignoredPaths.some((ignored) => path === ignored || path.startsWith(`${ignored}/`));
    };
  }
}

export default InstrumentationFactory;

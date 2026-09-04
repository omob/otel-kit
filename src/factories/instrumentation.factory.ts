import { getNodeAutoInstrumentations, InstrumentationConfigMap } from "@opentelemetry/auto-instrumentations-node";
import type { Instrumentation } from "@opentelemetry/instrumentation";
import type { IncomingMessage } from "http";
import { InstrumentationName } from "../enums/instrumentation-name.enum";
import { IInstrumentationConfig } from "../telemetry.types";
import { registerEsmHook } from "../utils/esm-hook";
import { loadOptionalDependency } from "../utils/optional-dependency";

type FastifyOtelModule = { FastifyOtelInstrumentation: new (options?: Record<string, unknown>) => Instrumentation };

class InstrumentationFactory {
  static createInstrumentations(config: IInstrumentationConfig = {}): Instrumentation[] {
    const options: Record<string, unknown> = { ...config.config };

    // must happen before any instrumentation is constructed, so its ESM hooks land in the registered loader
    if (config.esmHook !== false) {
      registerEsmHook();
    }

    if (config.only) {
      const allowed = new Set<string>([...config.only, ...(config.enable ?? [])]);

      for (const name of Object.values(InstrumentationName)) {
        if (!allowed.has(name)) {
          options[name] = { ...(options[name] as object), enabled: false };
        }
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
      ...InstrumentationFactory.createFastify(fastify as Record<string, unknown> | undefined),
      ...(config.additional ?? []),
    ];
  }

  // fastify is instrumented by @fastify/otel, which the host installs; it hooks the fastify module on load like the others
  private static createFastify(options: Record<string, unknown> | undefined): Instrumentation[] {
    if (!options || options.enabled !== true) {
      return [];
    }

    const { FastifyOtelInstrumentation } = loadOptionalDependency<FastifyOtelModule>(InstrumentationName.FASTIFY);

    return [new FastifyOtelInstrumentation({ registerOnInitialization: true, ...options })];
  }

  private static createIgnorePathHook(ignoredPaths: string[]) {
    return (request: IncomingMessage) => {
      const path = (request.url ?? "").split("?")[0];

      return ignoredPaths.some((ignored) => path === ignored || path.startsWith(`${ignored}/`));
    };
  }
}

export default InstrumentationFactory;

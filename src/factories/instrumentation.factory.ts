import { getNodeAutoInstrumentations, InstrumentationConfigMap } from "@opentelemetry/auto-instrumentations-node";
import type { Instrumentation } from "@opentelemetry/instrumentation";
import type { IncomingMessage } from "http";
import { InstrumentationName } from "../enums/instrumentation-name.enum";
import { IFastifyInstrumentationConfig, IFastifyOtelModule, IInstrumentationConfig } from "../telemetry.types";
import { registerEsmHook } from "../utils/esm-hook";
import { ILogInstrumentationConfig } from "./instrumentation.types";
import { loadOptionalDependency } from "../utils/optional-dependency";
import { warn } from "../utils/warn";

const LOG_INSTRUMENTATIONS = [InstrumentationName.PINO, InstrumentationName.WINSTON, InstrumentationName.BUNYAN];

class InstrumentationFactory {
  static createInstrumentations(config: IInstrumentationConfig = {}, runtimeMetrics = true): Instrumentation[] {
    const options: Record<string, unknown> = { ...config.config };

    // registering after the app has imported a module is too late to patch it
    if (config.esmHook !== false && !registerEsmHook()) {
      warn("@omob/otel-kit could not register the ESM loader hook, only CommonJS requires are instrumented");
    }

    if (config.only) {
      const runtime = runtimeMetrics ? [InstrumentationName.RUNTIME_NODE] : [];
      const allowed = new Set<string>([...config.only, ...(config.enable ?? []), ...runtime]);

      for (const name of Object.values(InstrumentationName)) {
        options[name] = { ...(options[name] as object), enabled: allowed.has(name) };
      }
    }

    const disabled = [...(config.disable ?? []), ...(runtimeMetrics ? [] : [InstrumentationName.RUNTIME_NODE])];

    for (const name of disabled) {
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

  // a logger bridged to a pipeline that exports nowhere costs a record per line for nothing; an explicit setting wins.
  // Applied on every start, since the instrumentations outlive a restart and loggers read it when they are created
  static applyLogSending(
    instrumentations: Instrumentation[],
    config: IInstrumentationConfig = {},
    logsExported: boolean
  ): Instrumentation[] {
    for (const instrumentation of instrumentations) {
      const name = instrumentation.instrumentationName as InstrumentationName;
      const explicit = (config.config?.[name as keyof typeof config.config] as ILogInstrumentationConfig | undefined)
        ?.disableLogSending;

      if (LOG_INSTRUMENTATIONS.includes(name) && explicit === undefined) {
        const logConfig: ILogInstrumentationConfig = { ...instrumentation.getConfig(), disableLogSending: !logsExported };

        instrumentation.setConfig(logConfig);
      }
    }

    return instrumentations;
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
      warn(`@omob/otel-kit skipped fastify instrumentation: ${(error as Error).message}`);

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

import { getNodeAutoInstrumentations, InstrumentationConfigMap } from "@opentelemetry/auto-instrumentations-node";
import type { Instrumentation } from "@opentelemetry/instrumentation";
import type { IncomingMessage } from "http";
import { InstrumentationName } from "../enums/instrumentation-name.enum";
import { IInstrumentationConfig } from "../telemetry.types";
import { registerEsmHook } from "../utils/esm-hook";

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

    return [...getNodeAutoInstrumentations(options as InstrumentationConfigMap), ...(config.additional ?? [])];
  }

  private static createIgnorePathHook(ignoredPaths: string[]) {
    return (request: IncomingMessage) => {
      const path = (request.url ?? "").split("?")[0];

      return ignoredPaths.some((ignored) => path === ignored || path.startsWith(`${ignored}/`));
    };
  }
}

export default InstrumentationFactory;

import { getNodeAutoInstrumentations, InstrumentationConfigMap } from "@opentelemetry/auto-instrumentations-node";
import type { Instrumentation } from "@opentelemetry/instrumentation";
import type { IncomingMessage } from "http";
import { InstrumentationName } from "../enums/instrumentation-name.enum";
import { IInstrumentationConfig } from "../telemetry.types";

class InstrumentationFactory {
  static createInstrumentations(config: IInstrumentationConfig = {}): Instrumentation[] {
    const options: Record<string, unknown> = { ...config.config };

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

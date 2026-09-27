import { EnvironmentVariable } from "../enums/environment-variable.enum";
import { SamplerName } from "../enums/sampler-name.enum";
import { ITelemetryConfig } from "../telemetry.types";
import { readEnvironment } from "../utils/environment";
import { warn } from "../utils/warn";

const MILLICORES_PER_CORE = 1000;
const FIXED_RATIOS: Partial<Record<SamplerName, number>> = {
  [SamplerName.ALWAYS_ON]: 1,
  [SamplerName.PARENT_BASED_ALWAYS_ON]: 1,
  [SamplerName.ALWAYS_OFF]: 0,
  [SamplerName.PARENT_BASED_ALWAYS_OFF]: 0,
};
const RATIO_SAMPLERS: string[] = [SamplerName.TRACE_ID_RATIO, SamplerName.PARENT_BASED_TRACE_ID_RATIO];

// values set in code always win; the environment only fills what the code leaves out
class EnvironmentConfigFactory {
  static withEnvironmentDefaults(config: ITelemetryConfig): ITelemetryConfig {
    const resolved = { ...config };

    if (config.traces && config.traces.sampleRatio === undefined && !config.traces.sampler) {
      const sampleRatio = EnvironmentConfigFactory.sampleRatio();

      if (sampleRatio !== undefined) {
        resolved.traces = { ...config.traces, sampleRatio };
      }
    }

    if (config.architecture?.cpuLimit === undefined) {
      const cpuLimit = EnvironmentConfigFactory.cpuLimit();

      if (cpuLimit !== undefined) {
        resolved.architecture = { ...config.architecture, cpuLimit };
      }
    }

    return resolved;
  }

  // the kit's sampler is always parent-based on a trace-id ratio, so the variables only ever pick that ratio
  static sampleRatio(): number | undefined {
    const sampler = readEnvironment(EnvironmentVariable.TRACES_SAMPLER)?.toLowerCase();
    const argument = readEnvironment(EnvironmentVariable.TRACES_SAMPLER_ARG);

    if (sampler && sampler in FIXED_RATIOS) {
      return FIXED_RATIOS[sampler as SamplerName];
    }

    if (sampler && !RATIO_SAMPLERS.includes(sampler)) {
      warn(`@omob/otel-kit ignores ${EnvironmentVariable.TRACES_SAMPLER}="${sampler}"; it sets only ratio samplers`);

      return undefined;
    }

    if (argument === undefined) {
      return sampler ? 1 : undefined;
    }

    const ratio = Number(argument);

    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
      warn(
        `@omob/otel-kit ignores ${EnvironmentVariable.TRACES_SAMPLER_ARG}="${argument}"; it must be a number from 0 to 1`
      );

      return undefined;
    }

    return ratio;
  }

  static cpuLimit(): number | undefined {
    const millicores = readEnvironment(EnvironmentVariable.CPU_LIMIT_MILLICORES);

    if (millicores === undefined) {
      return undefined;
    }

    const cores = Number(millicores) / MILLICORES_PER_CORE;

    if (!Number.isFinite(cores) || cores <= 0) {
      warn(
        `@omob/otel-kit ignores ${EnvironmentVariable.CPU_LIMIT_MILLICORES}="${millicores}"; it must be a positive number`
      );

      return undefined;
    }

    return cores;
  }
}

export default EnvironmentConfigFactory;

const mockConfigs: Record<string, unknown>[] = [];

jest.mock("@opentelemetry/sdk-node", () => ({
  NodeSDK: class {
    constructor(config: Record<string, unknown>) {
      mockConfigs.push(config);
    }

    start() {
      return undefined;
    }
  },
}));

import { ExporterType } from "../../src/enums/exporter-type.enum";
import SdkFactory from "../../src/factories/sdk.factory";
import { ITelemetryConfig } from "../../src/telemetry.types";

const build = (config: Partial<ITelemetryConfig> = {}) => {
  mockConfigs.length = 0;
  SdkFactory.createSdk({ serviceName: "kreela-api", ...config });

  return mockConfigs[0];
};

describe("SdkFactory", () => {
  it("switches every signal off without letting the sdk fall back to its environment defaults", () => {
    const config = build({
      traces: { exporter: ExporterType.NONE },
      metrics: { exporter: ExporterType.NONE },
      logs: { exporter: ExporterType.NONE },
    });

    expect(config.spanProcessors).toEqual([]);
    expect(config.metricReaders).toEqual([]);
    expect(config.logRecordProcessors).toEqual([]);
  });

  it("switches every signal off when no signal is configured at all", () => {
    const config = build();

    expect(config.spanProcessors).toEqual([]);
    expect(config.metricReaders).toEqual([]);
  });

  it("never uses the deprecated single-exporter options the sdk treats as unconfigured", () => {
    const config = build({ traces: { exporter: ExporterType.CONSOLE } });

    expect(config).not.toHaveProperty("traceExporter");
    expect(config).not.toHaveProperty("metricReader");
  });

  it("batches a configured trace exporter", () => {
    const config = build({ traces: { exporter: ExporterType.CONSOLE } });

    expect(config.spanProcessors).toHaveLength(1);
  });

  it("caps attribute length so an oversized request cannot produce an unbounded span", () => {
    expect((build().spanLimits as { attributeValueLengthLimit: number }).attributeValueLengthLimit).toBe(4096);
  });

  it("lets the caller widen the span limits", () => {
    const config = build({ spanLimits: { attributeValueLengthLimit: 128, eventCountLimit: 8 } });

    expect(config.spanLimits).toEqual({ attributeValueLengthLimit: 128, eventCountLimit: 8 });
  });

  it("detects resources by default and lets the caller opt out", () => {
    expect(build().autoDetectResources).toBe(true);
    expect(build({ resourceDetection: false }).autoDetectResources).toBe(false);
  });
});

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

    expect(config.spanProcessors).toHaveLength(1);
    expect(config.metricReaders).toEqual([]);
    expect(config.logRecordProcessors).toEqual([]);
  });

  it("switches every signal off when no signal is configured at all", () => {
    const config = build();

    expect(config.spanProcessors).toHaveLength(1);
    expect(config.metricReaders).toEqual([]);
  });

  it("never uses the deprecated single-exporter options the sdk treats as unconfigured", () => {
    const config = build({ traces: { exporter: ExporterType.CONSOLE } });

    expect(config).not.toHaveProperty("traceExporter");
    expect(config).not.toHaveProperty("metricReader");
  });

  it("batches a configured trace exporter", () => {
    const config = build({ traces: { exporter: ExporterType.CONSOLE } });

    expect(config.spanProcessors).toHaveLength(2);
  });

  it("caps attribute length so an oversized request cannot produce an unbounded span", () => {
    expect((build().spanLimits as { attributeValueLengthLimit: number }).attributeValueLengthLimit).toBe(4096);
  });

  it("lets the caller widen the span limits", () => {
    const config = build({ spanLimits: { attributeValueLengthLimit: 128, eventCountLimit: 8 } });

    expect(config.spanLimits).toEqual({ attributeValueLengthLimit: 128, eventCountLimit: 8 });
  });

  it("prefers an explicit sampler over the ratio", () => {
    const sampler = { shouldSample: jest.fn(), toString: () => "CustomSampler" };
    const config = build({ traces: { exporter: ExporterType.NONE, sampleRatio: 0.5, sampler: sampler as never } });

    expect(config.sampler).toBe(sampler);
  });

  it("sanitizes attributes by default and lets the caller opt out", () => {
    expect(build({ traces: { exporter: ExporterType.NONE } }).spanProcessors).toHaveLength(1);
    expect(
      build({ traces: { exporter: ExporterType.NONE, sanitizeAttributes: false } }).spanProcessors
    ).toHaveLength(0);
  });

  it("appends additional span processors alongside the exporter", () => {
    const processor = { onStart: jest.fn(), onEnd: jest.fn(), shutdown: jest.fn(), forceFlush: jest.fn() };
    const config = build({
      traces: { exporter: ExporterType.CONSOLE, additionalProcessors: [processor as never] },
    });

    expect(config.spanProcessors).toHaveLength(3);
    expect((config.spanProcessors as unknown[])[2]).toBe(processor);
  });

  it("keeps additional processors when no exporter is configured", () => {
    const processor = { onStart: jest.fn(), onEnd: jest.fn(), shutdown: jest.fn(), forceFlush: jest.fn() };
    const config = build({ traces: { exporter: ExporterType.NONE, additionalProcessors: [processor as never] } });

    expect((config.spanProcessors as unknown[])[1]).toBe(processor);
  });

  it("passes metric views through", () => {
    const views = [{ instrumentName: "http.server.duration" }];
    const config = build({ metrics: { exporter: ExporterType.NONE, views: views as never } });

    expect(config.views).toBe(views);
  });

  it("detects resources by default and lets the caller opt out", () => {
    expect(build().autoDetectResources).toBe(true);
    expect(build({ resourceDetection: false }).autoDetectResources).toBe(false);
  });
});

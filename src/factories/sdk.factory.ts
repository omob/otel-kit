import type { ContextManager, TextMapPropagator } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import type { Instrumentation } from "@opentelemetry/instrumentation";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor, SpanProcessor } from "@opentelemetry/sdk-trace-node";
import { ExporterType } from "../enums/exporter-type.enum";
import { ILogConfig, IMetricConfig, ITelemetryConfig, ITraceConfig } from "../telemetry.types";
import InstrumentationFactory from "./instrumentation.factory";
import LogProcessorFactory from "./log-processor.factory";
import MetricReaderFactory from "./metric-reader.factory";
import AttributeSanitizerProcessor from "../processors/attribute-sanitizer.processor";
import PeerResolutionProcessor from "../processors/peer-resolution.processor";
import PropagatorFactory from "./propagator.factory";
import ResourceFactory from "./resource.factory";
import SamplerFactory from "./sampler.factory";
import TraceExporterFactory from "./trace-exporter.factory";

const DISABLED_SIGNAL: ITraceConfig & IMetricConfig & ILogConfig = { exporter: ExporterType.NONE };
const DEFAULT_ATTRIBUTE_VALUE_LENGTH_LIMIT = 4_096;

class SdkFactory {
  static createInstrumentations(config: ITelemetryConfig): Instrumentation[] {
    return InstrumentationFactory.createInstrumentations(config.instrumentation);
  }

  static createPropagator(config: ITelemetryConfig): TextMapPropagator {
    return PropagatorFactory.createPropagator(config.propagators);
  }

  static createContextManager(): ContextManager {
    return new AsyncLocalStorageContextManager();
  }

  // instrumentations patch on construction, so they are only built once the rest of the config has been accepted
  static createSdk(
    config: ITelemetryConfig,
    getInstrumentations: () => Instrumentation[] = () => SdkFactory.createInstrumentations(config)
  ): NodeSDK {
    const traces = config.traces ?? DISABLED_SIGNAL;
    const metrics = config.metrics ?? DISABLED_SIGNAL;
    const traceExporter = TraceExporterFactory.createExporter(traces);
    const metricReader = MetricReaderFactory.createReader(metrics);
    const peers = config.architecture?.peers;
    const spanProcessors: SpanProcessor[] = [
      ...(peers && Object.keys(peers).length ? [new PeerResolutionProcessor(peers)] : []),
      ...(traces.sanitizeAttributes === false ? [] : [new AttributeSanitizerProcessor()]),
      ...(traceExporter ? [new BatchSpanProcessor(traceExporter, traces.batch)] : []),
      ...(traces.additionalProcessors ?? []),
    ];

    const resource = ResourceFactory.createResource(config);
    const sampler = SamplerFactory.withDocTraces(
      traces.sampler ?? SamplerFactory.createSampler(traces.sampleRatio),
      config.architecture?.docTraceRatio
    );
    const logRecordProcessors = LogProcessorFactory.createProcessors(config.logs ?? DISABLED_SIGNAL);

    // empty arrays keep NodeSDK from falling back to its OTEL_* environment defaults, which export to localhost:4318;
    // null context manager and propagator leave their registration to the caller, which tracks what it owns
    return new NodeSDK({
      resource,
      autoDetectResources: config.resourceDetection ?? true,
      sampler,
      spanLimits: { attributeValueLengthLimit: DEFAULT_ATTRIBUTE_VALUE_LENGTH_LIMIT, ...config.spanLimits },
      spanProcessors,
      metricReaders: metricReader ? [metricReader] : [],
      views: metrics.views ?? [],
      logRecordProcessors,
      instrumentations: getInstrumentations(),
      // sdk-node treats null as "do not register" at runtime, but its type leaves null out
      contextManager: null as unknown as ContextManager,
      textMapPropagator: null,
    });
  }
}

export default SdkFactory;

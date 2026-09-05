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
  static createSdk(config: ITelemetryConfig): NodeSDK {
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

    // empty arrays keep NodeSDK from falling back to its OTEL_* environment defaults, which export to localhost:4318
    return new NodeSDK({
      resource: ResourceFactory.createResource(config),
      autoDetectResources: config.resourceDetection ?? true,
      sampler: SamplerFactory.withDocTraces(
        traces.sampler ?? SamplerFactory.createSampler(traces.sampleRatio),
        config.architecture?.docTraceRatio
      ),
      spanLimits: { attributeValueLengthLimit: DEFAULT_ATTRIBUTE_VALUE_LENGTH_LIMIT, ...config.spanLimits },
      spanProcessors,
      metricReaders: metricReader ? [metricReader] : [],
      views: metrics.views ?? [],
      logRecordProcessors: LogProcessorFactory.createProcessors(config.logs ?? DISABLED_SIGNAL),
      instrumentations: InstrumentationFactory.createInstrumentations(config.instrumentation),
      textMapPropagator: PropagatorFactory.createPropagator(config.propagators),
    });
  }
}

export default SdkFactory;

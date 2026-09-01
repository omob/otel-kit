import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { ExporterType } from "../enums/exporter-type.enum";
import { ILogConfig, IMetricConfig, ITelemetryConfig, ITraceConfig } from "../telemetry.types";
import InstrumentationFactory from "./instrumentation.factory";
import LogProcessorFactory from "./log-processor.factory";
import MetricReaderFactory from "./metric-reader.factory";
import PropagatorFactory from "./propagator.factory";
import ResourceFactory from "./resource.factory";
import SamplerFactory from "./sampler.factory";
import TraceExporterFactory from "./trace-exporter.factory";

const DISABLED_SIGNAL: ITraceConfig & IMetricConfig & ILogConfig = { exporter: ExporterType.NONE };
const DEFAULT_ATTRIBUTE_VALUE_LENGTH_LIMIT = 4_096;

class SdkFactory {
  static createSdk(config: ITelemetryConfig): NodeSDK {
    const traces = config.traces ?? DISABLED_SIGNAL;
    const traceExporter = TraceExporterFactory.createExporter(traces);
    const metricReader = MetricReaderFactory.createReader(config.metrics ?? DISABLED_SIGNAL);

    // empty arrays keep NodeSDK from falling back to its OTEL_* environment defaults, which export to localhost:4318
    return new NodeSDK({
      resource: ResourceFactory.createResource(config),
      autoDetectResources: config.resourceDetection ?? true,
      sampler: SamplerFactory.createSampler(traces.sampleRatio),
      spanLimits: { attributeValueLengthLimit: DEFAULT_ATTRIBUTE_VALUE_LENGTH_LIMIT, ...config.spanLimits },
      spanProcessors: traceExporter ? [new BatchSpanProcessor(traceExporter, traces.batch)] : [],
      metricReaders: metricReader ? [metricReader] : [],
      logRecordProcessors: LogProcessorFactory.createProcessors(config.logs ?? DISABLED_SIGNAL),
      instrumentations: InstrumentationFactory.createInstrumentations(config.instrumentation),
      textMapPropagator: PropagatorFactory.createPropagator(config.propagators),
    });
  }
}

export default SdkFactory;

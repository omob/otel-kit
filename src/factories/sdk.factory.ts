import { NodeSDK } from "@opentelemetry/sdk-node";
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

class SdkFactory {
  static createSdk(config: ITelemetryConfig): NodeSDK {
    const traces = config.traces ?? DISABLED_SIGNAL;

    return new NodeSDK({
      resource: ResourceFactory.createResource(config),
      sampler: SamplerFactory.createSampler(traces.sampleRatio),
      traceExporter: TraceExporterFactory.createExporter(traces),
      metricReader: MetricReaderFactory.createReader(config.metrics ?? DISABLED_SIGNAL),
      logRecordProcessors: LogProcessorFactory.createProcessors(config.logs ?? DISABLED_SIGNAL),
      instrumentations: InstrumentationFactory.createInstrumentations(config.instrumentation),
      textMapPropagator: PropagatorFactory.createPropagator(config.propagators),
    });
  }
}

export default SdkFactory;

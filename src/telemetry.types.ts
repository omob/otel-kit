import type { DiagLogLevel, DiagLogger, SpanOptions, Tracer } from "@opentelemetry/api";
import type { Instrumentation } from "@opentelemetry/instrumentation";
import type { MetricReader, PushMetricExporter, ViewOptions } from "@opentelemetry/sdk-metrics";
import type { Sampler, SpanExporter, SpanProcessor } from "@opentelemetry/sdk-trace-node";
import { ExporterType } from "./enums/exporter-type.enum";
import { InstrumentationName } from "./enums/instrumentation-name.enum";
import { OtlpProtocol } from "./enums/otlp-protocol.enum";
import { PropagatorType } from "./enums/propagator-type.enum";

export type ResourceAttributeValue = string | number | boolean;

export type SpanHandler<T> = (span: import("@opentelemetry/api").Span) => Promise<T> | T;

export interface IGcpTraceModule {
  TraceExporter: new (options: object) => SpanExporter;
}

export interface IGcpMonitoringModule {
  MetricExporter: new (options: object) => PushMetricExporter;
}

export interface IPrometheusModule {
  PrometheusExporter: new (options: object) => MetricReader;
}

export interface IOtlpOptions {
  protocol?: OtlpProtocol;
  url?: string;
  headers?: Record<string, string>;
  timeoutMillis?: number;
}

export interface IGcpOptions {
  projectId?: string;
  keyFile?: string;
}

export interface IPrometheusOptions {
  host?: string;
  port?: number;
  endpoint?: string;
}

export interface IBatchOptions {
  maxQueueSize?: number;
  maxExportBatchSize?: number;
  scheduledDelayMillis?: number;
  exportTimeoutMillis?: number;
}

export interface ISpanLimits {
  attributeValueLengthLimit?: number;
  attributeCountLimit?: number;
  eventCountLimit?: number;
  linkCountLimit?: number;
}

export interface ITraceConfig {
  exporter: ExporterType;
  sampleRatio?: number;
  sampler?: Sampler;
  additionalProcessors?: SpanProcessor[];
  batch?: IBatchOptions;
  otlp?: IOtlpOptions;
  gcp?: IGcpOptions;
}

export interface IMetricConfig {
  exporter: ExporterType;
  exportIntervalMillis?: number;
  views?: ViewOptions[];
  otlp?: IOtlpOptions;
  gcp?: IGcpOptions;
  prometheus?: IPrometheusOptions;
}

export interface ILogConfig {
  exporter: ExporterType;
  otlp?: IOtlpOptions;
}

export interface IInstrumentationConfig {
  disable?: InstrumentationName[];
  enable?: InstrumentationName[];
  ignoreIncomingPaths?: string[];
  additional?: Instrumentation[];
}

export interface ITelemetryConfig {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  enabled?: boolean;
  resourceAttributes?: Record<string, ResourceAttributeValue>;
  resourceDetection?: boolean;
  spanLimits?: ISpanLimits;
  traces?: ITraceConfig;
  metrics?: IMetricConfig;
  logs?: ILogConfig;
  instrumentation?: IInstrumentationConfig;
  propagators?: PropagatorType[];
  diagLogLevel?: DiagLogLevel;
  diagLogger?: DiagLogger;
  handleShutdownSignals?: boolean;
  exitOnSignal?: boolean;
  shutdownTimeoutMillis?: number;
  onStartupError?: (error: Error) => void;
}

export interface IWithSpanOptions extends SpanOptions {
  tracer?: Tracer;
  isError?: (error: unknown) => boolean;
}

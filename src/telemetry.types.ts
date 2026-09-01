import type { SpanOptions, Tracer } from "@opentelemetry/api";
import type { Instrumentation } from "@opentelemetry/instrumentation";
import type { MetricReader, PushMetricExporter } from "@opentelemetry/sdk-metrics";
import type { SpanExporter } from "@opentelemetry/sdk-trace-node";
import { ExporterType } from "./enums/exporter-type.enum";
import { InstrumentationName } from "./enums/instrumentation-name.enum";
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
  batch?: IBatchOptions;
  otlp?: IOtlpOptions;
  gcp?: IGcpOptions;
}

export interface IMetricConfig {
  exporter: ExporterType;
  exportIntervalMillis?: number;
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
  handleShutdownSignals?: boolean;
  exitOnSignal?: boolean;
  shutdownTimeoutMillis?: number;
  onStartupError?: (error: Error) => void;
}

export interface IWithSpanOptions extends SpanOptions {
  tracer?: Tracer;
  isError?: (error: unknown) => boolean;
}

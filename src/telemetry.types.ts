import type { DiagLogLevel, DiagLogger, SpanOptions, Tracer } from "@opentelemetry/api";
import type { InstrumentationConfigMap } from "@opentelemetry/auto-instrumentations-node";
import type { Instrumentation } from "@opentelemetry/instrumentation";
import type { MetricReader, PushMetricExporter, ViewOptions } from "@opentelemetry/sdk-metrics";
import type { Sampler, SpanExporter, SpanProcessor } from "@opentelemetry/sdk-trace-node";
import { ExporterType } from "./enums/exporter-type.enum";
import { InstrumentationName } from "./enums/instrumentation-name.enum";
import { OtlpProtocol } from "./enums/otlp-protocol.enum";
import { PropagatorType } from "./enums/propagator-type.enum";

export type ResourceAttributeValue = string | number | boolean;

export type OtlpHeaders = Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);

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
  headers?: OtlpHeaders;
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
  sanitizeAttributes?: boolean;
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
  /** Allow-list: when set, every instrumentation not listed here (or in `enable`) is disabled. */
  only?: InstrumentationName[];
  /**
   * Register import-in-the-middle so ESM imports are instrumented (Node >= 20.6). Defaults to true.
   * Set false when the host already registers a loader hook (for example `--import @opentelemetry/auto-instrumentations-node/register`).
   */
  esmHook?: boolean;
  ignoreIncomingPaths?: string[];
  additional?: Instrumentation[];
  /** Per-instrumentation options keyed by package name. `InstrumentationName.FASTIFY` takes @fastify/otel options. */
  config?: InstrumentationConfigMap & { [InstrumentationName.FASTIFY]?: Record<string, unknown> };
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

export interface IConnectionPoolSnapshot {
  max: number;
  used: number;
  idle: number;
  pending: number;
}

export interface IConnectionPoolOptions {
  name: string;
  system?: string;
  read: () => IConnectionPoolSnapshot;
}

export interface IConnectionPoolHandle {
  recordWait: (millis: number) => void;
  stop: () => void;
}

export interface IWithSpanOptions extends SpanOptions {
  tracer?: Tracer;
  isError?: (error: unknown) => boolean;
}

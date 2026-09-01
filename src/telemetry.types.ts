import type { SpanOptions, Tracer } from "@opentelemetry/api";
import type { Instrumentation } from "@opentelemetry/instrumentation";
import { ExporterType } from "./enums/exporter-type.enum";
import { InstrumentationName } from "./enums/instrumentation-name.enum";
import { PropagatorType } from "./enums/propagator-type.enum";

export type ResourceAttributeValue = string | number | boolean;

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

export interface ITraceConfig {
  exporter: ExporterType;
  sampleRatio?: number;
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
  traces?: ITraceConfig;
  metrics?: IMetricConfig;
  logs?: ILogConfig;
  instrumentation?: IInstrumentationConfig;
  propagators?: PropagatorType[];
  handleShutdownSignals?: boolean;
  shutdownTimeoutMillis?: number;
}

export interface IWithSpanOptions extends SpanOptions {
  tracer?: Tracer;
}

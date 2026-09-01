import { context, Span, SpanStatusCode, trace, Tracer } from "@opentelemetry/api";
import { IWithSpanOptions } from "../telemetry.types";

const DEFAULT_TRACER_NAME = "@omob/otel-kit";

type SpanHandler<T> = (span: Span) => Promise<T> | T;

export function getTracer(name: string, version?: string): Tracer {
  return trace.getTracer(name, version);
}

export function currentTraceId(): string | undefined {
  return trace.getSpan(context.active())?.spanContext().traceId;
}

export function withSpan<T>(name: string, handler: SpanHandler<T>): Promise<T>;
export function withSpan<T>(name: string, options: IWithSpanOptions, handler: SpanHandler<T>): Promise<T>;
export function withSpan<T>(
  name: string,
  optionsOrHandler: IWithSpanOptions | SpanHandler<T>,
  maybeHandler?: SpanHandler<T>
): Promise<T> {
  const isHandlerOnly = typeof optionsOrHandler === "function";
  const handler = (isHandlerOnly ? optionsOrHandler : maybeHandler) as SpanHandler<T>;
  const { tracer, ...spanOptions } = isHandlerOnly ? ({} as IWithSpanOptions) : optionsOrHandler;

  return (tracer ?? trace.getTracer(DEFAULT_TRACER_NAME)).startActiveSpan(name, spanOptions, async (span) => {
    try {
      return await handler(span);
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  });
}

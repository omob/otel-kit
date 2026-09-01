import { context, Span, SpanStatusCode, trace, Tracer } from "@opentelemetry/api";
import { IWithSpanOptions, SpanHandler } from "../telemetry.types";

const DEFAULT_TRACER_NAME = "@omob/otel-kit";

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
  const { tracer, isError, ...spanOptions } = isHandlerOnly ? ({} as IWithSpanOptions) : optionsOrHandler;

  return (tracer ?? trace.getTracer(DEFAULT_TRACER_NAME)).startActiveSpan(name, spanOptions, async (span: Span) => {
    try {
      return await handler(span);
    } catch (error) {
      recordFailure(span, error, isError);
      throw error;
    } finally {
      span.end();
    }
  });
}

function recordFailure(span: Span, error: unknown, isError?: (error: unknown) => boolean): void {
  if (isError && !isError(error)) {
    return;
  }

  const message = error instanceof Error ? error.message : String(error);

  span.recordException(error instanceof Error ? error : new Error(message));
  span.setStatus({ code: SpanStatusCode.ERROR, message });
}

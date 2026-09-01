import type { Context } from "@opentelemetry/api";
import type { ReadableSpan, Span, SpanProcessor } from "@opentelemetry/sdk-trace-node";

// a single NaN makes Jaeger fail to marshal the whole trace, and no backend can represent one usefully
class AttributeSanitizerProcessor implements SpanProcessor {
  onStart(_span: Span, _context: Context): void {
    return undefined;
  }

  onEnd(span: ReadableSpan): void {
    for (const [key, value] of Object.entries(span.attributes)) {
      if (typeof value === "number" && !Number.isFinite(value)) {
        delete span.attributes[key];
      }
    }
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

export default AttributeSanitizerProcessor;

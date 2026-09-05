import type { ReadableSpan, SpanProcessor } from "@opentelemetry/sdk-trace-node";
import { ATTR_URL_PATH } from "@opentelemetry/semantic-conventions";

class AttributeSanitizerProcessor implements SpanProcessor {
  onStart(): void {
    return undefined;
  }

  onEnd(span: ReadableSpan): void {
    // a single NaN makes Jaeger fail to marshal the whole trace, and no backend can represent one usefully
    for (const [key, value] of Object.entries(span.attributes)) {
      if (typeof value === "number" && !Number.isFinite(value)) {
        delete span.attributes[key];
      }
    }

    // url.path is the path component, but @fastify/otel assigns the raw request url, so tokens and ids reach every span
    const path = span.attributes[ATTR_URL_PATH];

    if (typeof path === "string" && path.includes("?")) {
      span.attributes[ATTR_URL_PATH] = path.slice(0, path.indexOf("?"));
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

import type { ReadableSpan, SpanProcessor } from "@opentelemetry/sdk-trace-node";
import { ATTR_URL_FULL, ATTR_URL_PATH, ATTR_URL_QUERY } from "@opentelemetry/semantic-conventions";
import { maskPath, maskQuery, maskUrl } from "../utils/path-redaction";

class PathRedactionProcessor implements SpanProcessor {
  onStart(): void {
    return undefined;
  }

  onEnd(span: ReadableSpan): void {
    const path = span.attributes[ATTR_URL_PATH];
    const full = span.attributes[ATTR_URL_FULL];
    const query = span.attributes[ATTR_URL_QUERY];

    if (typeof path === "string") {
      span.attributes[ATTR_URL_PATH] = maskPath(path);
    }

    if (typeof full === "string") {
      span.attributes[ATTR_URL_FULL] = maskUrl(full);
    }

    if (typeof query === "string") {
      span.attributes[ATTR_URL_QUERY] = maskQuery(query);
    }
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

export default PathRedactionProcessor;

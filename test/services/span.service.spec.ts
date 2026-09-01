import { SpanStatusCode } from "@opentelemetry/api";
import { InMemorySpanExporter, ReadableSpan, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { currentTraceId, getTracer, withSpan } from "../../src/services/span.service";

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });

const spanNamed = (name: string): ReadableSpan => {
  const span = exporter.getFinishedSpans().find((finished) => finished.name === name);

  if (!span) {
    throw new Error(`span ${name} was not exported`);
  }

  return span;
};

beforeAll(() => provider.register());
afterAll(() => provider.shutdown());
beforeEach(() => exporter.reset());

describe("withSpan", () => {
  it("returns the handler result and ends the span", async () => {
    await expect(withSpan("plain", async () => "done")).resolves.toBe("done");

    expect(spanNamed("plain").ended).toBe(true);
  });

  it("accepts a synchronous handler", async () => {
    await expect(withSpan("sync", () => 42)).resolves.toBe(42);
  });

  it("applies span options", async () => {
    await withSpan("with-options", { attributes: { "auth.method": "password" } }, async () => undefined);

    expect(spanNamed("with-options").attributes).toEqual({ "auth.method": "password" });
  });

  it("parents a nested span under the active one", async () => {
    await withSpan("parent", async () => withSpan("child", async () => undefined));

    const parent = spanNamed("parent");
    const child = spanNamed("child");

    expect(child.parentSpanContext?.spanId).toBe(parent.spanContext().spanId);
    expect(child.spanContext().traceId).toBe(parent.spanContext().traceId);
  });

  it("records the exception, marks the span failed and rethrows", async () => {
    const failure = new Error("boom");

    await expect(withSpan("failing", async () => Promise.reject(failure))).rejects.toBe(failure);

    const span = spanNamed("failing");

    expect(span.ended).toBe(true);
    expect(span.status).toEqual({ code: SpanStatusCode.ERROR, message: "boom" });
    expect(span.events.map((event) => event.name)).toContain("exception");
  });

  it("ends the span when a nested handler throws", async () => {
    await expect(
      withSpan("outer", async () =>
        withSpan("inner", async () => {
          throw new Error("inner failure");
        })
      )
    ).rejects.toThrow("inner failure");

    expect(spanNamed("outer").ended).toBe(true);
    expect(spanNamed("inner").ended).toBe(true);
  });

  it("uses the supplied tracer as the instrumentation scope", async () => {
    await withSpan("scoped", { tracer: getTracer("auth-module", "1.2.3") }, async () => undefined);

    expect(spanNamed("scoped").instrumentationScope).toMatchObject({ name: "auth-module", version: "1.2.3" });
  });

  it("defaults the instrumentation scope to the package name", async () => {
    await withSpan("unscoped", async () => undefined);

    expect(spanNamed("unscoped").instrumentationScope.name).toBe("@omob/otel-kit");
  });
});

describe("currentTraceId", () => {
  it("returns the trace id of the active span", async () => {
    const traceId = await withSpan("active", async () => currentTraceId());

    expect(traceId).toBe(spanNamed("active").spanContext().traceId);
  });

  it("returns undefined outside a span", () => {
    expect(currentTraceId()).toBeUndefined();
  });
});

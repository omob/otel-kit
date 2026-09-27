import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import PathRedactionProcessor from "../../src/processors/path-redaction.processor";

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({
  spanProcessors: [new PathRedactionProcessor(), new SimpleSpanProcessor(exporter)],
});

beforeEach(() => exporter.reset());
afterAll(() => provider.shutdown());

describe("PathRedactionProcessor", () => {
  it("masks identifiers in url.path, url.full and url.query, and leaves http.route alone", () => {
    const span = provider.getTracer("test").startSpan("probe");

    span.setAttributes({
      "url.path": "/v1/customers/22123456789",
      "url.full": "https://api.example/v1/customers/customer@example.com?account=0123456789&page=2",
      "url.query": "email=customer%40example.com&page=2",
      "http.route": "/v1/customers/:id",
    });
    span.end();

    expect(exporter.getFinishedSpans()[0].attributes).toEqual({
      "url.path": "/v1/customers/*",
      "url.full": "https://api.example/v1/customers/*?account=*&page=2",
      "url.query": "email=*&page=2",
      "http.route": "/v1/customers/:id",
    });
  });
});

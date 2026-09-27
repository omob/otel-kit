import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { QueryRedaction } from "../../src/enums/query-redaction.enum";
import PathRedactionProcessor from "../../src/processors/path-redaction.processor";

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({
  spanProcessors: [new PathRedactionProcessor({ maskSegments: true, query: QueryRedaction.MASK }), new SimpleSpanProcessor(exporter)],
});

beforeEach(() => exporter.reset());
afterAll(() => provider.shutdown());

describe("PathRedactionProcessor dropping queries", () => {
  it("removes the query from url.query, url.full and url.path", async () => {
    const dropExporter = new InMemorySpanExporter();
    const dropping = new NodeTracerProvider({
      spanProcessors: [new PathRedactionProcessor({ maskSegments: true, query: QueryRedaction.DROP }), new SimpleSpanProcessor(dropExporter)],
    });
    const span = dropping.getTracer("test").startSpan("probe");

    span.setAttributes({
      "url.path": "/policies?insuredName=Ada",
      "url.full": "https://api.example/policies/0123456789?insuredName=Ada#section",
      "url.query": "insuredName=Ada",
    });
    span.end();

    expect(dropExporter.getFinishedSpans()[0].attributes).toEqual({
      "url.path": "/policies",
      "url.full": "https://api.example/policies/*",
    });

    await dropping.shutdown();
  });
});

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

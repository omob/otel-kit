import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import AttributeSanitizerProcessor from "../../src/processors/attribute-sanitizer.processor";

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({
  spanProcessors: [new AttributeSanitizerProcessor(), new SimpleSpanProcessor(exporter)],
});

const exportedAttributes = () => exporter.getFinishedSpans()[0].attributes;

beforeEach(() => exporter.reset());
afterAll(() => provider.shutdown());

describe("AttributeSanitizerProcessor", () => {
  it.each([
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
  ])("drops a %s attribute that no backend can represent", (_label, value) => {
    const span = provider.getTracer("test").startSpan("probe");

    span.setAttribute("net.peer.port", value);
    span.setAttribute("http.status_code", 200);
    span.end();

    expect(exportedAttributes()).toEqual({ "http.status_code": 200 });
  });

  it("keeps every finite value untouched", () => {
    const span = provider.getTracer("test").startSpan("probe");

    span.setAttributes({ "http.status_code": 200, "db.rows": 0, "app.ratio": -1.5, "app.name": "biller" });
    span.end();

    expect(exportedAttributes()).toEqual({
      "http.status_code": 200,
      "db.rows": 0,
      "app.ratio": -1.5,
      "app.name": "biller",
    });
  });
});

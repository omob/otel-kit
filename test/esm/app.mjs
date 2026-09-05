import Fastify from "fastify";
import { Redis } from "ioredis";
import { trace } from "@opentelemetry/api";

const ioredisPatched = Redis.prototype.sendCommand.__wrapped === true;

const app = Fastify();
app.get("/transfers/:id", async (req) => ({ tracestate: req.headers.tracestate ?? null }));
await app.listen({ port: 0, host: "127.0.0.1" });
const { port } = app.server.address();
const body = await (await fetch(`http://127.0.0.1:${port}/transfers/42?token=secret`)).json();
await app.close();
await trace.getTracerProvider().getDelegate?.()?.forceFlush?.();

const spans = globalThis.__otelKitTestExporter.getFinishedSpans();
const server = spans.find((s) => s.kind === 1);
const client = spans.find((s) => s.kind === 2);

// @fastify/otel assigns the raw request url to url.path, so the sanitizer has to trim the query string off it
const urlPaths = spans.map((s) => s.attributes["url.path"]).filter((path) => typeof path === "string");
const queryFreePaths = urlPaths.length > 0 && urlPaths.every((path) => !path.includes("?"));

process.stdout.write(JSON.stringify({
  ioredisPatched,
  fastifyRoute: server?.attributes["http.route"] ?? null,
  docMarkOnWire: body.tracestate,                                   // what the server received in the tracestate header
  docMarkOnServerSpan: server?.spanContext().traceState?.get("as") ?? null,
  peerOnClient: client?.attributes["peer.service"] ?? null,
  archOnResource: server?.resource.attributes["archscope.layer"] ?? null,
  spanCount: spans.length,
  queryFreePaths,
}));

import Fastify from "fastify";
import { Redis } from "ioredis";
import { trace } from "@opentelemetry/api";

// @opentelemetry/instrumentation-ioredis wraps Redis.prototype.sendCommand; shimmer marks wrapped functions.
const ioredisPatched = Redis.prototype.sendCommand.__wrapped === true;

// @fastify/otel must put http.route on the HTTP server span so backends can group by route.
const app = Fastify();
app.get("/transfers/:id", async () => ({ ok: true }));
await app.listen({ port: 0, host: "127.0.0.1" });
const { port } = app.server.address();
await fetch(`http://127.0.0.1:${port}/transfers/42?token=secret`);
await app.close();
await trace.getTracerProvider().getDelegate?.()?.forceFlush?.();

const spans = globalThis.__otelKitTestExporter.getFinishedSpans();
const server = spans.find((s) => s.kind === 1 /* SERVER */);
const fastifyRoute = server?.attributes["http.route"] ?? null;

// @fastify/otel assigns the raw request url to url.path, so the sanitizer has to trim the query string off it
const urlPaths = spans.map((s) => s.attributes["url.path"]).filter((path) => typeof path === "string");
const queryFreePaths = urlPaths.length > 0 && urlPaths.every((path) => !path.includes("?"));

process.stdout.write(JSON.stringify({ ioredisPatched, fastifyRoute, queryFreePaths, spanNames: spans.map((s) => s.name) }));

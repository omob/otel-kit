import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const [major, minor] = process.versions.node.split(".").map(Number);

if (major < 18 || (major === 18 && minor < 19)) {
  console.log(`esm: skipped on node ${process.versions.node} (module.register needs >= 18.19)`);
  process.exit(0);
}

function run(env, args = ["--import", join(dir, "otel.mjs"), join(dir, "app.mjs")]) {
  const r = spawnSync(process.execPath, args, {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  if (r.status !== 0) {
    console.error(r.stderr);
    process.exit(r.status ?? 1);
  }
  return JSON.parse(r.stdout.trim().split("\n").pop());
}

const on = run({});
const off = run({ OTEL_KIT_TEST_ESM_HOOK: "false" });
const restart = run({}, [join(dir, "restart.mjs")]);
const health = run({ npm_package_version: "7.7.7" }, [join(dir, "health.mjs")]);
const noRuntime = run({ OTEL_KIT_TEST_RUNTIME_METRICS: "false" }, [join(dir, "health.mjs")]);

const checks = [
  ["doc-trace mark propagates over HTTP (tracestate header)", String(on.docMarkOnWire).includes("as=d")],
  ["doc-trace mark present on the server span", on.docMarkOnServerSpan === "d"],
  ["spans recorded although sampleRatio=0 (doc traces always record)", on.spanCount > 0],
  ["peer map sets peer.service on the client span", on.peerOnClient === "loopback-peer"],
  ["architecture block lands on the resource", on.archOnResource === "core"],
  ["ioredis patched with hook", on.ioredisPatched === true],
  ["ioredis untouched without hook", off.ioredisPatched === false],
  // @fastify/otel patches through Node's CJS loader (fastify itself is CommonJS), so it works either way
  ["fastify sets http.route with hook", on.fastifyRoute === "/transfers/:id"],
  ["fastify sets http.route without hook", off.fastifyRoute === "/transfers/:id"],
  ["url.path keeps no query string", on.queryFreePaths === true],
  ["http spans recorded before a restart", restart.beforeRestart === 2],
  ["http spans recorded after a restart", restart.afterRestart === 2],
  ["client and server spans linked after a restart", restart.linkedAfterRestart === true],
  ["otlp traces alone export http.server.request.duration to /v1/metrics", health.metrics.includes("http.server.request.duration")],
  ["otlp traces alone export nodejs.eventloop.delay.p99 under only: [HTTP]", health.metrics.includes("nodejs.eventloop.delay.p99")],
  ["runtimeMetrics: false exports no runtime metrics", !noRuntime.metrics.some((name) => name.startsWith("nodejs.eventloop"))],
  ["resource carries service.instance.id", typeof health.resource["service.instance.id"] === "string"],
  ["resource carries service.version from npm_package_version", health.resource["service.version"] === "7.7.7"],
  ["resource carries ritele.trace.sample_probability", health.resource["ritele.trace.sample_probability"] === 0.1],
  ["resource carries telemetry.sdk.language", health.resource["telemetry.sdk.language"] === "nodejs"],
  ["resource carries no process.command_args", !("process.command_args" in health.resource)],
];

for (const [name, ok] of checks) console.log(`esm: ${ok ? "ok  " : "FAIL"} ${name}`);
if (!checks.every(([, ok]) => ok)) {
  console.error("with hook:", JSON.stringify(on), "\nwithout:", JSON.stringify(off), "\nrestart:", JSON.stringify(restart), "\nhealth:", JSON.stringify(health), "\nno runtime:", JSON.stringify(noRuntime));
  process.exit(1);
}

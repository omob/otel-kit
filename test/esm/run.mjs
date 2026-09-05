import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const [major, minor] = process.versions.node.split(".").map(Number);

if (major < 18 || (major === 18 && minor < 19)) {
  console.log(`esm: skipped on node ${process.versions.node} (module.register needs >= 18.19)`);
  process.exit(0);
}

function run(env) {
  const r = spawnSync(process.execPath, ["--import", join(dir, "otel.mjs"), join(dir, "app.mjs")], {
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
];

for (const [name, ok] of checks) console.log(`esm: ${ok ? "ok  " : "FAIL"} ${name}`);
if (!checks.every(([, ok]) => ok)) {
  console.error("with hook:", JSON.stringify(on), "\nwithout:", JSON.stringify(off));
  process.exit(1);
}

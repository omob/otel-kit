import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const [major, minor] = process.versions.node.split(".").map(Number);

if (major < 20 || (major === 20 && minor < 6)) {
  console.log(`esm: skipped on node ${process.versions.node} (module.register needs >= 20.6)`);
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
  const line = r.stdout.trim().split("\n").pop();
  return JSON.parse(line);
}

const withHook = run({});
const withoutHook = run({ OTEL_KIT_TEST_ESM_HOOK: "false" });

const ok = withHook.patched === true && withoutHook.patched === false;
console.log(`esm: hook on -> patched=${withHook.patched}; hook off -> patched=${withoutHook.patched}`);
if (!ok) {
  console.error("esm: expected ioredis to be instrumented only when the loader hook is registered");
  process.exit(1);
}

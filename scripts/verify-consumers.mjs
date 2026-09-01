import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PACKAGE_ROOT = new URL("..", import.meta.url).pathname;
const workspace = mkdtempSync(join(tmpdir(), "otel-kit-consumers-"));

const run = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: "utf8", stdio: "pipe" });

// an isolated cache keeps the checks independent of whatever state the machine's npm cache is in
const cache = join(workspace, "npm-cache");
const npm = (args, cwd) => run("npm", [...args, "--cache", cache], cwd);

const hasPnpm = () => {
  try {
    run("pnpm", ["--version"], workspace);

    return true;
  } catch {
    return false;
  }
};

const APP = `
const { Telemetry, withSpan, currentTraceId, ExporterType } = MODULE;

Telemetry.start({
  serviceName: "consumer-check",
  traces: { exporter: ExporterType.CONSOLE, sampleRatio: 1 },
  handleShutdownSignals: false,
});

withSpan("consumer.step", { attributes: { "step.name": "checkout" } }, async () => {
  if (!currentTraceId()) throw new Error("no active trace id inside the span");
}).then(async () => {
  await Telemetry.shutdown();
  console.log("CONSUMER_OK");
});
`;

const TYPED_APP = `
import { DiagLogLevel } from "@opentelemetry/api";
import { ExporterType, InstrumentationName, OtlpProtocol, PropagatorType, Telemetry, withSpan } from "@omob/otel-kit";
import type { ITelemetryConfig } from "@omob/otel-kit";

const config: ITelemetryConfig = {
  serviceName: "typed-consumer",
  diagLogLevel: DiagLogLevel.ERROR,
  traces: { exporter: ExporterType.OTLP, otlp: { protocol: OtlpProtocol.GRPC, url: "http://collector:4317" } },
  metrics: { exporter: ExporterType.PROMETHEUS, prometheus: { port: 9464 } },
  instrumentation: { disable: [InstrumentationName.DNS], enable: [InstrumentationName.FASTIFY] },
  propagators: [PropagatorType.TRACE_CONTEXT, PropagatorType.JAEGER],
  onStartupError: (error: Error) => console.error(error.message),
};

Telemetry.start(config);

export const checkout = async (): Promise<string> => withSpan("checkout", async () => "done");
`;

const TSCONFIG = {
  compilerOptions: {
    target: "ES2022",
    module: "Node16",
    moduleResolution: "Node16",
    strict: true,
    exactOptionalPropertyTypes: true,
    noUncheckedIndexedAccess: true,
    esModuleInterop: true,
    skipLibCheck: false,
    noEmit: true,
    types: ["node"],
  },
  include: ["src"],
};

const createProject = (name, packageJson) => {
  const dir = join(workspace, name);

  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name, version: "1.0.0", private: true, ...packageJson }));

  return dir;
};

const tarball = () => {
  const output = npm(["pack", "--pack-destination", workspace], PACKAGE_ROOT).trim().split("\n").pop();

  return join(workspace, output);
};

const checks = {
  commonjs: (dir, pack) => {
    writeFileSync(join(dir, "index.js"), APP.replace("MODULE", 'require("@omob/otel-kit")'));
    npm(["install", "--no-audit", "--no-fund", pack, "@opentelemetry/api"], dir);

    return run("node", ["index.js"], dir);
  },
  esm: (dir, pack) => {
    writeFileSync(
      join(dir, "index.js"),
      `import { Telemetry, withSpan, currentTraceId, ExporterType } from "@omob/otel-kit";${APP.split("\n").slice(2).join("\n")}`
    );
    npm(["install", "--no-audit", "--no-fund", pack, "@opentelemetry/api"], dir);

    return run("node", ["index.js"], dir);
  },
  typescript: (dir, pack) => {
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify(TSCONFIG));
    writeFileSync(join(dir, "src", "app.ts"), TYPED_APP);
    npm(["install", "--no-audit", "--no-fund", pack, "@opentelemetry/api", "typescript@5", "@types/node"], dir);
    run("npx", ["tsc", "--noEmit"], dir);

    return "CONSUMER_OK";
  },
  pnpm: (dir, pack) => {
    writeFileSync(join(dir, "index.js"), APP.replace("MODULE", 'require("@omob/otel-kit")'));
    run("pnpm", ["add", "--store-dir", join(workspace, "pnpm-store"), pack, "@opentelemetry/api"], dir);

    return run("node", ["index.js"], dir);
  },
};

const pack = tarball();
const failures = [];

for (const [name, check] of Object.entries(checks)) {
  if (name === "pnpm" && !hasPnpm()) {
    console.log(`- ${name}: skipped, pnpm is not installed`);
    continue;
  }

  const dir = createProject(name, name === "esm" ? { type: "module" } : {});

  try {
    if (!check(dir, pack).includes("CONSUMER_OK")) {
      throw new Error("the consumer ran but did not report success");
    }

    console.log(`- ${name}: ok`);
  } catch (error) {
    failures.push(name);
    console.error(`- ${name}: FAILED\n${error.stdout ?? ""}${error.stderr ?? error.message}`);
  }
}

rmSync(workspace, { recursive: true, force: true });

if (failures.length) {
  console.error(`\nconsumer checks failed: ${failures.join(", ")}`);
  process.exit(1);
}

console.log("\nall consumer checks passed");

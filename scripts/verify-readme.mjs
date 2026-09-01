import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PACKAGE_ROOT = new URL("..", import.meta.url).pathname;
const readme = readFileSync(join(PACKAGE_ROOT, "README.md"), "utf8");

const blocks = [...readme.matchAll(/```ts\n([\s\S]*?)```/g)].map((m, index) => ({
  index: index + 1,
  code: m[1],
  line: readme.slice(0, m.index).split("\n").length,
}));

// samples name things the reader already has; declaring them keeps the check on our own API
const AMBIENT = `
declare const app: { close(): Promise<void> };
declare const logger: { error(...args: unknown[]): void };
declare const url: string;
declare const fastify: { setErrorHandler(h: (err: { statusCode?: number; message: string }, req: unknown, reply: { status(c: number): { send(b: unknown): unknown } }) => unknown): void };
declare const handler: () => Promise<void>;
declare class AppError extends Error { statusCode: number }
declare class RedactingSpanProcessor { onStart(): void; onEnd(): void; forceFlush(): Promise<void>; shutdown(): Promise<void> }
declare const findUser: (email: string) => Promise<{ id: string }>;
declare const generateToken: (user: unknown) => Promise<string>;
declare const billerId: string;
void [app, logger, url, fastify, handler, AppError, RedactingSpanProcessor, findUser, generateToken, billerId];
`;

const OTEL_IMPORTS = `
import { Telemetry, withSpan, getTracer, currentTraceId, ExporterType, InstrumentationName, OtlpProtocol, PropagatorType } from "@omob/otel-kit";
import { DiagLogLevel } from "@opentelemetry/api";
void [Telemetry, withSpan, getTracer, currentTraceId, ExporterType, InstrumentationName, OtlpProtocol, PropagatorType, DiagLogLevel];
`;

const isFragment = (code) => /^\s*(traces|metrics|logs|instrumentation|propagators)\s*:/.test(code);
const hasImports = (code) => /^import\s/m.test(code);
const isScriptTag = (code) => code.trim().startsWith("{") && code.includes('"scripts"');

// the docs use `{ ..., x }` to mean "your existing config, plus x"
const expandEllipsis = (code) => code.replace(/\{\s*\.\.\.\s*,/g, '{ serviceName: "sample",');

const OUR_NAMES = ["Telemetry", "withSpan", "getTracer", "currentTraceId", "ExporterType", "InstrumentationName", "OtlpProtocol", "PropagatorType"];

// a sample may import only the symbol it is introducing, assuming the reader already imported the rest
const missingImports = (code) => {
  const imported = new Set(
    [...code.matchAll(/import\s*\{([^}]*)\}/g)].flatMap((m) => m[1].split(",").map((x) => x.trim().split(/\s+as\s+/)[0]))
  );
  const names = OUR_NAMES.filter((n) => !imported.has(n) && new RegExp(`\\b${n}\\b`).test(code));
  const diag = !imported.has("DiagLogLevel") && /\bDiagLogLevel\b/.test(code);

  return (names.length ? `import { ${names.join(", ")} } from "@omob/otel-kit";\n` : "") +
    (diag ? 'import { DiagLogLevel } from "@opentelemetry/api";\n' : "");
};

const wrap = (code) => {
  const preamble = hasImports(code) ? missingImports(code) + AMBIENT : OTEL_IMPORTS + AMBIENT;

  if (isFragment(code)) {
    return `${OTEL_IMPORTS}${AMBIENT}\nTelemetry.start({ serviceName: "sample", ${expandEllipsis(code).trim().replace(/,\s*$/, "")} });\n`;
  }

  return hasImports(code)
    ? `${preamble}\n${expandEllipsis(code)}\n`
    : `${preamble}\nasync function sample() {\n${expandEllipsis(code)}\n}\nvoid sample;\n`;
};

const workspace = mkdtempSync(join(tmpdir(), "otel-kit-readme-"));
mkdirSync(join(workspace, "src"), { recursive: true });
writeFileSync(join(workspace, "package.json"), JSON.stringify({ name: "readme-check", version: "1.0.0", private: true, type: "module" }));
writeFileSync(
  join(workspace, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      target: "ES2022", module: "Node16", moduleResolution: "Node16", strict: true, noImplicitAny: false,
      esModuleInterop: true, skipLibCheck: true, noEmit: true, noUnusedLocals: false, types: [],
    },
    include: ["src"],
  })
);

const cache = join(workspace, "npm-cache");
const pack = join(workspace, execFileSync("npm", ["pack", "--pack-destination", workspace, "--cache", cache], { cwd: PACKAGE_ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim().split("\n").pop());
execFileSync("npm", ["install", "--no-audit", "--no-fund", "--cache", cache, pack, "@opentelemetry/api", "typescript@5", "@types/node", "google-auth-library"], { cwd: workspace, stdio: "pipe" });

const checked = [];
for (const block of blocks) {
  if (isScriptTag(block.code)) continue;
  writeFileSync(join(workspace, "src", `sample-${block.index}.ts`), wrap(block.code));
  checked.push(block);
}

let failures = 0;
try {
  execFileSync("npx", ["tsc", "--noEmit"], { cwd: workspace, encoding: "utf8", stdio: "pipe" });
  console.log(`all ${checked.length} README code samples compile`);
} catch (error) {
  const out = (error.stdout ?? "") + (error.stderr ?? "");
  const diagnostics = out.split("\n").filter((l) => l.includes("error TS"));

  // a compiler that failed without diagnostics means the check itself is broken, not the docs
  if (diagnostics.length === 0) {
    console.error("readme check could not run:\n" + (out.trim() || error.message));
    failures = 1;
  }

  for (const line of diagnostics) {
    const m = line.match(/sample-(\d+)\.ts\((\d+),/);
    const block = m ? checked.find((b) => b.index === Number(m[1])) : undefined;
    console.error(`README.md:${block?.line ?? "?"}  ${line.replace(/^src\/sample-\d+\.ts/, "")}`);
    failures++;
  }
}

rmSync(workspace, { recursive: true, force: true });
process.exitCode = failures ? 1 : 0;

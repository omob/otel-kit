import Module from "module";
import { pathToFileURL } from "url";

const HOOK_SPECIFIER = "import-in-the-middle/hook.mjs";
// the loader hook is process-wide, so the guard must survive module re-evaluation (jest isolates module registries per file)
const REGISTERED = Symbol.for("@omob/otel-kit.esmHookRegistered");
const state = globalThis as unknown as Record<symbol, boolean | undefined>;

/**
 * Instrumentations patch CommonJS through require-in-the-middle, which the ESM loader never consults.
 * ESM imports are only seen once import-in-the-middle's loader hook is registered, so this installs it
 * before any instrumentation is created. Node < 20.6 has no module.register; those runtimes keep CJS-only
 * behaviour and the caller can tell from the return value.
 *
 * Returns true when the hook is active (registered now or earlier by this module), false when unavailable.
 */
export function registerEsmHook(): boolean {
  if (state[REGISTERED]) {
    return true;
  }

  const register = (Module as unknown as { register?: (specifier: string, parentUrl: string) => void }).register;

  if (typeof register !== "function") {
    return false;
  }

  register(HOOK_SPECIFIER, pathToFileURL(__filename).href);
  state[REGISTERED] = true;

  return true;
}

/** Test seam: forget that the hook was registered. Node keeps the loader hook; this only resets the guard. */
export function resetEsmHookForTests(): void {
  state[REGISTERED] = false;
}

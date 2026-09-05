import Module from "module";
import { pathToFileURL } from "url";

const HOOK_SPECIFIER = "import-in-the-middle/hook.mjs";
// the loader hook is process-wide, so the guard must survive module re-evaluation (jest isolates module registries per file)
const REGISTERED = Symbol.for("@omob/otel-kit.esmHookRegistered");
const state = globalThis as unknown as Record<symbol, boolean | undefined>;

// the ESM loader never consults require-in-the-middle, so ESM imports stay unpatched until this hook is registered
export function registerEsmHook(): boolean {
  if (state[REGISTERED]) {
    return true;
  }

  const register = (Module as unknown as { register?: (specifier: string, parentUrl: string) => void }).register;

  if (typeof register !== "function") {
    return false;
  }

  try {
    register(HOOK_SPECIFIER, pathToFileURL(__filename).href);
  } catch {
    // a bundled dist has no import-in-the-middle beside it, and a failed hook must not cost the caller its traces
    return false;
  }

  state[REGISTERED] = true;

  return true;
}

/** Test seam: forget that the hook was registered. Node keeps the loader hook; this only resets the guard. */
export function resetEsmHookForTests(): void {
  state[REGISTERED] = false;
}

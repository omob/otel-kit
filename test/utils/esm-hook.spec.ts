import Module from "module";
import { registerEsmHook, resetEsmHookForTests } from "../../src/utils/esm-hook";

jest.unmock("../../src/utils/esm-hook");

const runtime = Module as unknown as { register?: unknown };

describe("registerEsmHook", () => {
  const original = runtime.register;

  beforeEach(() => resetEsmHookForTests());

  afterEach(() => {
    runtime.register = original;
    resetEsmHookForTests();
  });

  it("registers the loader hook once however many times it is called", () => {
    const register = jest.fn();
    runtime.register = register;

    expect(registerEsmHook()).toBe(true);
    expect(registerEsmHook()).toBe(true);
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith("import-in-the-middle/hook.mjs", expect.stringContaining("esm-hook"));
  });

  it("reports the hook as unavailable on a runtime without module.register", () => {
    runtime.register = undefined;

    expect(registerEsmHook()).toBe(false);
  });

  it("reports the hook as unavailable when registration throws", () => {
    runtime.register = () => {
      throw new Error("ERR_MODULE_NOT_FOUND: import-in-the-middle/hook.mjs");
    };

    expect(registerEsmHook()).toBe(false);
  });

  it("retries after a failed registration rather than remembering it", () => {
    runtime.register = () => {
      throw new Error("ERR_MODULE_NOT_FOUND: import-in-the-middle/hook.mjs");
    };
    registerEsmHook();

    const register = jest.fn();
    runtime.register = register;

    expect(registerEsmHook()).toBe(true);
    expect(register).toHaveBeenCalledTimes(1);
  });
});

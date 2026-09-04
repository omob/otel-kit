jest.mock("../src/utils/esm-hook", () => ({
  registerEsmHook: jest.fn(() => true),
  resetEsmHookForTests: jest.fn(),
}));

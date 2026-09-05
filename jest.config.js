module.exports = {
  testEnvironment: "node",
  // the ESM loader hook is process-wide; registering it from every isolated test file only produces warnings
  setupFiles: ["<rootDir>/test/setup.ts"],
  testMatch: ["<rootDir>/test/**/*.spec.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
  clearMocks: true,
  testTimeout: 15000,
};

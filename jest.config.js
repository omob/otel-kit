module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/**/*.spec.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
  clearMocks: true,
  testTimeout: 15000,
};

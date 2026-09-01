const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  { ignores: ["dist", "node_modules", "eslint.config.js"] },
  ...tseslint.configs.recommended,
  {
    // the package deliberately defers loading the sdk and its optional exporters until they are selected
    rules: { "@typescript-eslint/no-require-imports": "off" },
  }
);

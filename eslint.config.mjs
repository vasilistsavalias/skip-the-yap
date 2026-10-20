import globals from "globals";

export default [
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        importScripts: "readonly"
      }
    },
    rules: {
      "no-console": "error",
      "no-empty": ["error", { "allowEmptyCatch": false }],
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "prefer-const": "error"
    }
  },
  {
    files: ["tools/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: globals.node
    },
    rules: {
      "no-console": "error",
      "no-unused-vars": "error",
      "prefer-const": "error"
    }
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: globals.node
    },
    rules: {
      "no-unused-vars": "error"
    }
  }
];

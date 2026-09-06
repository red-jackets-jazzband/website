import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";

// Strict, project-wide config for the site's authored JavaScript: the pure
// lib/ modules, the songs/ + agenda orchestration, the page entry points and
// the test suite. Vendored bundles (abcjs, tonal) and Hugo output are ignored.

const STRICT_RULES = {
  "no-var": "error",
  "prefer-const": "error",
  "prefer-arrow-callback": ["error", { allowNamedFunctions: true }],
  "object-shorthand": ["error", "properties"],
  "no-param-reassign": "error",
  "no-shadow": "error",
  "no-else-return": ["error", { allowElseIf: false }],
  "consistent-return": "error",
  eqeqeq: ["error", "always", { null: "ignore" }],
  "no-implicit-globals": "error",
  "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
  "no-console": ["error", { allow: ["warn", "error"] }],
  curly: ["error", "multi-line", "consistent"],
  complexity: ["warn", 14],
  "max-depth": ["warn", 4],
  "max-params": ["warn", 5],
};

const STYLISTIC_RULES = {
  "@stylistic/indent": ["error", 2, { SwitchCase: 1 }],
  "@stylistic/quotes": ["error", "double", { avoidEscape: true }],
  "@stylistic/semi": ["error", "always"],
  "@stylistic/comma-dangle": ["error", "always-multiline"],
  "@stylistic/no-multiple-empty-lines": ["error", { max: 1, maxBOF: 0, maxEOF: 0 }],
  "@stylistic/eol-last": ["error", "always"],
  "@stylistic/no-trailing-spaces": "error",
};

export default [
  {
    ignores: [
      "public/**",
      "resources/**",
      "themes/**",
      "static/script/*min.js",
      "static/script/abcjs*.js",
      "static/script/tonal*.js",
    ],
  },
  js.configs.recommended,
  {
    files: ["static/script/**/*.js", "tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ABCJS: "readonly",
        Tonal: "readonly",
        YT: "readonly",
      },
    },
    plugins: { "@stylistic": stylistic },
    rules: { ...STRICT_RULES, ...STYLISTIC_RULES },
  },
  {
    // Dense but heavily unit-tested pure parsers (ABC chord scheme, comping
    // rhythm generation, chord -> Roman-numeral). The branch-count metrics
    // flag them, but splitting a single-pass parser mid-loop tends to make it
    // harder to follow, not easier — the tests are the guard rail here.
    files: [
      "static/script/lib/chords.js",
      "static/script/lib/comping.js",
      "static/script/lib/music-theory.js",
    ],
    rules: {
      complexity: "off",
      "max-depth": "off",
      "max-params": "off",
    },
  },
  {
    // Tests and the jsdom harness run in Node and drive a jsdom window.
    files: ["**/*.test.js", "tests/helpers/**/*.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "no-shadow": "off",
      "max-params": "off",
    },
  },
];

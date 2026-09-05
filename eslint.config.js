import js from "@eslint/js";
import globals from "globals";

// Scoped to static/script/lib/ for now: the pure, unit-tested modules
// introduced by the songs-page redesign. The pre-existing DOM/ABCjs
// orchestration files (render_abc.js, render_book.js, ...) are brought
// under lint coverage incrementally as later milestones touch them,
// rather than reformatting the whole legacy codebase in one shot.
export default [
  js.configs.recommended,
  {
    files: ["static/script/lib/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["static/script/lib/**/*.test.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];

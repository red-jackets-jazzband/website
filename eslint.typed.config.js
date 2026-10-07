import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";

// Type-aware lint, run separately from eslint.config.js (`npm run lint:typed`)
// because it has to build a TypeScript program over static/script — a few
// seconds of extra work the fast syntactic pass doesn't need. It exists for
// the SonarCloud findings that can't be seen without types: floating
// promises ("Promises must be awaited, end with a call to .catch ..."), plus
// the type-aware half of eslint-plugin-sonarjs (null-dereference,
// argument-type, deprecation, prefer-regexp-exec, ...), which silently
// no-ops under the plain parser.
//
// Deliberately not enabled: @typescript-eslint/prefer-optional-chain — it's
// the same "prefer ?." SonarCloud suggests, and ?. is a SyntaxError on the
// Safari 12 this project supports (see CLAUDE.md's Browser support section).
// Tests are skipped: node:test's `test()` calls are floating promises by
// design.

export default [
  {
    ignores: ["static/script/**/*min.js", "static/script/abcjs*.js", "static/script/tonal*.js", "**/*.test.js"],
  },
  {
    files: ["static/script/**/*.js"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: "./tsconfig.typed.json", sourceType: "module" },
    },
    linterOptions: {
      // The syntactic config owns the disable comments (no-control-regex,
      // no-await-in-loop, ...); this pass doesn't run those rules.
      reportUnusedDisableDirectives: "off",
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      sonarjs: sonarjs.configs.recommended.plugins.sonarjs,
    },
    rules: {
      ...sonarjs.configs.recommended.rules,
      "sonarjs/no-unused-vars": "off",
      "sonarjs/prefer-regexp-exec": "error",
      "sonarjs/deprecation": "error",
      "sonarjs/no-undefined-argument": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
    },
  },
];

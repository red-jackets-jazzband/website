import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import sonarjs from "eslint-plugin-sonarjs";
import regexpPlugin from "eslint-plugin-regexp";
import unicornPlugin from "eslint-plugin-unicorn";
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

  // Correctness / "this probably isn't what you meant" rules, layered on
  // top of eslint:recommended + sonarjs. Every one of these is currently
  // clean across the codebase — they're here to keep it that way, not
  // because they found something. See CLAUDE.md for what each catches.
  "no-constant-binary-expression": "error",
  "array-callback-return": "error",
  "no-promise-executor-return": "error",
  "no-unreachable-loop": "error",
  "no-self-compare": "error",
  "no-template-curly-in-string": "error",
  "no-unmodified-loop-condition": "error",
  "default-case-last": "error",
  "no-useless-concat": "error",
  "no-useless-return": "error",
  "no-unneeded-ternary": "error",
  "no-lonely-if": "error",
  "no-implicit-coercion": "error",
  "no-multi-assign": "error",
  "no-return-assign": "error",
  "guard-for-in": "error",
  "no-shadow-restricted-names": "error",
  "symbol-description": "error",
  "logical-assignment-operators": "error",
  "no-useless-computed-key": "error",
  "no-useless-rename": "error",
  "prefer-object-spread": "error",
  "prefer-numeric-literals": "error",
  "prefer-exponentiation-operator": "error",
  "prefer-regex-literals": "error",
  radix: "error",
  "require-atomic-updates": "error",
  "no-throw-literal": "error",
  "prefer-promise-reject-errors": "error",
  "no-array-constructor": "error",
  "no-new-wrappers": "error",
  "no-unused-expressions": "error",
  "no-restricted-globals": [
    "error",
    { name: "parseInt", message: "Use Number.parseInt instead." },
    { name: "parseFloat", message: "Use Number.parseFloat instead." },
  ],

  // Security-relevant footguns (arbitrary code execution / injection via
  // string-eval'd code, prototype tampering) — not covered by sonarjs's
  // recommended set, but exactly the class of thing a Sonar security-hotspot
  // rule would flag.
  "no-eval": "error",
  "no-new-func": "error",
  "no-script-url": "error",
  "no-extend-native": "error",
  "no-proto": "error",
  "no-iterator": "error",
  "no-caller": "error",
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
        lamejs: "readonly",
      },
    },
    plugins: {
      "@stylistic": stylistic,
      sonarjs: sonarjs.configs.recommended.plugins.sonarjs,
      regexp: regexpPlugin,
      unicorn: unicornPlugin,
    },
    rules: {
      ...sonarjs.configs.recommended.rules,
      ...STRICT_RULES,
      ...STYLISTIC_RULES,
      // Superseded by (or in conflict with) rules already enforced above.
      "sonarjs/no-unused-vars": "off",
      "sonarjs/cognitive-complexity": ["warn", 15],
      "sonarjs/no-duplicate-string": ["warn", { threshold: 5 }],
      // Two rules cherry-picked from eslint-plugin-regexp's much larger
      // "recommended" set: both catch a regex that's internally
      // self-contradictory (a dead alternative, a capturing group whose
      // pattern promises more than its neighbours let it keep) rather than
      // opining on capturing-vs-non-capturing groups or char-class-vs-`i`-flag
      // style, which the rest of that set is mostly about.
      "regexp/no-dupe-disjunctions": "error",
      "regexp/no-misleading-capturing-group": "error",
      // Cherry-picked from eslint-plugin-unicorn's much larger rule set (not
      // its "recommended" config, which is mostly style opinions this project
      // doesn't share): this is the one rule that reproduces a real
      // SonarCloud finding (S3800-family "Move function 'x' to the outer
      // scope") we'd otherwise only see after a PR is scanned — a nested
      // function that never touches its enclosing function's own
      // parameters/closure variables belongs at module scope instead.
      "unicorn/consistent-function-scoping": "error",
      // Cherry-picked from PR #121's SonarCloud scan the same way as
      // consistent-function-scoping above: `str.charCodeAt(i)` ->
      // `str.codePointAt(i)`, only relevant once `i` could land on a
      // surrogate half — charCodeAt silently reads half of an astral
      // codepoint there, codePointAt doesn't. (SonarCloud's matching
      // `arr[arr.length - 1]` -> `arr.at(-1)` finding, `unicorn/prefer-at`,
      // is deliberately NOT enabled here — see the OLD_SAFARI_RULES block
      // below, which bans `.at()` outright.)
      "unicorn/prefer-code-point": "error",
    },
  },
  {
    // Browser-shipped code only (never the Node test suite, which runs on
    // whatever Node this machine has, not in a browser at all): this project
    // supports back to Safari 12 (see CLAUDE.md's browser-support note,
    // added after a real visitor's iPad — permanently capped at iOS 12.5.8,
    // the last update Apple ever shipped for that hardware — turned out
    // unable to run the songs page at all). Safari 12 predates optional
    // chaining and nullish coalescing entirely: either one is a SyntaxError
    // at *parse* time, which — since everything here loads as one ES module
    // graph — aborts the whole graph before a single line runs, with nothing
    // in the page to say why. `.at()`, `String#matchAll`,
    // `String#replaceAll`, `Node#replaceChildren` and `crypto.randomUUID`
    // don't throw until called, but still don't exist on Safari 12 either
    // way — `replaceChildren` in particular is why the song list stayed
    // empty even after the ?./?? SyntaxError was fixed: lib/dom.js's
    // clear() used it, and it's the first thing render() calls before
    // listing anything, so it threw silently on every render, in an async
    // XHR callback no synchronous try/catch could catch.
    // `logical-assignment-operators` above is flipped to "never" for the
    // same reason: `&&=`/`||=`/`??=` are Safari 14+.
    files: ["static/script/lib/**/*.js", "static/script/songs/**/*.js", "static/script/*.js"],
    ignores: ["**/*.test.js"],
    rules: {
      "logical-assignment-operators": ["error", "never"],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ChainExpression",
          message: "Optional chaining (?.) is a SyntaxError on Safari 12 — use an explicit `a && a.b` guard instead.",
        },
        {
          selector: "LogicalExpression[operator='??']",
          message: "Nullish coalescing (??) is a SyntaxError on Safari 12 — use `x === undefined ? fallback : x` "
            + "(or also check `=== null` when the value can genuinely be either).",
        },
        {
          selector: "CallExpression[callee.property.name='at']",
          message: "Array/String#at is Safari 15.4+ — index from the end manually instead: arr[arr.length - N] "
            + "(route a NodeList through qsa()/spread first — see CLAUDE.md's Browser support section).",
        },
        {
          selector: "CallExpression[callee.property.name='matchAll']",
          message: "String#matchAll is Safari 13+ — use lib/regex-exec-all.js's execAll(regex, str) instead.",
        },
        {
          selector: "CallExpression[callee.property.name='replaceAll']",
          message: "String#replaceAll is Safari 13.1+ — use .replace() with a /g-flagged regex instead "
            + "(identical result to replaceAll for a global regex).",
        },
        {
          selector: "CallExpression[callee.property.name='replaceChildren']",
          message: "Node#replaceChildren is Safari 16.4+ — use lib/dom.js's clear() instead "
            + "(clear(node) then node.append(...) if you need to insert new children too).",
        },
        {
          selector: "CallExpression[callee.object.name='crypto'][callee.property.name='randomUUID']",
          message: "crypto.randomUUID() is Safari 15.4+ — for a non-cryptographic local id, "
            + "Date.now().toString(36) + Math.random().toString(36).slice(2, 10) is plenty "
            + "(see lib/setlists-store.js's generateId).",
        },
      ],
    },
  },
  {
    // Dense but heavily unit-tested pure parsers (ABC chord scheme, comping
    // rhythm generation, chord -> Roman-numeral). The branch-count metrics
    // flag them, but splitting a single-pass parser mid-loop tends to make it
    // harder to follow, not easier — the tests are the guard rail here. The
    // one remaining sonarjs/regex-complexity hit (comping.js's BARLINE
    // tokenizer) is a flat dictionary of literal alternatives, not a
    // backtracking risk — no paired super-linear-regex flag on it.
    files: [
      "static/script/lib/chords.js",
      "static/script/lib/comping.js",
      "static/script/lib/music-theory.js",
    ],
    rules: {
      complexity: "off",
      "max-depth": "off",
      "max-params": "off",
      "sonarjs/cognitive-complexity": "off",
      "sonarjs/regex-complexity": "off",
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
  {
    // CI/dev-tooling scripts (e.g. the ABC notation linter) run in Node,
    // not the browser.
    files: ["scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    plugins: {
      "@stylistic": stylistic,
      sonarjs: sonarjs.configs.recommended.plugins.sonarjs,
      regexp: regexpPlugin,
      unicorn: unicornPlugin,
    },
    rules: {
      ...sonarjs.configs.recommended.rules,
      ...STRICT_RULES,
      ...STYLISTIC_RULES,
      "sonarjs/no-unused-vars": "off",
    },
  },
];

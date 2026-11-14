/*
   The Connect devices / shared spaces dialog must lay out on Safari 12 (the
   old iPad): its CSS may not use what only newer Safari understands, and
   neither ESLint nor stylelint can see it.
     - flex `gap` (Safari 14.1+): without it every row and column of the dialog
       is run together, so spacing there is margins (see the note at the top of
       the dialog's block in split.css);
     - `:has()` (Safari 15.4+): a rule using it is dropped whole, so what it
       decided (an empty status row hiding itself) is done from script.
   Plain indexOf scans, not a delimiter-spanning regex (see CLAUDE.md).
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const CSS_FILE = new URL("../assets/css/split.css", import.meta.url);
const SCOPE = [".rj-sync", ".rj-band", ".rj-modal", "#syncModal", "#bandTabs"];

function stripComments(css) {
  let out = css;
  for (let open = out.indexOf("/*"); open !== -1; open = out.indexOf("/*")) {
    const close = out.indexOf("*/", open + 2);
    out = out.slice(0, open) + (close === -1 ? "" : out.slice(close + 2));
  }
  return out;
}

// Every innermost { … } block as { selector, body }.
function blocks(css) {
  const found = [];
  for (let close = css.indexOf("}"); close !== -1; close = css.indexOf("}", close + 1)) {
    const open = css.lastIndexOf("{", close);
    const start = Math.max(css.lastIndexOf("}", open), css.lastIndexOf("{", open - 1), css.lastIndexOf(";", open)) + 1;
    found.push({ selector: css.slice(start, open).trim(), body: css.slice(open + 1, close) });
  }
  return found;
}

const declares = (body, property) => {
  return body.split(";").some((decl) => { return decl.trim().startsWith(`${property}:`); });
};
const isFlex = (body) => { return body.split(";").some((d) => { return /^display:\s*(inline-)?flex\s*$/.test(d.trim()); }); };

const inScope = blocks(stripComments(readFileSync(CSS_FILE, "utf8"))).filter(({ selector }) => {
  return SCOPE.some((s) => { return selector.includes(s); });
});

test("the sync dialog's CSS is found by the scan (so the checks below mean something)", () => {
  assert.ok(inScope.length > 40);
  assert.ok(inScope.some(({ selector }) => { return selector === ".rj-sync-share"; }));
});

test("no flex container in the sync / shared-space / modal CSS uses gap, row-gap or column-gap", () => {
  const offenders = inScope.filter(({ body }) => {
    return isFlex(body) && ["gap", "row-gap", "column-gap"].some((p) => { return declares(body, p); });
  }).map(({ selector }) => { return selector; });
  assert.deepEqual(offenders, []);
});

test("no rule in the sync / shared-space / modal CSS needs :has()", () => {
  assert.deepEqual(inScope.filter(({ selector }) => { return selector.includes(":has("); }).map(({ selector }) => { return selector; }), []);
});

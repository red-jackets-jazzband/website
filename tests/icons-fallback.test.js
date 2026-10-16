import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
  head.html falls back to Font Awesome from cdnjs when the generated subset is
  missing (a bare `hugo serve`). cdnjs serves npm's css/all.min.css byte for
  byte, so the link must name the installed version and carry that file's
  hash — otherwise a Dependabot bump leaves the fallback on the old version.
*/

const path = (relative) => fileURLToPath(new URL(`../${relative}`, import.meta.url));
const FA_DIR = "node_modules/@fortawesome/fontawesome-free";

test("the cdnjs Font Awesome fallback matches the installed package", () => {
  const { version } = JSON.parse(readFileSync(path(`${FA_DIR}/package.json`), "utf8"));
  const css = readFileSync(path(`${FA_DIR}/css/all.min.css`));
  const integrity = `sha512-${createHash("sha512").update(css).digest("base64")}`;
  const head = readFileSync(path("layouts/partials/head.html"), "utf8");
  assert.ok(head.includes(`https://cdnjs.cloudflare.com/ajax/libs/font-awesome/${version}/css/all.min.css`));
  assert.ok(head.includes(`integrity="${integrity}"`));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { findStylesheetHrefs, findCssUrls } from "./css-assets.js";

test("finds a same-origin fingerprinted stylesheet href", () => {
  const html = '<head><link rel="stylesheet" href="/css/split.min.abc123.css" integrity="sha384-x"></head>';
  assert.deepEqual(findStylesheetHrefs(html), ["/css/split.min.abc123.css"]);
});

test("finds multiple stylesheet links, ignoring non-stylesheet links", () => {
  const html = [
    '<link rel="icon" href="/favicon.ico">',
    '<link rel="stylesheet" href="/css/split.min.abc123.css">',
    '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css">',
  ].join("\n");
  assert.deepEqual(findStylesheetHrefs(html), [
    "/css/split.min.abc123.css",
    "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css",
  ]);
});

test("returns nothing when there are no stylesheet links", () => {
  assert.deepEqual(findStylesheetHrefs("<head><title>x</title></head>"), []);
});

test("ignores a link tag with rel before href with no closing '>' left dangling", () => {
  assert.deepEqual(findStylesheetHrefs('<link rel="stylesheet" href="/a.css"'), []);
});

test("finds a bare, unquoted url()", () => {
  assert.deepEqual(findCssUrls("@font-face { src: url(/fonts/Lora-latin.woff2) format('woff2'); }"), [
    "/fonts/Lora-latin.woff2",
  ]);
});

test("finds double- and single-quoted url() alike, and strips the quotes", () => {
  const css = `
    @font-face { src: url("/fonts/Montserrat-latin.woff2") format("woff2"); }
    @font-face { src: url('/fonts/Saniretro.woff') format('woff'); }
  `;
  assert.deepEqual(findCssUrls(css), ["/fonts/Montserrat-latin.woff2", "/fonts/Saniretro.woff"]);
});

test("resolves relative webfont paths the same as any other url()", () => {
  const css = "@font-face { src: url(../webfonts/fa-solid-900.woff2) format('woff2'); }";
  assert.deepEqual(findCssUrls(css), ["../webfonts/fa-solid-900.woff2"]);
});

test("returns nothing when a css file has no url() references", () => {
  assert.deepEqual(findCssUrls("body { color: red; }"), []);
});

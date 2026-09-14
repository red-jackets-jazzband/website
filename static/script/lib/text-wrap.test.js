import { test } from "node:test";
import assert from "node:assert/strict";
import { wrapTextLines } from "./text-wrap.js";

const charWidth = (s) => s.length;

test("wrapTextLines fits everything on one line when it's narrow enough", () => {
  assert.deepEqual(wrapTextLines("watch the turnaround", 40, charWidth), ["watch the turnaround"]);
});

test("wrapTextLines breaks at whitespace once a line would overflow", () => {
  assert.deepEqual(
    wrapTextLines("watch the turnaround here", 12, charWidth),
    ["watch the", "turnaround", "here"],
  );
});

test("wrapTextLines keeps an overlong single word on its own line", () => {
  assert.deepEqual(wrapTextLines("supercalifragilistic", 5, charWidth), ["supercalifragilistic"]);
});

test("wrapTextLines collapses repeated whitespace", () => {
  assert.deepEqual(wrapTextLines("a   b\tc\nd", 40, charWidth), ["a b c d"]);
});

test("wrapTextLines returns [] for blank input", () => {
  assert.deepEqual(wrapTextLines("", 40, charWidth), []);
  assert.deepEqual(wrapTextLines("   ", 40, charWidth), []);
});

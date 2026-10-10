import { test } from "node:test";
import assert from "node:assert/strict";
import { progressionShades } from "./overlays.js";

const match = (name) => ({ name });

test("each progression name gets its own shade, in order of first appearance", () => {
  const shades = progressionShades([match("Georgia"), match("Salty Dog"), match("Georgia"), match("Sunshine"), match("Salty Dog")]);
  assert.deepEqual(shades, [
    "rj-layer-prog--0", "rj-layer-prog--1", "rj-layer-prog--0", "rj-layer-prog--2", "rj-layer-prog--1",
  ]);
});

test("the shades cycle after five names", () => {
  const shades = progressionShades(["A", "B", "C", "D", "E", "F"].map(match));
  assert.equal(shades[5], "rj-layer-prog--0");
  assert.deepEqual(progressionShades([]), []);
});

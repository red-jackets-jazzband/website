import test from "node:test";
import assert from "node:assert/strict";
import { extractWordsTables, transposeTable } from "./words-table.js";

test("extractWordsTables pulls a header table out and leaves other lines", () => {
  const src = "T:x\nW:intro text\nW:| # | Section |\nW:|---|---|\nW:| 1 | Intro |\nK:C\nCDEF|";
  const { abcText, tables } = extractWordsTables(src);
  assert.equal(abcText, "T:x\nW:intro text\nK:C\nCDEF|");
  assert.deepEqual(tables, [{ header: ["#", "Section"], rows: [["1", "Intro"]] }]);
});

test("extractWordsTables keeps empty cells and handles a headerless table", () => {
  const { tables } = extractWordsTables("W:| 3 | Vocals | |\nW:| 4 | Solos | x |");
  assert.deepEqual(tables[0].header, null);
  assert.deepEqual(tables[0].rows, [["3", "Vocals", ""], ["4", "Solos", "x"]]);
});

test("extractWordsTables returns no tables when there are none", () => {
  const src = "W:Form:\nW:1. Intro";
  assert.deepEqual(extractWordsTables(src), { abcText: src, tables: [] });
});

test("transposeTable turns columns into labelled rows", () => {
  const table = { header: ["#", "Section"], rows: [["1", "Intro"], ["2", "Vocals"]] };
  assert.deepEqual(transposeTable(table), {
    labels: ["#", "Section"],
    rows: [["1", "2"], ["Intro", "Vocals"]],
  });
});

test("transposeTable pads ragged rows and has no labels without a header", () => {
  assert.deepEqual(transposeTable({ header: null, rows: [["a", "b"], ["c"]] }), {
    labels: null,
    rows: [["a", "c"], ["b", ""]],
  });
});

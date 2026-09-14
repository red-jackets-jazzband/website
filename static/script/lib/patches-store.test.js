import { test } from "node:test";
import assert from "node:assert/strict";
import { listPatches, upsertPatch, removePatch } from "./patches-store.js";
import { memoryStorage as makeStorage } from "../../../tests/helpers/ctx.js";

const BASIN_STREET = "basin_street.abc";

test("upsertPatch + listPatches round-trip, scoped by songFile", () => {
  const storage = makeStorage();
  upsertPatch(storage, {
    songFile: BASIN_STREET, note: 0, action: "pitch", value: "^F",
  });
  upsertPatch(storage, {
    songFile: "tiger_rag.abc", note: 0, action: "rest", value: null,
  });
  const forSong = listPatches(storage, BASIN_STREET);
  assert.equal(forSong.length, 1);
  assert.equal(forSong[0].action, "pitch");
  assert.equal(forSong[0].value, "^F");
});

test("pitch and rest patches on the same slot replace each other", () => {
  const storage = makeStorage();
  upsertPatch(storage, {
    songFile: BASIN_STREET, note: 2, action: "pitch", value: "^C",
  });
  upsertPatch(storage, {
    songFile: BASIN_STREET, note: 2, action: "rest", value: null,
  });
  const all = listPatches(storage, BASIN_STREET);
  assert.equal(all.length, 1);
  assert.equal(all[0].action, "rest");
});

test("chord patches don't replace a pitch patch on the same slot", () => {
  const storage = makeStorage();
  upsertPatch(storage, {
    songFile: BASIN_STREET, note: 2, action: "pitch", value: "^C",
  });
  upsertPatch(storage, {
    songFile: BASIN_STREET, note: 2, action: "chord", value: "Dm7",
  });
  const all = listPatches(storage, BASIN_STREET);
  assert.equal(all.length, 2);
});

test("a second chord patch on the same slot replaces the first (value: null removes it)", () => {
  const storage = makeStorage();
  upsertPatch(storage, {
    songFile: BASIN_STREET, note: 4, action: "chord", value: "G7",
  });
  upsertPatch(storage, {
    songFile: BASIN_STREET, note: 4, action: "chord", value: null,
  });
  const all = listPatches(storage, BASIN_STREET);
  assert.equal(all.length, 1);
  assert.equal(all[0].value, null);
});

test("insert patches at the same slot replace each other but not a pitch patch there", () => {
  const storage = makeStorage();
  upsertPatch(storage, {
    songFile: BASIN_STREET, note: 3, action: "pitch", value: "C",
  });
  upsertPatch(storage, {
    songFile: BASIN_STREET, note: 3, action: "insert", value: "D",
  });
  upsertPatch(storage, {
    songFile: BASIN_STREET, note: 3, action: "insert", value: "E",
  });
  const all = listPatches(storage, BASIN_STREET);
  assert.equal(all.length, 2);
  assert.ok(all.some((p) => p.action === "pitch" && p.value === "C"));
  assert.ok(all.some((p) => p.action === "insert" && p.value === "E"));
});

test("removePatch removes just that entry", () => {
  const storage = makeStorage();
  const a = upsertPatch(storage, {
    songFile: BASIN_STREET, note: 0, action: "pitch", value: "C",
  });
  const b = upsertPatch(storage, {
    songFile: BASIN_STREET, note: 1, action: "pitch", value: "D",
  });
  removePatch(storage, a.id);
  const all = listPatches(storage, BASIN_STREET);
  assert.equal(all.length, 1);
  assert.equal(all[0].id, b.id);
});

test("note defaults to null (unanchored, e.g. a trailing chord symbol)", () => {
  const storage = makeStorage();
  const entry = upsertPatch(storage, {
    songFile: BASIN_STREET, action: "chord", value: "Cdim",
  });
  assert.equal(entry.note, null);
});

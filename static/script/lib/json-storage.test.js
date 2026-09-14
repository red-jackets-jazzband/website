import { test } from "node:test";
import assert from "node:assert/strict";
import { readJsonArray, writeJsonBlob, generateStoreId } from "./json-storage.js";
import { memoryStorage as makeStorage } from "../../../tests/helpers/ctx.js";

test("readJsonArray returns [] when the key is missing", () => {
  assert.deepEqual(readJsonArray(makeStorage(), "rj.test"), []);
});

test("readJsonArray returns [] for null/unavailable storage", () => {
  assert.deepEqual(readJsonArray(null, "rj.test"), []);
});

test("readJsonArray returns [] for invalid JSON", () => {
  const storage = makeStorage();
  storage.setItem("rj.test", "{not json");
  assert.deepEqual(readJsonArray(storage, "rj.test"), []);
});

test("readJsonArray returns [] when the stored value isn't an array", () => {
  const storage = makeStorage();
  storage.setItem("rj.test", JSON.stringify({ a: 1 }));
  assert.deepEqual(readJsonArray(storage, "rj.test"), []);
});

test("writeJsonBlob + readJsonArray round-trip", () => {
  const storage = makeStorage();
  writeJsonBlob(storage, "rj.test", [{ id: "1" }, { id: "2" }]);
  assert.deepEqual(readJsonArray(storage, "rj.test"), [{ id: "1" }, { id: "2" }]);
});

test("writeJsonBlob is a no-op for null storage", () => {
  assert.doesNotThrow(() => writeJsonBlob(null, "rj.test", [1]));
});

test("writeJsonBlob swallows a storage error", () => {
  const storage = {
    setItem: () => { throw new Error("quota exceeded"); },
  };
  assert.doesNotThrow(() => writeJsonBlob(storage, "rj.test", [1]));
});

test("generateStoreId returns unique, non-empty ids", () => {
  const a = generateStoreId();
  const b = generateStoreId();
  assert.notEqual(a, b);
  assert.ok(a.length > 0);
});

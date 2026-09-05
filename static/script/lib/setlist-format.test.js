import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSetlistFile, serializeSetlistFile } from "./setlist-format.js";

test("parseSetlistFile reads name, desc, and songs with optional key overrides", () => {
  var text = [
    "# name,Zeeland Jazz 2026",
    "# desc,Our main summer set.",
    "basin_street.abc,C",
    "auld_lang_syne.abc,",
    "aint_my_fault.abc,Am",
  ].join("\n");

  var setlist = parseSetlistFile(text);
  assert.equal(setlist.name, "Zeeland Jazz 2026");
  assert.equal(setlist.desc, "Our main summer set.");
  assert.deepEqual(setlist.songs, [
    { file: "basin_street.abc", key: "C" },
    { file: "auld_lang_syne.abc", key: "" },
    { file: "aint_my_fault.abc", key: "Am" },
  ]);
});

test("parseSetlistFile works with no name/desc comments at all", () => {
  var setlist = parseSetlistFile("basin_street.abc,\n");
  assert.equal(setlist.name, null);
  assert.equal(setlist.desc, null);
  assert.deepEqual(setlist.songs, [{ file: "basin_street.abc", key: "" }]);
});

test("parseSetlistFile skips blank lines and unrecognized comment lines", () => {
  var text = "# some other comment\n\nbasin_street.abc,\n\n";
  var setlist = parseSetlistFile(text);
  assert.deepEqual(setlist.songs, [{ file: "basin_street.abc", key: "" }]);
});

test("serializeSetlistFile round-trips through parseSetlistFile", () => {
  var original = {
    name: "Rehearsal Tuesday",
    desc: "",
    songs: [
      { file: "basin_street.abc", key: "Bb" },
      { file: "tiger_rag.abc", key: "" },
    ],
  };
  var text = serializeSetlistFile(original);
  var parsed = parseSetlistFile(text);
  assert.equal(parsed.name, original.name);
  assert.deepEqual(parsed.songs, original.songs);
});

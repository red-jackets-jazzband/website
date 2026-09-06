import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listPersonalSetlists,
  createPersonalSetlist,
  deletePersonalSetlist,
  renamePersonalSetlist,
  addSongToPersonalSetlist,
  removeSongFromPersonalSetlist,
  updateSongKeyInPersonalSetlist,
  addDividerToPersonalSetlist,
  updateDividerLabelInPersonalSetlist,
  setPersonalSetlistOrder,
  copyBandSetlistToPersonal,
  exportPersonalSetlistText,
  importPersonalSetlistText,
} from "./setlists-store.js";

function makeStorage() {
  var data = {};
  return {
    getItem: function(k) {
      return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null;
    },
    setItem: function(k, v) {
      data[k] = String(v);
    },
  };
}

test("createPersonalSetlist + listPersonalSetlists round-trip", () => {
  var storage = makeStorage();
  var created = createPersonalSetlist(storage, "Rehearsal Tuesday");
  var list = listPersonalSetlists(storage);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, created.id);
  assert.equal(list[0].name, "Rehearsal Tuesday");
  assert.deepEqual(list[0].songs, []);
});

test("addSongToPersonalSetlist and removeSongFromPersonalSetlist", () => {
  var storage = makeStorage();
  var entry = createPersonalSetlist(storage, "My List");
  addSongToPersonalSetlist(storage, entry.id, { file: "basin_street.abc", key: "" });
  addSongToPersonalSetlist(storage, entry.id, { file: "tiger_rag.abc", key: "Bb" });
  assert.equal(listPersonalSetlists(storage)[0].songs.length, 2);

  removeSongFromPersonalSetlist(storage, entry.id, 0);
  assert.deepEqual(listPersonalSetlists(storage)[0].songs, [{ file: "tiger_rag.abc", key: "Bb" }]);
});

test("updateSongKeyInPersonalSetlist changes just that song's key override", () => {
  var storage = makeStorage();
  var entry = createPersonalSetlist(storage, "My List");
  addSongToPersonalSetlist(storage, entry.id, { file: "basin_street.abc", key: "" });
  updateSongKeyInPersonalSetlist(storage, entry.id, 0, "C");
  assert.equal(listPersonalSetlists(storage)[0].songs[0].key, "C");
});

test("setPersonalSetlistOrder rearranges songs to match a permutation", () => {
  var storage = makeStorage();
  var entry = createPersonalSetlist(storage, "My List");
  ["a.abc", "b.abc", "c.abc", "d.abc"].forEach(function(file) {
    addSongToPersonalSetlist(storage, entry.id, { file: file, key: "" });
  });

  setPersonalSetlistOrder(storage, entry.id, [3, 0, 1, 2]); // d a b c
  var files1 = listPersonalSetlists(storage)[0].songs.map((s) => s.file);
  assert.deepEqual(files1, ["d.abc", "a.abc", "b.abc", "c.abc"]);

  setPersonalSetlistOrder(storage, entry.id, [1, 0, 3, 2]); // a d c b
  var files2 = listPersonalSetlists(storage)[0].songs.map((s) => s.file);
  assert.deepEqual(files2, ["a.abc", "d.abc", "c.abc", "b.abc"]);
});

test("setPersonalSetlistOrder ignores a non-permutation (wrong length, dup, out of range)", () => {
  var storage = makeStorage();
  var entry = createPersonalSetlist(storage, "My List");
  ["a.abc", "b.abc", "c.abc"].forEach(function(file) {
    addSongToPersonalSetlist(storage, entry.id, { file: file, key: "" });
  });
  var original = ["a.abc", "b.abc", "c.abc"];

  setPersonalSetlistOrder(storage, entry.id, [0, 1]); // too short
  setPersonalSetlistOrder(storage, entry.id, [0, 1, 1]); // duplicate
  setPersonalSetlistOrder(storage, entry.id, [0, 1, 9]); // out of range
  assert.deepEqual(listPersonalSetlists(storage)[0].songs.map((s) => s.file), original);
});

test("addDividerToPersonalSetlist / updateDividerLabelInPersonalSetlist manage set breaks", () => {
  var storage = makeStorage();
  var entry = createPersonalSetlist(storage, "My List");
  addSongToPersonalSetlist(storage, entry.id, { file: "a.abc", key: "" });
  addDividerToPersonalSetlist(storage, entry.id);
  addSongToPersonalSetlist(storage, entry.id, { file: "b.abc", key: "" });

  assert.deepEqual(listPersonalSetlists(storage)[0].songs, [
    { file: "a.abc", key: "" },
    { divider: "" },
    { file: "b.abc", key: "" },
  ]);

  updateDividerLabelInPersonalSetlist(storage, entry.id, 1, "Second set");
  assert.equal(listPersonalSetlists(storage)[0].songs[1].divider, "Second set");

  // Refuses to relabel a non-divider index.
  updateDividerLabelInPersonalSetlist(storage, entry.id, 0, "nope");
  assert.deepEqual(listPersonalSetlists(storage)[0].songs[0], { file: "a.abc", key: "" });

  // A divider survives export/import as a "# break" line.
  var text = exportPersonalSetlistText(storage, entry.id);
  assert.match(text, /# break,Second set/);
  var deviceB = makeStorage();
  var imported = importPersonalSetlistText(deviceB, text, "fallback");
  assert.equal(imported.songs[1].divider, "Second set");
});

test("renamePersonalSetlist updates the name", () => {
  var storage = makeStorage();
  var entry = createPersonalSetlist(storage, "Old Name");
  renamePersonalSetlist(storage, entry.id, "New Name");
  assert.equal(listPersonalSetlists(storage)[0].name, "New Name");
});

test("deletePersonalSetlist removes only the targeted list", () => {
  var storage = makeStorage();
  var a = createPersonalSetlist(storage, "A");
  var b = createPersonalSetlist(storage, "B");
  deletePersonalSetlist(storage, a.id);
  var list = listPersonalSetlists(storage);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, b.id);
});

test("copyBandSetlistToPersonal clones songs into an independent new entry", () => {
  var storage = makeStorage();
  var bandSetlist = { name: "Zeeland Jazz 2026", desc: "text", songs: [{ file: "basin_street.abc", key: "C" }] };
  var copy = copyBandSetlistToPersonal(storage, bandSetlist);
  assert.equal(copy.name, "Zeeland Jazz 2026");
  assert.deepEqual(copy.songs, bandSetlist.songs);

  addSongToPersonalSetlist(storage, copy.id, { file: "extra.abc", key: "" });
  assert.equal(bandSetlist.songs.length, 1); // original untouched
});

test("exportPersonalSetlistText / importPersonalSetlistText round-trip across two devices", () => {
  var deviceA = makeStorage();
  var entry = createPersonalSetlist(deviceA, "Export Me");
  addSongToPersonalSetlist(deviceA, entry.id, { file: "basin_street.abc", key: "Bb" });

  var text = exportPersonalSetlistText(deviceA, entry.id);
  assert.match(text, /# name,Export Me/);
  assert.match(text, /basin_street\.abc,Bb/);

  var deviceB = makeStorage(); // a different browser/device
  var imported = importPersonalSetlistText(deviceB, text, "fallback");
  assert.equal(imported.name, "Export Me");
  assert.deepEqual(imported.songs, [{ file: "basin_street.abc", key: "Bb" }]);
});

test("importPersonalSetlistText falls back to a given name when the file has none", () => {
  var storage = makeStorage();
  var imported = importPersonalSetlistText(storage, "basin_street.abc,\n", "my_upload");
  assert.equal(imported.name, "my_upload");
});

test("every function degrades to a no-op / empty result when storage is unavailable, never throws", () => {
  var brokenStorage = {
    getItem: function() {
      throw new Error("storage disabled");
    },
    setItem: function() {
      throw new Error("storage disabled");
    },
  };
  assert.deepEqual(listPersonalSetlists(brokenStorage), []);
  assert.doesNotThrow(function() {
    createPersonalSetlist(brokenStorage, "Won't persist");
  });
  assert.doesNotThrow(function() {
    deletePersonalSetlist(brokenStorage, "nonexistent");
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listPracticeNotes, addPracticeNote, updatePracticeNoteText, deletePracticeNote,
} from "./practice-notes-store.js";
import { memoryStorage as makeStorage } from "../../../tests/helpers/ctx.js";

const BASIN_STREET = "basin_street.abc";

test("addPracticeNote + listPracticeNotes round-trip, scoped by songFile", () => {
  const storage = makeStorage();
  addPracticeNote(storage, {
    songFile: BASIN_STREET, note: 1, text: "watch the turnaround",
  });
  addPracticeNote(storage, {
    songFile: "tiger_rag.abc", note: null, text: "count the pickup",
  });
  const forSong = listPracticeNotes(storage, BASIN_STREET);
  assert.equal(forSong.length, 1);
  assert.equal(forSong[0].note, 1);
  assert.equal(forSong[0].text, "watch the turnaround");
  assert.ok(forSong[0].id);
  assert.ok(forSong[0].createdAt);
});

test("addPracticeNote defaults an omitted note to null (unanchored)", () => {
  const storage = makeStorage();
  const entry = addPracticeNote(storage, { songFile: BASIN_STREET, text: "slow down" });
  assert.equal(entry.note, null);
});

test("updatePracticeNoteText only changes the matching entry", () => {
  const storage = makeStorage();
  const a = addPracticeNote(storage, { songFile: BASIN_STREET, note: 0, text: "a" });
  const b = addPracticeNote(storage, { songFile: BASIN_STREET, note: 1, text: "b" });
  updatePracticeNoteText(storage, a.id, "a-edited");
  const all = listPracticeNotes(storage, BASIN_STREET);
  assert.equal(all.find((n) => n.id === a.id).text, "a-edited");
  assert.equal(all.find((n) => n.id === b.id).text, "b");
});

test("deletePracticeNote removes just that entry", () => {
  const storage = makeStorage();
  const a = addPracticeNote(storage, { songFile: BASIN_STREET, note: 0, text: "a" });
  const b = addPracticeNote(storage, { songFile: BASIN_STREET, note: 1, text: "b" });
  deletePracticeNote(storage, a.id);
  const all = listPracticeNotes(storage, BASIN_STREET);
  assert.equal(all.length, 1);
  assert.equal(all[0].id, b.id);
});

test("listPracticeNotes with no songFile returns everything", () => {
  const storage = makeStorage();
  addPracticeNote(storage, { songFile: BASIN_STREET, note: 0, text: "a" });
  addPracticeNote(storage, { songFile: "tiger_rag.abc", note: 0, text: "b" });
  assert.equal(listPracticeNotes(storage).length, 2);
});

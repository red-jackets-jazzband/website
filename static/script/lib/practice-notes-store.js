import { readJsonArray, writeJsonBlob, generateStoreId } from "./json-storage.js";

// Personal practice notes jotted on a song's sheet — pure text, anchored to a
// note by lib/note-address.js's flat, sequential position (or, when `note` is
// null, unanchored — a click that landed on empty staff space; not currently
// reachable from the UI, and not rendered — see songs/practice-notes.js's own
// doc comment). Keyed per-song by `songFile` (the .abc filename, e.g.
// "basin_street.abc" — the same song-identity convention personal setlists
// use), never the slug or library index, which are ambiguous under duplicate
// titles. Entirely local (localStorage), never synced.
const STORAGE_KEY = "rj.practiceNotes.v1";

function readAll(storage) {
  return readJsonArray(storage, STORAGE_KEY);
}

function writeAll(storage, list) {
  writeJsonBlob(storage, STORAGE_KEY, list);
}

// All practice notes for one song, or every stored note when `songFile` is
// omitted (not currently used by the UI, but keeps this store's shape
// consistent with patches-store.js's listPatches).
export function listPracticeNotes(storage, songFile) {
  const all = readAll(storage);
  return songFile === undefined ? all : all.filter((n) => n.songFile === songFile);
}

export function addPracticeNote(storage, {
  songFile, note = undefined, text,
}) {
  const all = readAll(storage);
  const entry = {
    id: generateStoreId(),
    songFile,
    note: note === undefined ? null : note,
    text,
    createdAt: Date.now(),
  };
  all.push(entry);
  writeAll(storage, all);
  return entry;
}

export function updatePracticeNoteText(storage, id, text) {
  const all = readAll(storage);
  const entry = all.find((n) => n.id === id);
  if (entry) entry.text = text;
  writeAll(storage, all);
}

export function deletePracticeNote(storage, id) {
  writeAll(storage, readAll(storage).filter((n) => n.id !== id));
}

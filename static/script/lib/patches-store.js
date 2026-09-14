import { readJsonArray, writeJsonBlob, generateStoreId } from "./json-storage.js";

// Personal ABC-text patches (a pitch/rest/insert/chord correction to a song's
// notation), stored and scoped by songFile the same way practice-notes-store
// is — see that file's doc comment. Kept as its own store/file (not folded
// into one "annotations" store with a `kind` field) so practice notes can
// ship and be reviewed as their own phase before patches exist at all.
// Addressed by lib/note-address.js's flat note position, matching
// lib/apply-patches.js's own addressing — see that file's doc comment.
const STORAGE_KEY = "rj.patches.v1";

// "pitch" and "rest" are alternative edits to the same note slot — applying
// one replaces any existing patch of the *other* kind on that same slot, so a
// note is never simultaneously "repitched" and "rested". "chord" and "insert"
// each key independently of that family and of each other, so e.g. a pitch
// edit and a chord edit on the same note slot both persist side by side.
const NOTE_EDIT_FAMILY = new Set(["pitch", "rest"]);

function familyOf(action) {
  return NOTE_EDIT_FAMILY.has(action) ? "noteEdit" : action;
}

function readAll(storage) {
  return readJsonArray(storage, STORAGE_KEY);
}

function writeAll(storage, list) {
  writeJsonBlob(storage, STORAGE_KEY, list);
}

export function listPatches(storage, songFile) {
  const all = readAll(storage);
  return songFile === undefined ? all : all.filter((p) => p.songFile === songFile);
}

/*
  Insert-or-replace the one patch at a given (songFile, note, action family)
  slot — see NOTE_EDIT_FAMILY above. `note` is the flat, sequential position
  lib/note-address.js and lib/apply-patches.js address by (never abcjs's own
  {measure, note} pair — see those files' own doc comments for why), or null
  for a chord/insert patch with no specific anchor note (lib/apply-patches.js's
  own "append at end of tune" / "trailing annotation" cases). `value: null` is
  a legitimate stored value (e.g. a "chord" patch removing an existing chord
  symbol), not a signal to drop the patch; deleting a patch outright is
  removePatch below.
*/
export function upsertPatch(storage, {
  songFile, note = undefined, action, value,
}) {
  const family = familyOf(action);
  const noteKey = note === undefined ? null : note;
  const all = readAll(storage).filter((p) => !(
    p.songFile === songFile && p.note === noteKey && familyOf(p.action) === family
  ));
  const entry = {
    id: generateStoreId(),
    songFile,
    note: noteKey,
    action,
    value: value === undefined ? null : value,
    createdAt: Date.now(),
  };
  all.push(entry);
  writeAll(storage, all);
  return entry;
}

export function removePatch(storage, id) {
  writeAll(storage, readAll(storage).filter((p) => p.id !== id));
}

"use strict";

import { parseSetlistFile, serializeSetlistFile, isSetlistDivider } from "./setlist-format.js";

var STORAGE_KEY = "rj.setlists.v1";

function readStorage(storage) {
  if (!storage) return [];
  try {
    var raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_e) {
    return [];
  }
}

function writeStorage(storage, list) {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (_e) {
    // storage unavailable/full — the change just won't persist.
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function findEntry(list, id) {
  return list.find(function(entry) {
    return entry.id === id;
  });
}

export function listPersonalSetlists(storage) {
  return readStorage(storage);
}

export function getPersonalSetlist(storage, id) {
  return findEntry(readStorage(storage), id) || null;
}

function createEntry(storage, data) {
  var list = readStorage(storage);
  var entry = {
    id: generateId(),
    name: data.name,
    desc: data.desc || "",
    songs: data.songs ? data.songs.slice() : [],
  };
  list.push(entry);
  writeStorage(storage, list);
  return entry;
}

export function createPersonalSetlist(storage, name) {
  return createEntry(storage, { name: name, desc: "", songs: [] });
}

export function deletePersonalSetlist(storage, id) {
  var list = readStorage(storage).filter(function(entry) {
    return entry.id !== id;
  });
  writeStorage(storage, list);
}

export function renamePersonalSetlist(storage, id, name) {
  var list = readStorage(storage);
  var entry = findEntry(list, id);
  if (entry) entry.name = name;
  writeStorage(storage, list);
}

export function addSongToPersonalSetlist(storage, id, song) {
  var list = readStorage(storage);
  var entry = findEntry(list, id);
  if (entry) entry.songs.push(song);
  writeStorage(storage, list);
}

export function removeSongFromPersonalSetlist(storage, id, index) {
  var list = readStorage(storage);
  var entry = findEntry(list, id);
  if (entry) entry.songs.splice(index, 1);
  writeStorage(storage, list);
}

// Appends a set divider ("break") to the end of the list. Its label is left
// blank — the UI shows an auto "Set N" caption until one is typed in.
export function addDividerToPersonalSetlist(storage, id) {
  var list = readStorage(storage);
  var entry = findEntry(list, id);
  if (entry) entry.songs.push({ divider: "" });
  writeStorage(storage, list);
}

export function updateDividerLabelInPersonalSetlist(storage, id, index, label) {
  var list = readStorage(storage);
  var entry = findEntry(list, id);
  if (entry && isSetlistDivider(entry.songs[index])) entry.songs[index].divider = label;
  writeStorage(storage, list);
}

export function updateSongKeyInPersonalSetlist(storage, id, index, key) {
  var list = readStorage(storage);
  var entry = findEntry(list, id);
  if (entry && entry.songs[index]) entry.songs[index].key = key;
  writeStorage(storage, list);
}

// Swaps the song at `index` with its neighbor at `index + direction`
// (direction: -1 to move up, +1 to move down). No-op at the ends.
export function moveSongInPersonalSetlist(storage, id, index, direction) {
  var list = readStorage(storage);
  var entry = findEntry(list, id);
  if (entry) {
    var songs = entry.songs;
    var target = index + direction;
    if (target >= 0 && target < songs.length) {
      var tmp = songs[index];
      songs[index] = songs[target];
      songs[target] = tmp;
    }
  }
  writeStorage(storage, list);
}

// Clones a band setlist's songs into a new, independent personal entry —
// editing the copy never touches the original band .txt file (which is
// static and read-only anyway).
export function copyBandSetlistToPersonal(storage, bandSetlist) {
  return createEntry(storage, {
    name: bandSetlist.name,
    desc: bandSetlist.desc || "",
    songs: bandSetlist.songs,
  });
}

export function exportPersonalSetlistText(storage, id) {
  var entry = getPersonalSetlist(storage, id);
  return entry ? serializeSetlistFile(entry) : null;
}

// Imports a setlist .txt (this device's own export, or one carried over
// from another device) as a new personal entry. `fallbackName` is used
// when the file has no "# name," comment line (e.g. hand-edited).
export function importPersonalSetlistText(storage, text, fallbackName) {
  var parsed = parseSetlistFile(text);
  return createEntry(storage, {
    name: parsed.name || fallbackName,
    desc: parsed.desc || "",
    songs: parsed.songs,
  });
}

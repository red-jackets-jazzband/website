// Shared localStorage-array helpers for a store that persists a flat JSON
// array of records — generalizes the safeGetItem/parseStoredList/writeStorage
// trio setlists-store.js already had, so practice-notes-store.js and
// patches-store.js don't each carry a third/fourth copy (a real jscpd risk
// per CLAUDE.md's 1% duplication gate). setlists-store.js itself is left
// untouched — its own trio still works fine and isn't worth churning.

function safeGetItem(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function parseStoredList(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function readJsonArray(storage, key) {
  if (!storage) return [];
  const raw = safeGetItem(storage, key);
  if (!raw) return [];
  const parsed = parseStoredList(raw);
  return Array.isArray(parsed) ? parsed : [];
}

export function writeJsonBlob(storage, key, value) {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (_e) {
    // storage unavailable/full — the change just won't persist.
  }
}

// crypto.randomUUID: available in every supported browser and in Node 22 (CI).
export function generateStoreId() {
  return Date.now().toString(36) + crypto.randomUUID().slice(0, 8);
}

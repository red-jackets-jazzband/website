// Shared localStorage helpers for the stores that persist JSON in the
// browser (setlists-store.js, practice-notes-store.js, patches-store.js):
// safe reads, array reads, writes and a local id.

export function safeGetItem(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function parseStoredList(raw) {
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

// A non-cryptographic local id (crypto.randomUUID is Safari 15.4+).
export function generateStoreId() {
  // Not a security context — a local id for one browser's own notes.
  // eslint-disable-next-line sonarjs/pseudo-random
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/*
   The band space (docs/device-sync-plan.md, phase 2): a second vault, with its
   own code, that holds only what a member chose to share — for now, song-form
   versions, each under its author's name. Same server, same encryption, same
   engine (createVaultEngine); this file is the band space's "codec".

   Document: { format, device, members: [{ author, name, at }],
               versions: [{ file, author, raw, at }],
               tomb: { versions: { "<file>/<author>": at } } }

   Only an author changes their own versions — enforced by the app (the UI
   offers no edit of anyone else's), not the server: names and authorship are
   labels among bandmates, not a login. Everything downloaded is validated like
   any decrypted data.

   Local storage: rj.band.code / rj.band.oldcode (the vault), rj.band.state
   ({ version, pending, snapshot }, the engine's bookkeeping), rj.band.profile
   ({ author, name, at }), rj.band.shared ({ <file>: true }: own song forms
   shared with the band) and rj.band.doc (the last merged document — where
   other members' versions are read from). An own version's `raw` is always
   the song form's own stored value (rj.songForm.<file>).
*/
import { songFormPrefKey } from "../core/preferences.js";
import { readStoredForm } from "../music/song-form.js";
import { canonical } from "./engine.js";
import { nextStamp, observeStamp, pruneTombstones, readMeta, stampAfter, writeMeta } from "./clock.js";
import { cleanList, isId, isObject, isSongFile, stamp, text, uniqueBy } from "./validate.js";

export const BAND_FORMAT = 1;
export const BAND_CODE_KEY = "rj.band.code";
export const BAND_OLD_CODE_KEY = "rj.band.oldcode";
const STATE_KEY = "rj.band.state";
const PROFILE_KEY = "rj.band.profile";
const SHARED_KEY = "rj.band.shared";
const DOC_KEY = "rj.band.doc";
const MAX_MEMBERS = 60;
const MAX_VERSIONS = 400;
const NAME_MAX = 40;
const FORM_MAX = 20000;

const CONTROL_ALL = /[\u0000-\u001f\u007f]/g; // eslint-disable-line no-control-regex -- stripping control bytes from a display name

function readJson(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key));
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

function writeJson(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (_e) {
    // storage unavailable or full — the band space just won't survive a reload.
  }
}

export function versionKey(file, author) {
  return `${file}/${author}`;
}

export function emptyBandDoc() {
  return { format: BAND_FORMAT, device: "", members: [], versions: [], tomb: { versions: {} } };
}

export function cleanName(name) {
  return String(name === undefined || name === null ? "" : name).replace(CONTROL_ALL, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
}

// ---- local profile, shares, cached document ------------------------------

function randomAuthor() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => { return b.toString(16).padStart(2, "0"); }).join("");
}

// { author, name, at }; the author id is made on first use.
export function readProfile(storage) {
  const stored = readJson(storage, PROFILE_KEY) || {};
  const profile = {
    author: isId(stored.author) ? stored.author : randomAuthor(),
    name: cleanName(stored.name),
    at: stamp(stored.at),
  };
  if (stored.author !== profile.author) writeJson(storage, PROFILE_KEY, profile);
  return profile;
}

export function setDisplayName(storage, name, now) {
  const profile = readProfile(storage);
  profile.name = cleanName(name);
  profile.at = nextStamp(storage, now);
  writeJson(storage, PROFILE_KEY, profile);
  return profile;
}

export function bandConnected(storage) {
  try {
    return Boolean(storage) && Boolean(storage.getItem(BAND_CODE_KEY));
  } catch {
    return false;
  }
}

export function sharedFiles(storage) {
  const stored = readJson(storage, SHARED_KEY) || {};
  return Object.keys(stored).filter((file) => { return stored[file] === true && isSongFile(file); });
}

export function isShared(storage, file) {
  return sharedFiles(storage).includes(file);
}

export function setShared(storage, file, on) {
  const stored = readJson(storage, SHARED_KEY) || {};
  if (on) stored[file] = true;
  else delete stored[file];
  writeJson(storage, SHARED_KEY, stored);
}

export function readBandDoc(storage) {
  const checked = validateBandDoc(readJson(storage, DOC_KEY));
  return checked.ok ? checked.doc : emptyBandDoc();
}

// Other members' versions of a song, newest first: [{ author, name, rounds, at }].
export function versionsOf(storage, file) {
  const doc = readBandDoc(storage);
  const me = readProfile(storage).author;
  const names = {};
  doc.members.forEach((member) => { names[member.author] = member.name; });
  return doc.versions
    .filter((v) => { return v.file === file && v.author !== me; })
    .map((v) => { return { author: v.author, name: names[v.author] || "", rounds: readStoredForm(v.raw).rounds, raw: v.raw, at: v.at }; })
    .sort((a, b) => { return b.at - a.at; });
}

// ---- validation ----------------------------------------------------------

function cleanMember(member) {
  if (!isObject(member) || !isId(member.author)) return null;
  return { ...member, name: cleanName(member.name), at: stamp(member.at) };
}

function cleanVersion(version) {
  if (!isObject(version) || !isSongFile(version.file) || !isId(version.author)) return null;
  if (!text(version.raw, FORM_MAX) || !readStoredForm(version.raw)) return null;
  return { ...version, at: stamp(version.at) };
}

function cleanTombs(tomb) {
  const out = { versions: {} };
  const source = isObject(tomb) && isObject(tomb.versions) ? tomb.versions : {};
  Object.keys(source).forEach((key) => {
    const slash = key.lastIndexOf("/");
    if (slash > 0 && isSongFile(key.slice(0, slash)) && isId(key.slice(slash + 1)) && Number.isFinite(source[key])) {
      out.versions[key] = source[key];
    }
  });
  return out;
}

function uniqueVersions(versions) {
  return uniqueBy(versions.map((v) => { return { ...v, key: versionKey(v.file, v.author) }; }), "key")
    .map((v) => { const { key: _key, ...rest } = v; return rest; }); // eslint-disable-line no-unused-vars -- drops the helper field
}

// → { ok, doc } | { ok: false, newer } like validateDoc (a newer format is download-only).
export function validateBandDoc(raw) {
  if (!isObject(raw) || !Number.isInteger(raw.format) || raw.format < 1) return { ok: false, newer: false };
  if (raw.format > BAND_FORMAT) return { ok: false, newer: true };
  return {
    ok: true,
    doc: {
      ...raw,
      format: BAND_FORMAT,
      device: typeof raw.device === "string" ? raw.device.slice(0, 64) : "",
      members: uniqueBy(cleanList(raw.members, MAX_MEMBERS, cleanMember), "author"),
      versions: uniqueVersions(cleanList(raw.versions, MAX_VERSIONS, cleanVersion)),
      tomb: cleanTombs(raw.tomb),
    },
  };
}

// ---- merge ---------------------------------------------------------------

function firstWins(stampA, deviceA, stampB, deviceB) {
  return stampA !== stampB ? stampA > stampB : deviceA >= deviceB;
}

function mergeMembers(a, b) {
  const byAuthor = {};
  const take = (member, device) => {
    const held = byAuthor[member.author];
    if (!held || firstWins(member.at, device, held.member.at, held.device)) byAuthor[member.author] = { member, device };
  };
  a.members.forEach((m) => { take(m, a.device || ""); });
  b.members.forEach((m) => { take(m, b.device || ""); });
  return Object.keys(byAuthor).sort((x, y) => { return x.localeCompare(y); }).map((k) => { return byAuthor[k].member; });
}

function maxTombs(a, b) {
  const out = { ...a };
  Object.keys(b).forEach((key) => { out[key] = Math.max(out[key] === undefined ? -Infinity : out[key], b[key]); });
  return out;
}

function mergeVersions(a, b, tomb) {
  const best = {};
  const take = (version, device) => {
    const key = versionKey(version.file, version.author);
    const held = best[key];
    if (!held || firstWins(version.at, device, held.version.at, held.device)) best[key] = { version, device };
  };
  a.versions.forEach((v) => { take(v, a.device || ""); });
  b.versions.forEach((v) => { take(v, b.device || ""); });
  return Object.keys(best).filter((key) => {
    const at = tomb.versions[key];
    return at === undefined || at < best[key].version.at;
  }).sort((x, y) => { return x.localeCompare(y); }).map((key) => { return best[key].version; });
}

// Pure and symmetric. `now` only decides which old tombstones are dropped.
export function mergeBandDocs(a, b, now) {
  const tomb = pruneTombstones({ versions: maxTombs(a.tomb.versions, b.tomb.versions) }, now === undefined ? Date.now() : now);
  return {
    ...b,
    ...a,
    format: Math.max(a.format, b.format),
    device: a.device,
    members: mergeMembers(a, b),
    versions: mergeVersions(a, b, tomb),
    tomb,
  };
}

// ---- local ↔ document ----------------------------------------------------

function ownFormRaw(storage, file) {
  try {
    const raw = storage.getItem(songFormPrefKey(file));
    return typeof raw === "string" && readStoredForm(raw) ? raw : null;
  } catch {
    return null;
  }
}

function ownVersions(storage, cached, author, meta, clock) {
  const before = {};
  cached.versions.forEach((v) => { if (v.author === author) before[v.file] = v; });
  const now = [];
  sharedFiles(storage).forEach((file) => {
    const raw = ownFormRaw(storage, file);
    if (raw === null) return;
    const old = before[file];
    now.push({ file, author, raw, at: old && old.raw === raw ? old.at : stampAfter(meta, clock) });
  });
  return now;
}

// The document for this device: the cached band doc with this member's own
// shared versions brought up to date (an edited one is stamped, an unshared or
// deleted one gets a tombstone) and their name.
export function buildBandDoc(storage, now) {
  const clock = now === undefined ? Date.now() : now;
  const cached = readBandDoc(storage);
  const profile = readProfile(storage);
  const meta = readMeta(storage);
  const mine = ownVersions(storage, cached, profile.author, meta, clock);
  const tomb = { versions: { ...cached.tomb.versions } };
  const keep = new Set(mine.map((v) => { return v.file; }));
  cached.versions.forEach((v) => {
    if (v.author !== profile.author || keep.has(v.file)) return;
    const key = versionKey(v.file, v.author);
    if (tomb.versions[key] === undefined || tomb.versions[key] < v.at) tomb.versions[key] = Math.max(stampAfter(meta, clock), v.at + 1);
  });
  const members = cached.members.filter((m) => { return m.author !== profile.author; });
  if (profile.name) members.push({ author: profile.author, name: profile.name, at: profile.at });
  writeMeta(storage, meta);
  const versions = cached.versions.filter((v) => { return v.author !== profile.author; }).concat(mine);
  return { format: BAND_FORMAT, device: meta.deviceId, members, versions, tomb };
}

// Saves the merged document as the cache and as the new snapshot.
export function applyBandDoc(storage, doc) {
  const meta = readMeta(storage);
  doc.members.forEach((m) => { observeStamp(meta, m.at); });
  doc.versions.forEach((v) => { observeStamp(meta, v.at); });
  writeMeta(storage, meta);
  writeJson(storage, DOC_KEY, doc);
  writeJson(storage, STATE_KEY, { ...(readJson(storage, STATE_KEY) || {}), snapshot: doc });
}

function sameBandContent(a, b) {
  if (!a || !b || !Array.isArray(a.members) || !Array.isArray(b.members)) return false;
  return canonical({ members: a.members, versions: a.versions, tomb: a.tomb }) === canonical({ members: b.members, versions: b.versions, tomb: b.tomb });
}

export const BAND_CODEC = {
  codeKey: BAND_CODE_KEY,
  oldCodeKey: BAND_OLD_CODE_KEY,
  build: buildBandDoc,
  apply: applyBandDoc,
  merge: mergeBandDocs,
  validate: validateBandDoc,
  same: sameBandContent,
  readState(storage) {
    const state = readJson(storage, STATE_KEY) || {};
    return { version: Number.isInteger(state.version) ? state.version : 0, pending: state.pending === true, snapshot: state.snapshot };
  },
  writeState(storage, patch) {
    const state = readJson(storage, STATE_KEY) || {};
    if (patch.version !== undefined) state.version = patch.version;
    if (patch.pending !== undefined) state.pending = patch.pending;
    writeJson(storage, STATE_KEY, state);
  },
};

// Leaving the band space: forget the code and what came from it; own song
// forms stay (they were only ever copied).
export function forgetBand(storage) {
  [BAND_CODE_KEY, STATE_KEY, DOC_KEY, SHARED_KEY].forEach((key) => {
    try {
      storage.removeItem(key);
    } catch (_e) {
      // storage unavailable — nothing to forget.
    }
  });
}

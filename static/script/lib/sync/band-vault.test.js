import { test } from "node:test";
import assert from "node:assert/strict";
import { createVaultEngine } from "./engine.js";
import { fakeServer, makeStorage } from "../../../../tests/helpers/sync-server.js";
import {
  BAND_CODEC, mergeBandDocs, readProfile, setDisplayName, setShared, validateBandDoc, versionsOf, emptyBandDoc, cleanName,
} from "./band-vault.js";
import { songFormPrefKey } from "../core/preferences.js";

const FILE = "a.abc";
const PANAMA = "panama.abc";
const FORM = JSON.stringify({ show: "mine", rows: [["1", "A A B A", "", ""]] });
const FORM_B = JSON.stringify({ show: "mine", rows: [["1", "A B", "", ""]] });

function form(at, raw) {
  return { file: FILE, author: "aa", raw, at };
}

function member(server, name) {
  const storage = makeStorage();
  const engine = createVaultEngine({ storage, fetchFn: server.fetchFn, baseUrl: "https://s.test", codec: BAND_CODEC });
  setDisplayName(storage, name);
  return { storage, engine };
}

function share(who, file, raw) {
  who.storage.setItem(songFormPrefKey(file), raw);
  setShared(who.storage, file, true);
}

test("a shared version reaches a bandmate, with its author's name", async () => {
  const server = fakeServer();
  const anna = member(server, "Anna · clarinet");
  const pieter = member(server, "Pieter");
  share(anna, PANAMA, FORM);
  const made = await anna.engine.connect();
  assert.equal(made.status, "ok");
  assert.equal((await pieter.engine.join(made.code)).status, "ok");
  const seen = versionsOf(pieter.storage, PANAMA);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].name, "Anna · clarinet");
  assert.equal(seen[0].raw, FORM);
  // Pieter's own versions are not listed as someone else's.
  share(pieter, PANAMA, FORM_B);
  await pieter.engine.sync();
  await anna.engine.sync();
  assert.deepEqual(versionsOf(anna.storage, PANAMA).map((v) => { return v.name; }), ["Pieter"]);
  assert.equal(versionsOf(pieter.storage, PANAMA).length, 1);
});

test("editing a shared version updates it for the band; unsharing removes it", async () => {
  const server = fakeServer();
  const anna = member(server, "Anna");
  const pieter = member(server, "Pieter");
  share(anna, FILE, FORM);
  const { code } = await anna.engine.connect();
  await pieter.engine.join(code);
  anna.storage.setItem(songFormPrefKey(FILE), FORM_B);
  await anna.engine.sync();
  await pieter.engine.sync();
  assert.equal(versionsOf(pieter.storage, FILE)[0].raw, FORM_B);
  setShared(anna.storage, FILE, false);
  await anna.engine.sync();
  await pieter.engine.sync();
  assert.equal(versionsOf(pieter.storage, FILE).length, 0);
  // A later share beats the old tombstone.
  setShared(anna.storage, FILE, true);
  await anna.engine.sync();
  await pieter.engine.sync();
  assert.equal(versionsOf(pieter.storage, FILE).length, 1);
});

test("renaming shows everywhere; the same name on two members stays two authors", async () => {
  const server = fakeServer();
  const a = member(server, "Ben");
  const b = member(server, "Ben");
  const { code } = await a.engine.connect();
  await b.engine.join(code);
  await a.engine.sync();
  assert.notEqual(readProfile(a.storage).author, readProfile(b.storage).author);
  setDisplayName(b.storage, "Ben S.");
  await b.engine.sync();
  await a.engine.sync();
  share(b, "x.abc", FORM);
  await b.engine.sync();
  await a.engine.sync();
  assert.equal(versionsOf(a.storage, "x.abc")[0].name, "Ben S.");
});

test("the merge is symmetric and repeatable", () => {
  const a = { ...emptyBandDoc(), device: "d1", versions: [form(5, FORM)], members: [{ author: "aa", name: "A", at: 1 }] };
  const b = { ...emptyBandDoc(), device: "d2", versions: [form(9, FORM_B)], tomb: { versions: {} } };
  const ab = mergeBandDocs(a, b, 10);
  const ba = mergeBandDocs(b, a, 10);
  assert.deepEqual(ab.versions, ba.versions);
  assert.deepEqual(ab.members, ba.members);
  assert.equal(ab.versions[0].raw, FORM_B);
  assert.deepEqual(mergeBandDocs(ab, ab, 10).versions, ab.versions);
  const gone = { ...emptyBandDoc(), device: "d3", tomb: { versions: { "a.abc/aa": 20 } } };
  assert.equal(mergeBandDocs(ab, gone, 25).versions.length, 0);
});

test("a downloaded document is validated: bad versions, files and names are dropped", () => {
  const checked = validateBandDoc({
    format: 1,
    device: "d",
    members: [{ author: "ok", name: "A\u0000\n  B" }, { author: "bad id!", name: "x" }, "junk"],
    versions: [
      { file: "../evil.abc", author: "ok", raw: FORM, at: 1 },
      { file: FILE, author: "ok", raw: "not json", at: 1 },
      { file: FILE, author: "ok", raw: FORM, at: 1 },
      { file: FILE, author: "ok", raw: FORM_B, at: 2 },
    ],
    tomb: { versions: { "b.abc/ok": 3, "no-slash": 4, "../x.abc/ok": 5 } },
    future: "kept",
  });
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.doc.members.map((m) => { return m.name; }), ["A B"]);
  assert.equal(checked.doc.versions.length, 1);
  assert.deepEqual(Object.keys(checked.doc.tomb.versions), ["b.abc/ok"]);
  assert.equal(checked.doc.future, "kept");
  assert.deepEqual(validateBandDoc({ format: 2 }), { ok: false, newer: true });
  assert.deepEqual(validateBandDoc("x"), { ok: false, newer: false });
  assert.equal(cleanName(" a ".repeat(40)).length <= 40, true);
});

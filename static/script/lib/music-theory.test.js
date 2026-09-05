import { test } from "node:test";
import assert from "node:assert/strict";
import {
  noteChroma,
  chordToRomanNumeral,
  extractKeyFromAbc,
  semitonesBetweenKeys,
} from "./music-theory.js";

// No `Tonal` global in Node, so these exercise the manual fallback table.
test("noteChroma resolves natural, flat, and sharp notes", () => {
  assert.equal(noteChroma("C"), 0);
  assert.equal(noteChroma("Bb"), 10);
  assert.equal(noteChroma("F#"), 6);
  assert.equal(noteChroma("B♭"), 10); // unicode flat, as chords are stored after replaceAccidentalWithUtf8Char
});

test("noteChroma falls through to the manual table when Tonal returns NaN chroma", () => {
  // Regression test: Tonal.Note.get("Am") — a chord-like string, not a
  // plain note — returns { chroma: NaN, empty: true, ... } in the browser.
  // typeof NaN is still "number", so a naive `typeof n.chroma === "number"`
  // check accepts it and returns NaN instead of falling through. This bit
  // real setlist key-override transposition (semitonesBetweenKeys with a
  // minor-key target like "Am") since noteChroma is never called with a
  // bare accidental-only string elsewhere in the app.
  const realTonal = globalThis.Tonal;
  globalThis.Tonal = { Note: { get: () => ({ chroma: NaN }) } };
  try {
    assert.equal(noteChroma("Am"), 9);
  } finally {
    globalThis.Tonal = realTonal;
  }
});

test("chordToRomanNumeral maps a chord to its scale degree in a major key", () => {
  assert.equal(chordToRomanNumeral("F", "Bb", ""), "V"); // F is the 5th degree of Bb major
  assert.equal(chordToRomanNumeral("Eb", "Bb", ""), "IV"); // Eb is the 4th degree of Bb major
  assert.equal(chordToRomanNumeral("Bb7", "Bb", ""), "I7");
  assert.equal(chordToRomanNumeral(" % ", "Bb", ""), " % ");
});

test("chordToRomanNumeral lowercases minor chords", () => {
  assert.equal(chordToRomanNumeral("Cm", "Bb", ""), "ii");
});

test("extractKeyFromAbc reads the tonic, ignoring the mode word", () => {
  assert.equal(extractKeyFromAbc("X:1\nK:Bbmaj\nC D E F|"), "Bb");
  assert.equal(extractKeyFromAbc("X:1\nK:Ebmaj\n"), "Eb");
  assert.equal(extractKeyFromAbc("X:1\nK:Em\n"), "E");
  assert.equal(extractKeyFromAbc("X:1\nK:C\n"), "C");
});

test("extractKeyFromAbc returns null when there's no K: line", () => {
  assert.equal(extractKeyFromAbc("X:1\nT:No key here\n"), null);
});

test("semitonesBetweenKeys picks the shortest signed distance", () => {
  assert.equal(semitonesBetweenKeys("Bb", "C"), 2);
  assert.equal(semitonesBetweenKeys("Bb", "Ab"), -2);
  assert.equal(semitonesBetweenKeys("C", "C"), 0);
  // mode suffix on either side is ignored — only the tonic matters
  assert.equal(semitonesBetweenKeys("Bb", "Am"), -1);
});

test("semitonesBetweenKeys defaults to 0 when a key is missing", () => {
  assert.equal(semitonesBetweenKeys(null, "C"), 0);
  assert.equal(semitonesBetweenKeys("C", ""), 0);
});

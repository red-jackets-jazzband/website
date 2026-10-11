import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildPracticeTune, practiceNotes, PRACTICE_EXERCISES, rhythmSlots } from "./practice.js";
import { buildCompingTune, COMPING_PATTERNS } from "./comping.js";
import { tonalStub } from "../../../../tests/helpers/stubs.js";
import {
  ABC, SONG, CHORDS, chordsOf, barSlots, voiceBars as practiceBars,
} from "../../../../tests/helpers/bar-voice.js";

before(() => {
  globalThis.Tonal = tonalStub;
});
after(() => {
  delete globalThis.Tonal;
});

const NAMES = [["F"], ["C7"], ["F", "F7"], [null]];

const mod12 = (x) => ((x % 12) + 12) % 12;
const F_CHORD_TONES = new Set([5, 9, 0, 2]); // F A C D (the GA's major chord tones: 1 3 5 6)
const C7_CHORD_TONES = new Set([0, 4, 7, 10]);

test("every exercise builds a named Practice staff, one full bar per chart bar", () => {
  for (const { value } of PRACTICE_EXERCISES) {
    const { abc } = buildPracticeTune(ABC, CHORDS, SONG, value);
    assert.match(abc, /^V:2 name="Practice"$/m, value);
    const bars = practiceBars(abc);
    assert.equal(bars.length, 4, value);
    for (const bar of bars) assert.equal(barSlots(bar), 8, `${value}: ${bar}`);
  }
});

test("an exercise is the same every time", () => {
  assert.deepEqual(practiceNotes(NAMES, "enclosures"), practiceNotes(NAMES, "enclosures"));
});

test("a break bar stays silent", () => {
  for (const { value } of PRACTICE_EXERCISES) {
    const notes = practiceNotes(NAMES, value);
    assert.ok(notes.every((n) => n.start < 12), value);
  }
});

test("chord-tone runs only play chord tones of the chord they sound over", () => {
  const notes = practiceNotes([["F"], ["C7"]], "arpeggios");
  for (const n of notes) {
    const tones = n.start < 4 && n.start + n.duration <= 4 ? F_CHORD_TONES : C7_CHORD_TONES;
    assert.ok(tones.has(mod12(n.midi)), `${n.midi} at ${n.start}`);
  }
});

test("the first bar runs up eighth by eighth", () => {
  const notes = practiceNotes([["F"], ["F"]], "scales").slice(0, 8);
  assert.equal(notes.length, 8);
  notes.forEach((n, i) => {
    assert.equal(n.start, i / 2);
    if (i > 0) assert.ok(n.midi > notes[i - 1].midi);
  });
});

test("guide tones step to the nearest 3rd or 7th of the next chord", () => {
  const notes = practiceNotes([["F"], ["C7"], ["F"]], "guide");
  for (const n of notes) assert.notEqual(mod12(n.midi), 5, "never the root of F");
  // At each chord change the line moves to the nearest one: a step at most.
  for (const i of [2, 4]) assert.ok(Math.abs(notes[i].midi - notes[i - 1].midi) <= 2, `${notes[i].start}`);
});

test("an enclosure lands on the new chord from a step above and a half step below", () => {
  const notes = practiceNotes([["F"], ["C7"]], "enclosures");
  const target = notes.findIndex((n) => n.start === 4);
  assert.ok(target >= 2);
  assert.ok(C7_CHORD_TONES.has(mod12(notes[target].midi)));
  assert.equal(notes[target - 1].midi, notes[target].midi - 1);
  assert.ok(notes[target - 1].leadsUp);
  assert.ok(notes[target - 2].midi > notes[target].midi);
});

test("a chromatic note leading up is spelled sharp", () => {
  // F into F: the target is A, enclosed by Bb and G# (never Ab).
  const [first] = practiceBars(buildPracticeTune(ABC, chordsOf(["F"], ["F"]), SONG, "enclosures").abc);
  assert.match(first, /\^G/);
  assert.doesNotMatch(first, /_A/);
});

test("a cell ending in > ties its last note into the next bar's chord", () => {
  assert.equal(rhythmSlots(2, new Set(), ["xxxxxx.x>"]), "xxxxxx.x-xxxxx.x");
  assert.equal(rhythmSlots(2, new Set([1]), ["xxxxxx.x>"]), "xxxxxx.x........", "never into a break");
  // The fifth cell (bars 9-10) is the anticipated one.
  const names = [...Array.from({ length: 8 }, () => ["F"]), ["F"], ["C7"]];
  const anticipation = practiceNotes(names, "rhythm").find((n) => n.start === 35.5);
  assert.equal(anticipation.duration, 1, "the and of 4 tied over the bar line");
  assert.ok(C7_CHORD_TONES.has(mod12(anticipation.midi)), "plays the chord it lands on");
});

test("Practice goes on top of Comping as the next voice", () => {
  const comping = buildCompingTune(ABC, CHORDS, SONG, COMPING_PATTERNS[0].value);
  const { abc } = buildPracticeTune(comping.abc, CHORDS, SONG, "scales");
  assert.match(abc, /^V:3 name="Practice"$/m);
});

test("buildPracticeTune declines what it can't do", () => {
  assert.equal(buildPracticeTune(ABC, [], SONG, "scales"), null);
  assert.equal(buildPracticeTune(ABC, CHORDS, SONG, "kazoo"), null);
  assert.equal(buildPracticeTune(ABC.replace("M:4/4", "M:3/4"), CHORDS, SONG, "scales"), null);
});

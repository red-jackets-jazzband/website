import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import ABCJS from "abcjs";
import { buildPracticeTune, practiceNotes, PRACTICE_EXERCISES, rhythmSlots } from "./practice.js";
import { buildCompingTune, COMPING_PATTERNS } from "./comping.js";
import { parseChordScheme } from "./chords.js";
import { tonalStub } from "../../../../tests/helpers/stubs.js";
import {
  ABC, SONG, CHORDS, chordsOf, barSlots, voiceBars as practiceBars, withRealTonal,
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

// The Practice staff as abcjs actually plays it: the second voice's track
// (the melody's comes first, the chord accompaniment's last).
function practicePlayback(abc) {
  const tracks = ABCJS.parseOnly(abc)[0].setUpAudio({}).tracks;
  return tracks[1].filter((e) => e.cmd === "note").map((e) => e.pitch);
}

function practiceOf(text, exercise) {
  const song = ABCJS.parseOnly(text)[0];
  return buildPracticeTune(text, parseChordScheme(song), song, exercise);
}

test("a key change before a repeat is followed: the new section sounds as generated", () => {
  // K:Bb, then the new part opens on a bar line (Royal Garden Blues' "|:"
  // shape; a plain "|" here, so playback isn't unrolled by a repeat): the
  // E-naturals of the C7 bar must be spelled for Bb, not left bare from F.
  const text = [
    "X:1", "T:Keys", "M:4/4", "L:1/8", "K:F",
    "\"F\"F8|\"C7\"G8||", "K:Bb", "P:B", "|\"Bb\"B8|\"C7\"c8|\"F7\"c8|\"Bb\"B8|]", "",
  ].join("\n");
  withRealTonal(() => {
    for (const { value } of PRACTICE_EXERCISES) {
      const built = practiceOf(text, value);
      assert.deepEqual(practicePlayback(built.abc), built.notes.map((n) => n.midi), value);
    }
  });
});

test("a note tied into a bar doesn't set its accidental for the rest of the bar", () => {
  // Rhythm on one note over C7 in Eb ties an E-natural into the next C7 bar:
  // abcjs ignores the accidental on a tied-over note, so the next E in that
  // bar must carry its own natural.
  // The anticipated cell comes round at bars 9-10.
  const bars = Array.from({ length: 12 }, () => "\"C7\"G8").join("|");
  const text = ["X:1", "T:Tie", "M:4/4", "L:1/8", "K:Eb", `${bars}|]`, ""].join("\n");
  withRealTonal(() => {
    const built = practiceOf(text, "rhythm");
    // "...E- |E=E...": the tied-over E is written bare, the next one spells its own natural.
    assert.match(built.abc, /E- \|E=E/);
    assert.deepEqual(practicePlayback(built.abc), built.notes.map((n) => n.midi));
  });
});

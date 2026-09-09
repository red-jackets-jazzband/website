import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MIDI_VOLUME_MAX, DEFAULT_PROGRAM, percentToMidiVolume, injectMixerAudio,
} from "./audio-mix.js";

test("percentToMidiVolume scales 0-100 to 0-127 and clamps out-of-range input", () => {
  assert.equal(percentToMidiVolume(0), 0);
  assert.equal(percentToMidiVolume(100), MIDI_VOLUME_MAX);
  assert.equal(percentToMidiVolume(50), 64); // round(63.5)
  assert.equal(percentToMidiVolume(-20), 0);
  assert.equal(percentToMidiVolume(500), MIDI_VOLUME_MAX);
  assert.equal(percentToMidiVolume(undefined), 0);
});

const NO_COMPING_TUNE = ["X:1", "T:Test", "M:4/4", "L:1/8", "K:C", '"C" C8 |'].join("\n");

test("injectMixerAudio (no comping, no chords) stamps only the melody's program + vol", () => {
  const out = injectMixerAudio(NO_COMPING_TUNE, {
    compingActive: false, hasChords: false, melodyPercent: 50, bassPercent: 0, chordsPercent: 0,
  });
  const lines = out.split("\n");
  const kIndex = lines.indexOf("K:C");
  assert.equal(lines[kIndex - 1], "%%MIDI vol 64");
  assert.equal(lines[kIndex - 2], `%%MIDI program ${DEFAULT_PROGRAM.melody}`);
  assert.doesNotMatch(out, /%%MIDI (gchord|bassprog|chordprog|bassvol|chordvol)/);
  assert.ok(out.includes('"C" C8 |'));
});

test("injectMixerAudio uses a custom melody program when given one", () => {
  const out = injectMixerAudio(NO_COMPING_TUNE, {
    compingActive: false, hasChords: false, melodyPercent: 100, melodyProgram: 71, bassPercent: 0, chordsPercent: 0,
  });
  assert.match(out, /%%MIDI program 71\n%%MIDI vol 127\nK:C/);
});

test("injectMixerAudio is a no-op when there's no K: line", () => {
  const abc = "X:1\nT:Test\n";
  assert.equal(injectMixerAudio(abc, {
    compingActive: false, hasChords: false, melodyPercent: 50, bassPercent: 0, chordsPercent: 0,
  }), abc);
});

test("injectMixerAudio stamps Bass/Chords accompaniment directives (default programs) when the tune has chords", () => {
  const out = injectMixerAudio(NO_COMPING_TUNE, {
    compingActive: false, hasChords: true, melodyPercent: 100, bassPercent: 70, chordsPercent: 20,
  });
  const before = out.slice(0, out.indexOf("K:C"));
  assert.match(before, /%%MIDI gchord bzczbzcz/);
  assert.match(before, new RegExp(`%%MIDI bassprog ${DEFAULT_PROGRAM.bass}`));
  assert.match(before, new RegExp(`%%MIDI chordprog ${DEFAULT_PROGRAM.chords}`));
  assert.match(before, /%%MIDI bassvol 89/); // round(70/100*127)
  assert.match(before, /%%MIDI chordvol 25/); // round(20/100*127)
});

test("injectMixerAudio uses custom Bass/Chords programs when given one", () => {
  const out = injectMixerAudio(NO_COMPING_TUNE, {
    compingActive: false, hasChords: true, melodyPercent: 100,
    bassPercent: 0, bassProgram: 33, chordsPercent: 0, chordsProgram: 0,
  });
  assert.match(out, /%%MIDI bassprog 33/);
  assert.match(out, /%%MIDI chordprog 0/);
});

test("injectMixerAudio omits accompaniment directives entirely when the tune has no chords", () => {
  const out = injectMixerAudio(NO_COMPING_TUNE, {
    compingActive: false, hasChords: false, melodyPercent: 100, bassPercent: 70, chordsPercent: 20,
  });
  assert.doesNotMatch(out, /%%MIDI (gchord|bassprog|chordprog|bassvol|chordvol)/);
});

const COMPING_TUNE = [
  "X:1", "T:Test", "L:1/8", "%%staves [1 2]", "V:1", 'V:2 name="R\\n3\\n5"', "K:C",
  "V:1", '"C" C8 |', "V:2", "[CEG]8 |",
].join("\n");

test("injectMixerAudio (comping) stamps melody/comping program + vol after their own body markers", () => {
  const out = injectMixerAudio(COMPING_TUNE, {
    compingActive: true, hasChords: true, melodyPercent: 100, compingPercent: 25,
    compingProgram: 0, bassPercent: 0, chordsPercent: 0,
  });

  // The header's own "V:1\nV:2 name=..." declaration line is untouched —
  // only the accompaniment block (hasChords: true) landed before K:, and the
  // body markers further down each got their own line pair spliced after them.
  assert.match(out, /%%staves \[1 2\]\nV:1\nV:2 name="R\\n3\\n5"\n%%MIDI gchord/);
  assert.match(out, /%%MIDI chordvol 0\nK:C/);
  assert.match(out, new RegExp(`\\nV:1\\n%%MIDI program ${DEFAULT_PROGRAM.melody}\\n%%MIDI vol 127\\n"C" C8 \\|`));
  assert.match(out, /\nV:2\n%%MIDI program 0\n%%MIDI vol 32\n\[CEG\]8 \|/);
});

test("injectMixerAudio (comping, no chords) still has nothing to accompany", () => {
  // hasChords false shouldn't happen alongside compingActive true in
  // practice (comping needs chords to build from), but the function should
  // still behave sanely: no accompaniment lines, comping program/vol still applied.
  const out = injectMixerAudio(COMPING_TUNE, {
    compingActive: true, hasChords: false, melodyPercent: 100, compingPercent: 50, bassPercent: 0, chordsPercent: 0,
  });
  assert.doesNotMatch(out, /%%MIDI (gchord|bassprog|chordprog|bassvol|chordvol)/);
  assert.match(out, /\nV:2\n%%MIDI program \d+\n%%MIDI vol 64\n/);
});

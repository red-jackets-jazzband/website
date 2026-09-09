import { test } from "node:test";
import assert from "node:assert/strict";
import { MIDI_VOLUME_MAX, percentToMidiVolume, injectMixerAudio } from "./audio-mix.js";

test("percentToMidiVolume scales 0-100 to 0-127 and clamps out-of-range input", () => {
  assert.equal(percentToMidiVolume(0), 0);
  assert.equal(percentToMidiVolume(100), MIDI_VOLUME_MAX);
  assert.equal(percentToMidiVolume(50), 64); // round(63.5)
  assert.equal(percentToMidiVolume(-20), 0);
  assert.equal(percentToMidiVolume(500), MIDI_VOLUME_MAX);
  assert.equal(percentToMidiVolume(undefined), 0);
});

const NO_COMPING_TUNE = ["X:1", "T:Test", "M:4/4", "L:1/8", "K:C", '"C" C8 |'].join("\n");

test("injectMixerAudio (no comping, no chords) stamps only the melody's %%MIDI vol", () => {
  const out = injectMixerAudio(NO_COMPING_TUNE, {
    compingActive: false, hasChords: false, melodyPercent: 50, bassPercent: 0, chordsPercent: 0,
  });
  const lines = out.split("\n");
  assert.equal(lines[lines.indexOf("K:C") - 1], "%%MIDI vol 64");
  assert.doesNotMatch(out, /%%MIDI (gchord|bassprog|chordprog|bassvol|chordvol)/);
  assert.ok(out.includes('"C" C8 |'));
});

test("injectMixerAudio is a no-op when there's no K: line", () => {
  const abc = "X:1\nT:Test\n";
  assert.equal(injectMixerAudio(abc, {
    compingActive: false, hasChords: false, melodyPercent: 50, bassPercent: 0, chordsPercent: 0,
  }), abc);
});

test("injectMixerAudio stamps Bass/Chords accompaniment directives when the tune has chords", () => {
  const out = injectMixerAudio(NO_COMPING_TUNE, {
    compingActive: false, hasChords: true, melodyPercent: 100, bassPercent: 70, chordsPercent: 20,
  });
  const before = out.slice(0, out.indexOf("K:C"));
  assert.match(before, /%%MIDI gchord bzczbzcz/);
  assert.match(before, /%%MIDI bassprog 32/);
  assert.match(before, /%%MIDI chordprog 26/);
  assert.match(before, /%%MIDI bassvol 89/); // round(70/100*127)
  assert.match(before, /%%MIDI chordvol 25/); // round(20/100*127)
});

test("injectMixerAudio omits accompaniment directives entirely when the tune has no chords", () => {
  const out = injectMixerAudio(NO_COMPING_TUNE, {
    compingActive: false, hasChords: false, melodyPercent: 100, bassPercent: 70, chordsPercent: 20,
  });
  assert.doesNotMatch(out, /%%MIDI (gchord|bassprog|chordprog|bassvol|chordvol)/);
});

test("injectMixerAudio (comping) stamps melody/comping lines after their own body markers", () => {
  const abc = [
    "X:1", "T:Test", "L:1/8", "%%staves [1 2]", "V:1", 'V:2 name="R\\n3\\n5"', "K:C",
    "V:1", '"C" C8 |', "V:2", "[CEG]8 |",
  ].join("\n");
  const out = injectMixerAudio(abc, {
    compingActive: true, hasChords: true, melodyPercent: 100, compingPercent: 25, bassPercent: 0, chordsPercent: 0,
  });

  // The header's own "V:1\nV:2 name=..." declaration line is untouched —
  // only the accompaniment block (hasChords: true) landed before K:, and the
  // body markers further down each got their own line spliced after them.
  assert.match(out, /%%staves \[1 2\]\nV:1\nV:2 name="R\\n3\\n5"\n%%MIDI gchord/);
  assert.match(out, /%%MIDI chordvol 0\nK:C/);
  assert.match(out, /\nV:1\n%%MIDI vol 127\n"C" C8 \|/);
  assert.match(out, /\nV:2\n%%MIDI vol 32\n\[CEG\]8 \|/);
});

test("injectMixerAudio (comping, no chords) still has nothing to accompany", () => {
  const abc = [
    "X:1", "T:Test", "L:1/8", "%%staves [1 2]", "V:1", 'V:2 name="R\\n3\\n5"', "K:C",
    "V:1", '"C" C8 |', "V:2", "[CEG]8 |",
  ].join("\n");
  // hasChords false shouldn't happen alongside compingActive true in
  // practice (comping needs chords to build from), but the function should
  // still behave sanely: no accompaniment lines, comping vol still applied.
  const out = injectMixerAudio(abc, {
    compingActive: true, hasChords: false, melodyPercent: 100, compingPercent: 50, bassPercent: 0, chordsPercent: 0,
  });
  assert.doesNotMatch(out, /%%MIDI (gchord|bassprog|chordprog|bassvol|chordvol)/);
  assert.match(out, /\nV:2\n%%MIDI vol 64\n/);
});

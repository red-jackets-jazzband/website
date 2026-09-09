import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MIDI_VOLUME_MAX, DEFAULT_PROGRAM, percentToMidiVolume, injectMixerAudio, computeVoicesOff,
} from "./audio-mix.js";

test("percentToMidiVolume follows a cubic taper: finer resolution low, full range at the top", () => {
  assert.equal(percentToMidiVolume(0), 0);
  assert.equal(percentToMidiVolume(100), MIDI_VOLUME_MAX);
  assert.equal(percentToMidiVolume(50), 16); // round(127 * 0.5^3) = round(15.875)
  assert.equal(percentToMidiVolume(25), 2); // round(127 * 0.25^3) = round(1.98...)
  assert.equal(percentToMidiVolume(75), 54); // round(127 * 0.75^3) = round(53.5...)
  // monotonic — never dips as the fader rises
  const values = [0, 10, 25, 40, 50, 60, 75, 90, 100].map(percentToMidiVolume);
  for (let i = 1; i < values.length; i++) assert.ok(values[i] >= values[i - 1]);
  assert.equal(percentToMidiVolume(-20), 0);
  assert.equal(percentToMidiVolume(500), MIDI_VOLUME_MAX);
  assert.equal(percentToMidiVolume(undefined), 0);
});

const TUNE = ["X:1", "T:Test", "M:4/4", "L:1/8", "K:C", '"C" C8 |'].join("\n");

test("injectMixerAudio stamps Bass/Chords accompaniment directives (default programs) when the tune has chords", () => {
  const out = injectMixerAudio(TUNE, { hasChords: true, bassPercent: 70, chordsPercent: 20 });
  const before = out.slice(0, out.indexOf("K:C"));
  assert.match(before, /%%MIDI gchord bzczbzcz/);
  assert.match(before, new RegExp(`%%MIDI bassprog ${DEFAULT_PROGRAM.bass}`));
  assert.match(before, new RegExp(`%%MIDI chordprog ${DEFAULT_PROGRAM.chords}`));
  assert.match(before, new RegExp(`%%MIDI bassvol ${percentToMidiVolume(70)}`));
  assert.match(before, new RegExp(`%%MIDI chordvol ${percentToMidiVolume(20)}`));
});

test("injectMixerAudio uses custom Bass/Chords programs when given one", () => {
  const out = injectMixerAudio(TUNE, {
    hasChords: true, bassPercent: 0, bassProgram: 33, chordsPercent: 0, chordsProgram: 0,
  });
  assert.match(out, /%%MIDI bassprog 33/);
  assert.match(out, /%%MIDI chordprog 0/);
});

test("injectMixerAudio omits accompaniment directives entirely when the tune has no chords", () => {
  const out = injectMixerAudio(TUNE, { hasChords: false, bassPercent: 70, chordsPercent: 20 });
  assert.equal(out, TUNE);
});

test("injectMixerAudio is a no-op when there's no K: line", () => {
  const abc = "X:1\nT:Test\n";
  assert.equal(injectMixerAudio(abc, { hasChords: true, bassPercent: 50, chordsPercent: 50 }), abc);
});

test("computeVoicesOff without comping: only melody can be muted, as a full mute", () => {
  assert.equal(computeVoicesOff({ compingActive: false, melodyMuted: false, compingMuted: false }), undefined);
  assert.equal(computeVoicesOff({ compingActive: false, melodyMuted: true, compingMuted: false }), true);
  // compingMuted is meaningless without a comping voice at all
  assert.equal(computeVoicesOff({ compingActive: false, melodyMuted: false, compingMuted: true }), undefined);
});

test("computeVoicesOff with comping: melody and comping mute independently", () => {
  assert.equal(computeVoicesOff({ compingActive: true, melodyMuted: false, compingMuted: false }), undefined);
  assert.deepEqual(computeVoicesOff({ compingActive: true, melodyMuted: true, compingMuted: false }), [0]);
  assert.deepEqual(computeVoicesOff({ compingActive: true, melodyMuted: false, compingMuted: true }), [1]);
  assert.deepEqual(computeVoicesOff({ compingActive: true, melodyMuted: true, compingMuted: true }), [0, 1]);
});

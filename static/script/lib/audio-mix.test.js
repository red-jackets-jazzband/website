import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MIDI_VOLUME_MAX, percentToMidiVolume, injectVoiceVolumes, computeVoicesOff,
} from "./audio-mix.js";

test("percentToMidiVolume scales 0-100 to 0-127 and clamps out-of-range input", () => {
  assert.equal(percentToMidiVolume(0), 0);
  assert.equal(percentToMidiVolume(100), MIDI_VOLUME_MAX);
  assert.equal(percentToMidiVolume(50), 64); // round(63.5)
  assert.equal(percentToMidiVolume(-20), 0);
  assert.equal(percentToMidiVolume(500), MIDI_VOLUME_MAX);
  assert.equal(percentToMidiVolume(undefined), 0);
});

test("injectVoiceVolumes (no comping) stamps one %%MIDI vol line before K:", () => {
  const abc = ["X:1", "T:Test", "M:4/4", "L:1/8", "K:C", '"C" C8 |'].join("\n");
  const out = injectVoiceVolumes(abc, { compingActive: false, melodyPercent: 50 });
  const lines = out.split("\n");
  assert.equal(lines[lines.indexOf("K:C") - 1], "%%MIDI vol 64");
  // nothing else in the tune moved
  assert.ok(out.includes('"C" C8 |'));
});

test("injectVoiceVolumes (no comping) is a no-op when there's no K: line", () => {
  const abc = "X:1\nT:Test\n";
  assert.equal(injectVoiceVolumes(abc, { compingActive: false, melodyPercent: 50 }), abc);
});

test("injectVoiceVolumes (comping) stamps each voice's line after its own body marker", () => {
  const abc = [
    "X:1", "T:Test", "L:1/8", "%%staves [1 2]", "V:1", 'V:2 name="R\\n3\\n5"', "K:C",
    "V:1", '"C" C8 |', "V:2", "[CEG]8 |",
  ].join("\n");
  const out = injectVoiceVolumes(abc, { compingActive: true, melodyPercent: 100, backingPercent: 25 });

  // The header's own "V:1\nV:2 name=..." declaration line is untouched —
  // only the body markers further down got a line spliced after them.
  assert.match(out, /%%staves \[1 2\]\nV:1\nV:2 name="R\\n3\\n5"\nK:C/);
  assert.match(out, /\nV:1\n%%MIDI vol 127\n"C" C8 \|/);
  assert.match(out, /\nV:2\n%%MIDI vol 32\n\[CEG\]8 \|/);
});

// A direct integration check against the real buildCompingTune output lives
// in comping.test.js instead of here: comping.js is excluded from
// tsconfig.lib.json's checkJs pass (see CLAUDE.md), and importing it from an
// otherwise-checked file like this one would drag its known inference gaps
// back into the type-checked set.

test("computeVoicesOff without comping: only melody can be muted, as a full mute", () => {
  assert.equal(computeVoicesOff({ compingActive: false, melodyMuted: false, backingMuted: false }), undefined);
  assert.equal(computeVoicesOff({ compingActive: false, melodyMuted: true, backingMuted: false }), true);
  // backingMuted is meaningless without a backing voice at all
  assert.equal(computeVoicesOff({ compingActive: false, melodyMuted: false, backingMuted: true }), undefined);
});

test("computeVoicesOff with comping: melody and backing mute independently", () => {
  assert.equal(computeVoicesOff({ compingActive: true, melodyMuted: false, backingMuted: false }), undefined);
  assert.deepEqual(computeVoicesOff({ compingActive: true, melodyMuted: true, backingMuted: false }), [0]);
  assert.deepEqual(computeVoicesOff({ compingActive: true, melodyMuted: false, backingMuted: true }), [1]);
  assert.deepEqual(computeVoicesOff({ compingActive: true, melodyMuted: true, backingMuted: true }), [0, 1]);
});

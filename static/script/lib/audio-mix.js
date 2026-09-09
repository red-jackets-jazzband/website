// Pure helpers for the sheet's Mixer panel (songs/mixer.js): turning a 0-100
// fader percentage into ABCjs/abc2midi terms, and deciding which ABCjs voices
// a mute toggle should exclude from the audio buffer entirely.
//
// There is no live per-voice gain node in ABCjs's synth — SynthController
// mixes every voice down into one rendered AudioBuffer per setTune(), so a
// volume *change* has to be baked into the ABC text before it's parsed
// (injectVoiceVolumes) rather than applied after the fact. Mute stays the
// existing, separate voicesOff mechanism (computeVoicesOff): it fully
// excludes a voice from that buffer, independent of the fader's own level.

// The MIDI channel-volume range abc2midi's `%%MIDI vol` directive accepts.
export const MIDI_VOLUME_MAX = 127;

// Map a 0-100 mixer percentage to the 0-127 MIDI channel volume `%%MIDI vol`
// expects, clamping either end so an out-of-range caller value can't emit a
// directive abc2midi would choke on.
export function percentToMidiVolume(percent) {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  return Math.round((clamped / 100) * MIDI_VOLUME_MAX);
}

// Splice `line` in as its own line right before the tune's K: field (the
// header's closing field in every .abc file here), found by a plain scan
// rather than a regex over arbitrary text.
function insertBeforeKeyLine(text, line) {
  const lines = text.split("\n");
  const kIndex = lines.findIndex((l) => l.startsWith("K:"));
  if (kIndex === -1) return text;
  lines.splice(kIndex, 0, line);
  return lines.join("\n");
}

function spliceAfter(text, index, insertion) {
  return text.slice(0, index) + insertion + text.slice(index);
}

/*
  Stamp the melody's (and, once comping is on, the backing voice's) MIDI
  channel volume into the ABC text about to be handed to ABCJS.renderAbc, so
  whatever gets rendered is exactly what plays — there's no separate
  "audio-only" reparse, which would desync the playback cursor from the
  visible notation (ABCjs ties cursor highlighting to the actual rendered
  visualObj, not a freshly parsed twin of it).

  Without comping there's a single implicit voice, so one %%MIDI vol line in
  the tune header (right before K:, where abc2midi expects tune-wide MIDI
  defaults) sets it. With comping on, buildCompingTune's own contract (see
  its doc comment in lib/comping.js) fixes the body's shape as
  "...\nV:1\n<melody>\nV:2\n<comping>\n" — melody voice 1, comping voice 2 —
  so each gets its own line right after its body marker. lastIndexOf targets
  that body marker rather than the *voice declaration* line the same header
  carries a little earlier (%%staves [1 2]\nV:1\nV:2 name="R\n3\n5"...), which
  repeats the same bare "V:1" text once before the bodies start.
*/
export function injectVoiceVolumes(abcText, { compingActive, melodyPercent, backingPercent = 0 }) {
  const melodyVol = percentToMidiVolume(melodyPercent);
  if (!compingActive) {
    return insertBeforeKeyLine(abcText, `%%MIDI vol ${melodyVol}`);
  }

  const backingVol = percentToMidiVolume(backingPercent);
  const v1 = abcText.lastIndexOf("\nV:1\n");
  const v2 = abcText.lastIndexOf("\nV:2\n");
  if (v1 === -1 || v2 === -1) return abcText;

  // Insert at the later marker first so the earlier one's index stays valid.
  const withBacking = spliceAfter(abcText, v2 + "\nV:2\n".length, `%%MIDI vol ${backingVol}\n`);
  return spliceAfter(withBacking, v1 + "\nV:1\n".length, `%%MIDI vol ${melodyVol}\n`);
}

/*
  Which ABCjs voice indices to exclude from the audio buffer entirely, or
  `true` to render silence outright when there's only one voice to mute.
  Melody is always voice 0; comping (when active) is voice 1 (see
  lib/comping.js's buildCompingTune doc comment). Returns undefined when
  nothing should be muted, so callers can leave `voicesOff` off the synth
  params object entirely rather than pass an empty array.
*/
export function computeVoicesOff({ compingActive, melodyMuted, backingMuted }) {
  if (!compingActive) {
    return melodyMuted ? true : undefined;
  }
  const off = [];
  if (melodyMuted) off.push(0);
  if (backingMuted) off.push(1);
  return off.length ? off : undefined;
}

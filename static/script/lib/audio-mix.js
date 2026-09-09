// Pure helpers for the sheet's Mixer panel (songs/mixer.js).
//
// Only Bass and Chords — ABCjs's own auto-generated accompaniment (abc2midi's
// classic gchord engine) — get real continuous volume + voice control here,
// via injectMixerAudio stamping %%MIDI gchord/bassprog/chordprog/bassvol/
// chordvol into the ABC text before ABCjs parses it (there's no live gain
// node in ABCjs's synth, so a *change* has to be baked into the text). Those
// four directives are confirmed working end to end: they're read by the live
// SynthController itself, not just ABCjs's separate "export as .mid file"
// path.
//
// Melody and Comping (regular ABC voices, not gchord-generated) do NOT get
// the same treatment, even though it looks symmetrical on paper: a generic
// %%MIDI vol / %%MIDI program on an ordinary voice was tried first and
// empirically does nothing audible — it appears to only feed that separate
// export path, never the live web-audio buffer SynthController actually
// plays. So Melody/Comping only get real MUTE, through computeVoicesOff
// below (SynthController's own `voicesOff` option — its source checks it
// directly against each voice's track index, unambiguous, no text-directive
// guessing involved). Their volume faders and Voice pickers are disabled in
// the UI (songs/mixer.js / content/songs.md) rather than pretending to work.
// Fixing that for real means either finding a genuine per-voice live-gain
// hook this file doesn't know about yet, or priming a separate
// SynthController per channel through its own Web Audio GainNode and mixing
// them by hand — a real audio-engine change that needs a real browser to
// verify, not more guessing from source.

// The MIDI channel-volume range abc2midi's `bassvol`/`chordvol` directives
// accept.
export const MIDI_VOLUME_MAX = 127;

// Bass/Chords' GM program (see lib/gm-voices.js) when their Voice picker is
// left on "Default" — a reasonable jazz-combo guess, not yet checked by ear
// in a real browser.
export const DEFAULT_PROGRAM = { bass: 32, chords: 26 };

// ABCjs's own "jazz" example pattern (https://examples.abcjs.net/accompaniment).
const GCHORD_PATTERN = "bzczbzcz";

// A fader's usable travel should spend most of itself on the quiet-to-
// comfortable range, not spread evenly up to "as loud as it goes" — real
// mixing console faders are tapered the same way. Cubing the 0-1 fraction
// before scaling to MIDI's 0-127 pulls the low half of the slider's travel
// down to a small fraction of the range, leaving far more physical travel
// (and finer control) for quiet/background levels than a straight linear
// mapping would; the top end still reaches 127 at 100%.
const VOLUME_CURVE_EXPONENT = 3;

// Map a 0-100 mixer percentage to the 0-127 MIDI volume value (see
// VOLUME_CURVE_EXPONENT), clamping either end so an out-of-range caller
// value can't emit a directive abc2midi would choke on.
export function percentToMidiVolume(percent) {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  return Math.round(MIDI_VOLUME_MAX * (clamped / 100) ** VOLUME_CURVE_EXPONENT);
}

// Splice `lines` in, each its own line, right before the tune's K: field
// (the header's closing field in every .abc file here), found by a plain
// scan rather than a regex over arbitrary text.
function insertLinesBeforeKeyLine(text, lines) {
  if (!lines.length) return text;
  const split = text.split("\n");
  const kIndex = split.findIndex((l) => l.startsWith("K:"));
  if (kIndex === -1) return text;
  split.splice(kIndex, 0, ...lines);
  return split.join("\n");
}

// The Bass/Chords header block: only worth emitting when the tune actually
// carries chord symbols for ABCjs's gchord engine to read (a tune with none
// would just render an inert directive).
function accompanimentLines(hasChords, {
  bassPercent, chordsPercent, bassProgram, chordsProgram,
}) {
  if (!hasChords) return [];
  return [
    `%%MIDI gchord ${GCHORD_PATTERN}`,
    `%%MIDI bassprog ${bassProgram}`,
    `%%MIDI chordprog ${chordsProgram}`,
    `%%MIDI bassvol ${percentToMidiVolume(bassPercent)}`,
    `%%MIDI chordvol ${percentToMidiVolume(chordsPercent)}`,
  ];
}

// Stamp Bass/Chords' MIDI accompaniment directives into the ABC text about
// to be handed to ABCJS.renderAbc, so whatever gets rendered is exactly what
// plays — there's no separate "audio-only" reparse, which would desync the
// playback cursor from the visible notation (ABCjs ties cursor highlighting
// to the actual rendered visualObj, not a freshly parsed twin of it).
export function injectMixerAudio(abcText, {
  hasChords, bassPercent, bassProgram = DEFAULT_PROGRAM.bass,
  chordsPercent, chordsProgram = DEFAULT_PROGRAM.chords,
}) {
  return insertLinesBeforeKeyLine(
    abcText, accompanimentLines(hasChords, {
      bassPercent, chordsPercent, bassProgram, chordsProgram,
    }),
  );
}

/*
  Which ABCjs voice indices to exclude from the audio buffer entirely, or
  `true` to render silence outright when there's only one voice to mute.
  Melody is always voice 0; comping (when active) is voice 1 (see
  lib/comping.js's buildCompingTune doc comment). Returns undefined when
  nothing should be muted, so callers can leave `voicesOff` off the synth
  params object entirely rather than pass an empty array.
*/
export function computeVoicesOff({ compingActive, melodyMuted, compingMuted }) {
  if (!compingActive) {
    return melodyMuted ? true : undefined;
  }
  const off = [];
  if (melodyMuted) off.push(0);
  if (compingMuted) off.push(1);
  return off.length ? off : undefined;
}

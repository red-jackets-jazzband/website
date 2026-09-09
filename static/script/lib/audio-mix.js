// Pure helpers for the sheet's Mixer panel (songs/mixer.js): turning 0-100
// fader percentages into the %%MIDI directives that carry them into ABCjs's
// synth for four channels — Melody, Bass, Chords and Comping.
//
// There is no live per-channel gain node in ABCjs's synth — SynthController
// mixes every voice (and any auto-generated accompaniment) down into one
// rendered AudioBuffer per setTune(), so a volume *change* has to be baked
// into the ABC text before it's parsed (injectMixerAudio), not applied after
// the fact. Mute is not a separate mechanism here: it's just the fader's
// effective percentage forced to 0 by the caller (see mixer.js), so every
// channel goes through the exact same one code path.

// The MIDI channel-volume range abc2midi's `%%MIDI vol`/`bassvol`/`chordvol`
// directives accept.
export const MIDI_VOLUME_MAX = 127;

// ABCjs's own auto-generated bass + chord accompaniment (abc2midi's classic
// gchord engine) is driven entirely by %%MIDI directives read from the ABC
// text — there's no JS-side option for it. It plays from whatever chord
// symbols are already in the tune, independent of this site's own notated
// Comping voice. Pattern is ABCjs's own "jazz" example
// (https://examples.abcjs.net/accompaniment); instruments picked to suit a
// jazz combo — neither has been checked by ear in a real browser yet.
const GCHORD_PATTERN = "bzczbzcz";
const BASS_PROGRAM = 32; // GM Acoustic Bass
const CHORD_PROGRAM = 26; // GM Electric Guitar (jazz)

// Map a 0-100 mixer percentage to the 0-127 MIDI volume value, clamping
// either end so an out-of-range caller value can't emit a directive
// abc2midi would choke on.
export function percentToMidiVolume(percent) {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  return Math.round((clamped / 100) * MIDI_VOLUME_MAX);
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

function spliceAfter(text, index, insertion) {
  return text.slice(0, index) + insertion + text.slice(index);
}

// The Bass/Chords header block: only worth emitting when the tune actually
// carries chord symbols for ABCjs's gchord engine to read (a tune with none
// would just render an inert directive).
function accompanimentLines(hasChords, bassPercent, chordsPercent) {
  if (!hasChords) return [];
  return [
    `%%MIDI gchord ${GCHORD_PATTERN}`,
    `%%MIDI bassprog ${BASS_PROGRAM}`,
    `%%MIDI chordprog ${CHORD_PROGRAM}`,
    `%%MIDI bassvol ${percentToMidiVolume(bassPercent)}`,
    `%%MIDI chordvol ${percentToMidiVolume(chordsPercent)}`,
  ];
}

/*
  Stamp all four channels' MIDI volumes into the ABC text about to be handed
  to ABCJS.renderAbc, so whatever gets rendered is exactly what plays —
  there's no separate "audio-only" reparse, which would desync the playback
  cursor from the visible notation (ABCjs ties cursor highlighting to the
  actual rendered visualObj, not a freshly parsed twin of it).

  Bass/Chords are ABCjs's own auto-accompaniment (see accompanimentLines) —
  tune-wide header directives, independent of comping. Melody (and, once
  comping is on, the comping voice) are per-voice: without comping there's a
  single implicit voice, so one %%MIDI vol line in the header sets it. With
  comping on, buildCompingTune's own contract (see its doc comment in
  lib/comping.js) fixes the body's shape as
  "...\nV:1\n<melody>\nV:2\n<comping>\n" — melody voice 1, comping voice 2 —
  so each gets its own line right after its body marker. lastIndexOf targets
  that body marker rather than the *voice declaration* line the same header
  carries a little earlier (%%staves [1 2]\nV:1\nV:2 name="R\n3\n5"...), which
  repeats the same bare "V:1" text once before the bodies start.
*/
export function injectMixerAudio(abcText, {
  compingActive, hasChords, melodyPercent, compingPercent = 0, bassPercent, chordsPercent,
}) {
  const withAccompaniment = insertLinesBeforeKeyLine(
    abcText, accompanimentLines(hasChords, bassPercent, chordsPercent),
  );
  const melodyVol = percentToMidiVolume(melodyPercent);

  if (!compingActive) {
    return insertLinesBeforeKeyLine(withAccompaniment, [`%%MIDI vol ${melodyVol}`]);
  }

  const compingVol = percentToMidiVolume(compingPercent);
  const v1 = withAccompaniment.lastIndexOf("\nV:1\n");
  const v2 = withAccompaniment.lastIndexOf("\nV:2\n");
  if (v1 === -1 || v2 === -1) return withAccompaniment;

  // Insert at the later marker first so the earlier one's index stays valid.
  const withComping = spliceAfter(withAccompaniment, v2 + "\nV:2\n".length, `%%MIDI vol ${compingVol}\n`);
  return spliceAfter(withComping, v1 + "\nV:1\n".length, `%%MIDI vol ${melodyVol}\n`);
}

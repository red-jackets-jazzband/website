// The instruments a chart can be read as. `value` matches the <option>
// value historically produced by lowercasing/underscoring the label (kept
// stable since it's part of the localStorage schema from Milestone 2
// onward). `offsetSemitones` is the real-time transposition applied on top
// of any manual "song key" transpose the player has dialed in.
// `clef` controls whether a bass clef gets stamped onto the K: line.
export const INSTRUMENTS = [
  { value: "concert_pitch", label: "Concert pitch", offsetSemitones: 0, clef: "treble" },
  { value: "concert_+_roman", label: "Concert + Roman", offsetSemitones: 0, clef: "treble" },
  { value: "alto_saxophone", label: "Alto Saxophone", offsetSemitones: 9, clef: "treble" },
  { value: "clarinet_bb", label: "Clarinet Bb", offsetSemitones: 2, clef: "treble" },
  { value: "sousaphone", label: "Sousaphone", offsetSemitones: 2, clef: "bass" },
  { value: "tenor_saxophone", label: "Tenor Saxophone", offsetSemitones: 2, clef: "treble" },
  { value: "trombone", label: "Trombone", offsetSemitones: 0, clef: "bass" },
  { value: "trumpet", label: "Trumpet", offsetSemitones: 2, clef: "treble" },
];

export function findInstrument(instrumentValue) {
  return INSTRUMENTS.find((instrument) => instrument.value === instrumentValue);
}

export function offsetForInstrument(instrumentValue) {
  const entry = findInstrument(instrumentValue);
  return entry ? entry.offsetSemitones : 0;
}

// Stamps `clef=bass middle=D` onto the ABC K: line for bass-clef instruments,
// or strips it for everything else. Only touches the K: line itself, so it's
// a no-op for files that already define their own per-voice clef (see
// hasInstrumentVoices in render_abc.js, which bypasses this entirely).
export function changeClefForInstrument(instrumentValue, text) {
  const entry = findInstrument(instrumentValue);
  const clef = entry ? entry.clef : "treble";
  if (clef === "bass") {
    return text.replace(/(K:\s*\w+)/g, "$1 clef=bass middle=D");
  }
  return text.replace(/clef=bass middle=D/g, "");
}

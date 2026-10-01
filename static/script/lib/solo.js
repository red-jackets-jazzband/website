import {
  appendBarVoice, distribute, pcChromaVal, rebeamBar, resolveChordNames, respellBar,
} from "./comping.js";
import { generateSolo } from "./solo-ga.js";

/*
  Solo voice for the sheet: the same shape as lib/comping.js's Comping voice
  (a chord scheme in, one extra staff appended as voice N+1, bar for bar with
  the melody) but the notes come from lib/solo-ga.js's genetic algorithm
  instead of a rhythm pattern. Everything shared with comping goes through
  comping.js: the chord-name resolution (N.C. / "%" / slash chords), the key
  scale and signature, the bar fragments' beaming and accidentals, and
  appendBarVoice's header / pickup / voice-id handling.
*/

// The Solo dropdown's entries (value = a lib/solo-ga.js STYLES key).
export const SOLO_STYLES = [
  { value: "trumpet", label: "Trumpet" },
  { value: "armstrong", label: "Armstrong" },
  { value: "clarinet", label: "Clarinet" },
  { value: "trombone", label: "Trombone (tailgate)" },
  { value: "solo", label: "Free solo" },
];

// General MIDI instrument for each style (the Mixer's Solo voice default).
export const SOLO_PROGRAMS = {
  trumpet: 56, armstrong: 56, clarinet: 71, trombone: 57, solo: 56,
};

const SLOTS_PER_BAR = 8;
const SLOTS_PER_BEAT = 2;
// Plain ABC lengths in eighth slots; anything longer is split with a tie.
const LENGTHS = [8, 6, 4, 3, 2, 1];

// A stable seed per chart + style, so the same song always gets the same take
// (and a Key / Tempo / Mixer re-render doesn't reshuffle it).
function seedOf(names, style) {
  let hash = 5381;
  for (const ch of `${style}|${names}`) {
    hash = ((hash * 33) ^ ch.codePointAt(0)) >>> 0;
  }
  return hash;
}

// The GA's progression: one {chord, beats} per chord slot, a bar's 8 eighth
// slots shared out the way comping shares them. A bar that is all N.C. is a
// band break the soloist plays through.
function toProgression(names) {
  const progression = [];
  const breaks = [];
  names.forEach((row, bar) => {
    if (row.every((name) => name === null)) breaks.push(bar);
    distribute(SLOTS_PER_BAR, row.length).forEach((slots, i) => {
      progression.push({ chord: row[i], beats: slots / SLOTS_PER_BEAT });
    });
  });
  return { progression, breaks };
}

// MIDI note -> ABC note, spelled from the key's own scale where it can be and
// with flats elsewhere (sharps only in a sharp key).
function createSpeller(keyScale) {
  const byChroma = new Map(keyScale.map((pc) => [pcChromaVal(pc), pc]));
  const sharpKey = keyScale.filter((pc) => pc.includes("#")).length > 0;
  const chromatic = sharpKey
    ? ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    : ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  return (midi) => {
    const chroma = ((midi % 12) + 12) % 12;
    const pc = byChroma.get(chroma) || chromatic[chroma];
    const base = Tonal.Note.midi(`${pc}4`);
    const octave = 4 + Math.round((midi - base) / 12);
    return Tonal.AbcNotation.scientificToAbcNotation(`${pc}${octave}`);
  };
}

// One note of `slots` eighths as ABC tokens, tied when it has to be split.
function noteTokens(abcNote, slots, tiedOut) {
  const tokens = [];
  let left = slots;
  while (left > 0) {
    const part = LENGTHS.find((n) => n <= left);
    left -= part;
    tokens.push(`${abcNote}${part}${left > 0 || tiedOut ? "-" : ""}`);
  }
  return tokens;
}

function restTokens(slots) {
  return slots > 0 ? [`z${slots}`] : [];
}

// GA notes (beats, straight grid) -> one bar fragment per bar, in eighth
// slots. A note running over a barline is cut and tied.
function barFragments(notes, bars, spell) {
  const cells = Array.from({ length: bars }, () => []);
  for (const note of notes) {
    const start = Math.round(note.start * SLOTS_PER_BEAT);
    const end = Math.round((note.start + note.duration) * SLOTS_PER_BEAT);
    const abcNote = spell(note.midi);
    for (let bar = Math.floor(start / SLOTS_PER_BAR); bar * SLOTS_PER_BAR < end && bar < bars; bar++) {
      const from = Math.max(start, bar * SLOTS_PER_BAR) - bar * SLOTS_PER_BAR;
      const to = Math.min(end, (bar + 1) * SLOTS_PER_BAR) - bar * SLOTS_PER_BAR;
      cells[bar].push({ from, to, abcNote, tiedOut: end > (bar + 1) * SLOTS_PER_BAR });
    }
  }
  return cells.map((bar) => {
    const tokens = [];
    let pos = 0;
    for (const cell of bar) {
      tokens.push(...restTokens(cell.from - pos), ...noteTokens(cell.abcNote, cell.to - cell.from, cell.tiedOut));
      pos = cell.to;
    }
    tokens.push(...restTokens(SLOTS_PER_BAR - pos));
    return tokens.join(" ");
  });
}

// The last take, kept so a re-render with nothing changed (a Key / Tempo /
// Mixer move) doesn't re-run the GA.
let lastTake = { key: "", notes: [] };

function solveSolo(names, style, gaOptions) {
  const key = `${style}|${names.map((row) => row.join(",")).join(";")}`;
  if (lastTake.key === key) return lastTake.notes;
  const { progression, breaks } = toProgression(names);
  const { notes } = generateSolo(progression, {
    style, breaks, seed: seedOf(key, style), ...gaOptions,
  });
  lastTake = { key, notes };
  return notes;
}

/*
  Add a Solo staff for `style` (a SOLO_STYLES value) to the tune. `text`, `chords`
  and `song` are as for buildCompingTune; `text` may already carry the Comping
  voice. Returns { abc, notes } or null when a solo can't apply (no chords, no
  such style, an unsupported meter, no K: line). `gaOptions` overrides the GA's
  own options (the tests use a small population).
*/
export function buildSoloTune(text, chords, song, style, gaOptions = {}) {
  if (!chords || chords.length === 0 || !SOLO_STYLES.some((s) => s.value === style)) return null;
  const names = resolveChordNames(chords);
  const notes = solveSolo(names, style, gaOptions);
  const abc = appendBarVoice(text, song, ({ keyScale, keySig, lnum, lden }) => (
    barFragments(notes, chords.length, createSpeller(keyScale))
      .map((fragment) => rebeamBar(respellBar(fragment, keySig), lnum, lden))
  ), { name: "Solo", titleSuffix: "" });
  return abc === null ? null : { abc, notes };
}

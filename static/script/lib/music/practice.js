import {
  appendBarVoice, distribute, endsTied, pcChromaVal, rebeamBar, resolveChordNames, respellBar,
} from "./comping.js";
import { parseChord } from "./solo-ga.js";
import { barFragments, createSpeller } from "./solo.js";
import { tl } from "../core/i18n.js";

/*
  Practice material over a tune's changes: not a solo, but an exercise staff
  to play along with — the same shape as lib/music/solo.js's Solo voice (a
  chord scheme in, one more staff appended bar for bar through comping.js's
  appendBarVoice, and solo.js's own bar fragments and speller), but the notes
  come from fixed rules instead of a genetic algorithm, so they're instant
  and the same every time.

  An exercise is two independent choices, the way a method book drills them:
  - a RHYTHM: one-bar rhythm cells (straight eighths, offbeats, a Charleston,
    a dotted-quarter 3-over-4, a note tied over the beat, a last "and"
    anticipating the next bar's chord), each held for CELL_BARS bars so it
    can settle before the next one comes round;
  - a PITCH rule for every onset in it: chord-tone runs, scale runs, guide
    tones (3rds and 7ths), enclosures into each new chord, or one note per
    chord (rhythm alone).
  A note that crosses a bar line belongs to the chord it lands on: that is
  what an anticipation is, the new chord played an eighth early.
*/

// The Practice dropdown's entries (value = an EXERCISES key).
export const PRACTICE_EXERCISES = [
  { value: "arpeggios", label: tl("practice_arpeggios", "Chord-tone runs") },
  { value: "scales", label: tl("practice_scales", "Scale runs") },
  { value: "guide", label: tl("practice_guide", "Guide tones") },
  { value: "enclosures", label: tl("practice_enclosures", "Enclosures") },
  { value: "rhythm", label: tl("practice_rhythm", "Rhythm on one note") },
];

// General MIDI trumpet: the Mixer's Practice voice default.
export const PRACTICE_PROGRAM = 56;

const SLOTS_PER_BAR = 8;
const SLOTS_PER_BEAT = 2;
const CELL_BARS = 2;

/*
  One bar in eighths: "x" a note starts, "-" it holds, "." a rest; a trailing
  ">" ties the bar's last note over the bar line (the next bar's first eighth
  becomes its continuation).
*/
const RUN_CELLS = [
  "xxxxxxxx", // straight eighths: the run itself
  ".x.x.x.x", // every offbeat
  "xx-xx-xx", // "and" of 1 and of 3 tied over the beat
  "x--x....", // Charleston
  "xxxxxx.x>", // run, breath, anticipate the next downbeat
  "x--x--x-", // dotted quarters: three against four
  ".xxx.xxx", // start on the "and"
  "xx.xx.xx>", // pairs, the last one anticipated
];
// Fewer, longer notes for a line that moves once or twice a chord.
const LONG_CELLS = [
  "x---x---",
  "x---...x>",
  ".x--x---",
  "x--x---.",
];

// Range of the line (concert MIDI, C4 to G5) and where it starts.
const LOW = 60;
const HIGH = 79;
const START = 67;

const mod12 = (x) => ((x % 12) + 12) % 12;

function pitchesOf(chord, intervals) {
  const set = new Set(intervals);
  const out = [];
  for (let m = LOW; m <= HIGH; m++) {
    if (set.has(mod12(m - chord.root))) out.push(m);
  }
  return out;
}

const chordTones = (chord) => pitchesOf(chord, [...chord.tones]);
// The chord's scale without the GA's blue notes — a clean scale to run, so
// a major chord gets its major seventh back (the GA leaves it out).
function scaleTones(chord) {
  const scale = chord.scale.filter((i) => !chord.blue.has(i));
  return pitchesOf(chord, chord.type === "maj" ? [...scale, 11] : scale);
}
// The 3rd and the 7th (or 6th): every chord tone but the root and the fifth.
const guideTones = (chord) => pitchesOf(chord, [...chord.tones].filter((i) => i !== 0 && i !== 7));

function nearest(candidates, ref) {
  let best = candidates[0];
  for (const m of candidates) {
    if (Math.abs(m - ref) < Math.abs(best - ref)) best = m;
  }
  return best;
}

/*
  The rhythm as one string of slots over the whole chart: each bar's cell (a
  break bar, all N.C., is silent and takes no anticipation), with a ">"
  carried into the next bar's first slot.
*/
export function rhythmSlots(bars, breaks, cells) {
  let out = "";
  let tieIn = false;
  for (let bar = 0; bar < bars; bar++) {
    if (breaks.has(bar)) {
      out += ".".repeat(SLOTS_PER_BAR);
      tieIn = false;
    } else {
      const cell = cells[Math.floor(bar / CELL_BARS) % cells.length];
      let body = cell.slice(0, SLOTS_PER_BAR);
      if (tieIn && body[0] === "x") body = "-" + body.slice(1);
      out += body;
      tieIn = cell.endsWith(">") && !breaks.has(bar + 1) && bar + 1 < bars;
    }
  }
  return out;
}

// Slots -> [{ slot, len }]: a "-" holds the note before it (a "-" after a
// rest is a rest).
function onsetsOf(slots) {
  const notes = [];
  let sounding = null;
  for (const [s, mark] of [...slots].entries()) {
    if (mark === "x") {
      sounding = { slot: s, len: 1 };
      notes.push(sounding);
    } else if (mark === "-" && sounding !== null) {
      sounding.len += 1;
    } else {
      sounding = null;
    }
  }
  return notes;
}

// Per slot: { chord, id } (id counts chord changes), or null in a break.
function chordTimeline(names) {
  const timeline = [];
  let id = 0;
  for (const row of names) {
    distribute(SLOTS_PER_BAR, row.length).forEach((slots, i) => {
      const chord = row[i] === null ? null : parseChord(row[i]);
      id += 1;
      for (let k = 0; k < slots; k++) timeline.push(chord === null ? null : { chord, id });
    });
  }
  return timeline;
}

// The chord a note plays over: the one at its start, or — when it runs over
// a bar line — the one it lands on.
function chordFor(timeline, note) {
  const end = note.slot + note.len - 1;
  const crossing = Math.floor(end / SLOTS_PER_BAR) > Math.floor(note.slot / SLOTS_PER_BAR);
  return timeline[crossing ? Math.floor(end / SLOTS_PER_BAR) * SLOTS_PER_BAR : note.slot] || timeline[note.slot];
}

// Walk `pool` (sorted) from `prev` one step in `dir`, turning round at either end.
function stepThrough(pool, prev, walk) {
  const i = pool.indexOf(prev);
  if (i === -1) return nearest(pool, prev);
  let next = i + walk.dir;
  if (next < 0 || next >= pool.length) {
    walk.dir = -walk.dir;
    next = i + walk.dir;
  }
  return pool[Math.max(0, Math.min(pool.length - 1, next))];
}

/*
  A run: each chord starts on the chord tone nearest the last note (so the
  line voice-leads through the changes) and then walks `pool` — up over one
  chord, down over the next.
*/
function runPitches(notes, pool) {
  // Flipped at the first chord, so the line opens going up.
  const walk = { dir: -1 };
  let prev = START;
  let segment = null;
  return notes.map((note) => {
    if (note.at.id !== segment) {
      segment = note.at.id;
      walk.dir = -walk.dir;
      prev = nearest(chordTones(note.at.chord), prev);
    } else {
      prev = stepThrough(pool(note.at.chord), prev, walk);
    }
    return prev;
  });
}

// Guide tones: the 3rd or 7th nearest the last one, moving to the other
// guide tone when the chord stays.
function guidePitches(notes) {
  let prev = START;
  let segment = null;
  return notes.map((note) => {
    const pool = guideTones(note.at.chord);
    if (note.at.id === segment) {
      const other = pool.filter((m) => mod12(m - prev) !== 0);
      prev = nearest(other.length > 0 ? other : pool, prev);
    } else {
      segment = note.at.id;
      prev = nearest(pool, prev);
    }
    return prev;
  });
}

// One note per chord: rhythm alone, on the chord tone nearest the last one.
function rhythmPitches(notes) {
  let prev = START;
  let segment = null;
  return notes.map((note) => {
    if (note.at.id !== segment) {
      segment = note.at.id;
      prev = nearest(guideTones(note.at.chord), prev);
    }
    return prev;
  });
}

/*
  Enclosures: every chord's first note is a target chord tone (the 3rd or
  7th nearest the previous target); the two notes before it, when the rhythm
  has them, enclose it — the scale step above, then a half step below. Other
  notes run over the chord's tones from its own target.
*/
function enclosurePitches(notes) {
  const targets = new Map();
  let prev = START;
  notes.forEach((note, i) => {
    if (i === 0 || notes[i - 1].at.id !== note.at.id) {
      prev = nearest(guideTones(note.at.chord), prev);
      targets.set(i, prev);
    }
  });
  const runs = runPitches(notes, chordTones);
  return notes.map((note, i) => {
    if (targets.has(i)) return targets.get(i);
    if (targets.has(i + 1)) return targets.get(i + 1) - 1;
    if (targets.has(i + 2)) {
      const target = targets.get(i + 2);
      const above = scaleTones(notes[i + 2].at.chord).find((m) => m > target);
      return above === undefined ? target + 2 : above;
    }
    return runs[i];
  });
}

const EXERCISES = {
  arpeggios: { cells: RUN_CELLS, pitches: (notes) => runPitches(notes, chordTones) },
  scales: { cells: RUN_CELLS, pitches: (notes) => runPitches(notes, scaleTones) },
  guide: { cells: LONG_CELLS, pitches: guidePitches },
  enclosures: { cells: RUN_CELLS, pitches: enclosurePitches },
  rhythm: { cells: RUN_CELLS, pitches: rhythmPitches },
};

/*
  The exercise's notes over `names` (resolveChordNames' per-bar chord rows),
  as [{ start, duration, midi, leadsUp }] in beats from the first chord bar — the
  shape solo.js's barFragments draws. Empty for an unknown exercise.
*/
export function practiceNotes(names, exercise) {
  const spec = EXERCISES[exercise];
  if (!spec) return [];
  const breaks = new Set();
  names.forEach((row, bar) => {
    if (row.every((name) => name === null)) breaks.add(bar);
  });
  const timeline = chordTimeline(names);
  const notes = onsetsOf(rhythmSlots(names.length, breaks, spec.cells))
    .map((note) => ({ ...note, at: chordFor(timeline, note) }))
    .filter((note) => note.at);
  const midis = spec.pitches(notes);
  return notes.map((note, i) => ({
    start: note.slot / SLOTS_PER_BEAT,
    duration: note.len / SLOTS_PER_BEAT,
    midi: midis[i],
    leadsUp: midis[i + 1] === midis[i] + 1,
  }));
}

/*
  solo.js's speller (the key's own letters, flats elsewhere), except that a
  note outside the key which rises a half step into the next one is a
  leading note and spelled sharp: G#-A, not Ab-A.
*/
function createPracticeSpeller(keyScale) {
  const inKey = createSpeller(keyScale);
  const sharp = createSpeller(["F#"]);
  const keyChromas = new Set(keyScale.map(pcChromaVal));
  return (midi, note) => (note && note.leadsUp && !keyChromas.has(mod12(midi)) ? sharp(midi) : inKey(midi));
}

/*
  Add a Practice staff for `exercise` (a PRACTICE_EXERCISES value) to the
  tune. `text`, `chords` and `song` are as for buildSoloTune; `text` may
  already carry the Comping / Solo voices. Returns { abc, notes }, or null
  when it can't apply (no chords, no such exercise, an unsupported meter, no
  K: line).
*/
export function buildPracticeTune(text, chords, song, exercise) {
  if (!chords || chords.length === 0 || !EXERCISES[exercise]) return null;
  const notes = practiceNotes(resolveChordNames(chords), exercise);
  const abc = appendBarVoice(text, song, ({ keyScale, keySig, lnum, lden }) => (
    barFragments(notes, chords.length, createPracticeSpeller(keyScale))
      .map((fragment, i, all) => rebeamBar(respellBar(fragment, keySig, i > 0 && endsTied(all[i - 1])), lnum, lden))
  ), { name: "Practice", titleSuffix: "" });
  return abc === null ? null : { abc, notes };
}

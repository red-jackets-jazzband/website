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
    can settle before the next one comes round — or one of them kept the
    whole way through (the Rhythm dropdown); every few bars (the Breaths
    dropdown, four by default) the phrase ends on a breath, a half note
    landing on the chord and then a rest;
  - a PITCH rule for every onset in it: chord-tone runs, scale runs, guide
    tones (3rds and 7ths), enclosures into each new chord, or one note per
    chord (rhythm alone); a run either voice-leads and turns round every
    chord, or has the same shape over every chord (the Runs dropdown).
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
  The Rhythm dropdown's patterns. `cell` is one bar in eighths: "x" a note
  starts, "-" it holds, "." a rest; a trailing ">" ties the bar's last note
  over the bar line (the next bar's first eighth becomes its continuation).
  "Varied" cycles through the exercise's own set (`run` ones for the runs,
  `long` ones for guide tones); picking a pattern plays it all the way.
*/
export const PRACTICE_RHYTHMS = [
  { value: "eighths", cell: "xxxxxxxx", run: true, label: tl("practice_rhythm_eighths", "Straight eighths") },
  { value: "offbeats", cell: ".x.x.x.x", run: true, label: tl("practice_rhythm_offbeats", "Offbeats") },
  { value: "tied", cell: "xx-xx-xx", run: true, label: tl("practice_rhythm_tied", "Tied over the beat") },
  { value: "charleston", cell: "x--x....", run: true, label: tl("practice_rhythm_charleston", "Charleston") },
  { value: "anticipate", cell: "xxxxxx.x>", run: true, label: tl("practice_rhythm_anticipate", "Anticipate the next bar") },
  { value: "threefour", cell: "x--x--x-", run: true, label: tl("practice_rhythm_threefour", "Three against four") },
  { value: "and", cell: ".xxx.xxx", run: true, label: tl("practice_rhythm_and", "Start on the \"and\"") },
  { value: "pairs", cell: "xx.xx.xx>", run: true, label: tl("practice_rhythm_pairs", "Pairs, last one anticipated") },
  { value: "halves", cell: "x---x---", long: true, label: tl("practice_rhythm_halves", "Half notes") },
  { value: "halfanticipate", cell: "x---...x>", long: true, label: tl("practice_rhythm_halfanticipate", "Half note, anticipate") },
  { value: "late", cell: ".x--x---", long: true, label: tl("practice_rhythm_late", "Late start") },
  { value: "longcharleston", cell: "x--x---.", long: true, label: tl("practice_rhythm_longcharleston", "Long Charleston") },
];
const RUN_CELLS = PRACTICE_RHYTHMS.filter((r) => r.run).map((r) => r.cell);
const LONG_CELLS = PRACTICE_RHYTHMS.filter((r) => r.long).map((r) => r.cell);

/*
  The Runs dropdown: the shape of a run over each chord (chord-tone runs,
  scale runs, and the notes between an enclosure's targets). "alternate"
  voice-leads from the last note and turns round every chord; the others
  give every chord the same shape, starting on its root.
*/
export const PRACTICE_RUNS = [
  { value: "alternate", label: tl("practice_runs_alternate", "Alternate up and down") },
  { value: "up", label: tl("practice_runs_up", "Always up") },
  { value: "down", label: tl("practice_runs_down", "Always down") },
  { value: "updown", label: tl("practice_runs_updown", "Up, then down") },
];
// The Breaths dropdown: a breath (BREATH_CELL) every so many bars, or none.
export const PRACTICE_BREATHS = [
  { value: "4", label: tl("practice_breath_4", "Breathe every 4 bars") },
  { value: "2", label: tl("practice_breath_2", "Breathe every 2 bars") },
  { value: "8", label: tl("practice_breath_8", "Breathe every 8 bars") },
  { value: "off", label: tl("practice_breath_off", "No breaths") },
];

// Which exercises the Runs choice changes.
export const RUN_EXERCISES = new Set(["arpeggios", "scales", "enclosures"]);

// Range of the line (concert MIDI, C4 to G5) and where it starts.
const LOW = 60;
const HIGH = 79;
const START = 67;
// A fixed-shape run (always up / down, up then down) stays within one
// octave of its root, the root taken from A3 to G#4 (concert) so the octave
// sits on the treble staff (a trumpet's written B3 to A#4 root).
const RUN_ROOTS = { low: 57, high: 68 };

const mod12 = (x) => ((x % 12) + 12) % 12;

function pitchesOf(chord, intervals, range = { low: LOW, high: HIGH }) {
  const set = new Set(intervals);
  const out = [];
  for (let m = range.low; m <= range.high; m++) {
    if (set.has(mod12(m - chord.root))) out.push(m);
  }
  return out;
}

const chordTones = (chord, range) => pitchesOf(chord, [...chord.tones], range);
// The chord's scale without the GA's blue notes — a clean scale to run, so
// a major chord gets its major seventh back (the GA leaves it out).
function scaleTones(chord, range) {
  const scale = chord.scale.filter((i) => !chord.blue.has(i));
  return pitchesOf(chord, chord.type === "maj" ? [...scale, 11] : scale, range);
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

// A breathing bar: land on the chord with a half note, then rest.
const BREATH_CELL = "x---....";

/*
  The rhythm as one string of slots over the whole chart: each bar's cell (a
  break bar, all N.C., is silent and takes no anticipation), with a ">"
  carried into the next bar's first slot. With `breathEvery` (bars, 0 for
  never) the last bar of every phrase of that length, counted from the first
  chord bar, is a breath instead (BREATH_CELL).
*/
export function rhythmSlots(bars, breaks, cells, breathEvery = 0) {
  let out = "";
  let tieIn = false;
  for (let bar = 0; bar < bars; bar++) {
    if (breaks.has(bar)) {
      out += ".".repeat(SLOTS_PER_BAR);
      tieIn = false;
    } else {
      const breath = breathEvery > 0 && bar % breathEvery === breathEvery - 1;
      const cell = breath ? BREATH_CELL : cells[Math.floor(bar / CELL_BARS) % cells.length];
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

// Walk `pool` (sorted) from `prev` one step in `dir`. At either end it turns
// round, or — `walk.restart`, a run that only goes one way — jumps back to
// the note it started from (the chord's root) and goes again.
function stepThrough(pool, prev, walk) {
  const i = pool.indexOf(prev);
  if (i === -1) return nearest(pool, prev);
  let next = i + walk.dir;
  if (next < 0 || next >= pool.length) {
    if (walk.restart !== null) return walk.restart;
    walk.dir = -walk.dir;
    next = i + walk.dir;
  }
  return pool[Math.max(0, Math.min(pool.length - 1, next))];
}

// How many notes play over each chord slot, by its id.
function segmentSizes(notes) {
  const sizes = new Map();
  for (const note of notes) sizes.set(note.at.id, (sizes.get(note.at.id) || 0) + 1);
  return sizes;
}

// Where a run starts over a new chord, and which way it goes.
function runStart(runs, chord, prev, walk) {
  if (runs === "alternate") {
    // Voice-led from the last note, the other way round from last time.
    walk.dir = -walk.dir;
    return nearest(chordTones(chord), prev);
  }
  // A fixed shape: no voice leading, every chord jumps to its root and the
  // run stays in that root's octave (octaveRange).
  const root = pitchesOf(chord, [0], RUN_ROOTS)[0];
  walk.range = octaveRange(runs, root, walk.withOctave);
  walk.dir = runs === "down" ? -1 : 1;
  const start = runs === "down" ? root + 12 : root;
  walk.restart = runs === "updown" ? null : start;
  return start;
}

/*
  The one octave a fixed-shape run moves in. A scale run (`withOctave`) and
  an up-then-down run take root to octave, both ends; an arpeggio that only
  goes one way leaves out the far root, so it repeats root-3-5-7 going up
  (octave-7-5-3 going down) instead of doubling the root at the turn.
*/
function octaveRange(runs, root, withOctave) {
  if (withOctave || runs === "updown") return { low: root, high: root + 12 };
  return runs === "down" ? { low: root + 1, high: root + 12 } : { low: root, high: root + 11 };
}

/*
  A run over each chord, walking `pool` from a chord tone. `runs` (a
  PRACTICE_RUNS value) sets its shape: "alternate" starts on the chord tone
  nearest the last note (so the line voice-leads through the changes) and
  goes up over one chord, down over the next; the others don't voice-lead
  but jump to the chord's root at every new chord (so every bar starts on
  one): "up" climbs from the root, "down" falls from its octave, and
  "updown" climbs from the root to the note after the middle of the chord's
  notes and comes back down — all within one octave of the root. `withOctave`:
  the pool is a scale, whose run spans root to octave.
*/
function runPitches(notes, pool, runs = "alternate", withOctave = false) {
  // Flipped at the first chord, so an alternating line opens going up.
  const walk = { dir: -1, restart: null, range: undefined, withOctave };
  const sizes = segmentSizes(notes);
  let prev = START;
  let segment = null;
  let index = 0;
  const midis = notes.map((note) => {
    if (note.at.id === segment) {
      index += 1;
      // Up to the middle note, then back down: 1 2 3 4 5 4 3 2 over eight.
      if (runs === "updown" && index === Math.ceil(sizes.get(segment) / 2) + 1) walk.dir = -1;
      prev = stepThrough(pool(note.at.chord, walk.range), prev, walk);
    } else {
      segment = note.at.id;
      index = 0;
      prev = runStart(runs, note.at.chord, prev, walk);
    }
    return prev;
  });
  return runs === "alternate" ? midis : leadIntoChords(notes, midis);
}

// Within this many eighths of the next chord's first note, a run's last note leads into it.
const LEAD_GAP = 2;
// The leading tone is only taken when it's at most a fourth from the note before it.
const LEAD_REACH = 5;

/*
  A fixed-shape run jumps to a new root at every chord, so its last note
  before the change leads into the next chord's first note: kept when it's
  already a step away, else a half step below it — a leading tone (B-flat C
  D E-flat F E-flat D E-natural, then F) — when that's a short move from
  the note before; otherwise the line is left as it was rather than leap
  to it. Not a chord's only note, and not across a longer rest.
*/
function leadIntoChords(notes, midis) {
  return midis.map((midi, i) => {
    const note = notes[i];
    const next = notes[i + 1];
    const changes = next !== undefined && next.at.id !== note.at.id;
    const firstOfChord = i === 0 || notes[i - 1].at.id !== note.at.id;
    if (!changes || firstOfChord || next.slot - (note.slot + note.len) > LEAD_GAP) return midi;
    const target = midis[i + 1];
    const leading = target - 1;
    if (Math.abs(midi - target) <= 2 || Math.abs(leading - midis[i - 1]) > LEAD_REACH) return midi;
    return leading;
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
function enclosurePitches(notes, runs) {
  const targets = new Map();
  let prev = START;
  notes.forEach((note, i) => {
    if (i === 0 || notes[i - 1].at.id !== note.at.id) {
      prev = nearest(guideTones(note.at.chord), prev);
      targets.set(i, prev);
    }
  });
  const filler = runPitches(notes, chordTones, runs);
  return notes.map((note, i) => {
    if (targets.has(i)) return targets.get(i);
    if (targets.has(i + 1)) return targets.get(i + 1) - 1;
    if (targets.has(i + 2)) {
      const target = targets.get(i + 2);
      const above = scaleTones(notes[i + 2].at.chord).find((m) => m > target);
      return above === undefined ? target + 2 : above;
    }
    return filler[i];
  });
}

const EXERCISES = {
  arpeggios: { cells: RUN_CELLS, pitches: (notes, runs) => runPitches(notes, chordTones, runs) },
  scales: { cells: RUN_CELLS, pitches: (notes, runs) => runPitches(notes, scaleTones, runs, true) },
  guide: { cells: LONG_CELLS, pitches: guidePitches },
  enclosures: { cells: RUN_CELLS, pitches: enclosurePitches },
  rhythm: { cells: RUN_CELLS, pitches: rhythmPitches },
};

// The cells an exercise cycles through: its own set, or the one picked.
function cellsFor(spec, rhythm) {
  const picked = PRACTICE_RHYTHMS.find((r) => r.value === rhythm);
  return picked ? [picked.cell] : spec.cells;
}

/*
  The exercise's notes over `names` (resolveChordNames' per-bar chord rows),
  as [{ start, duration, midi, leadsUp }] in beats from the first chord bar — the
  shape solo.js's barFragments draws. Empty for an unknown exercise.
  `rhythm` is "varied" or a PRACTICE_RHYTHMS value to keep all the way;
  `runs` a PRACTICE_RUNS value; `breath` a PRACTICE_BREATHS value.
*/
export function practiceNotes(names, exercise, { rhythm = "varied", runs = "alternate", breath = "off" } = {}) {
  const spec = EXERCISES[exercise];
  if (!spec) return [];
  const breaks = new Set();
  names.forEach((row, bar) => {
    if (row.every((name) => name === null)) breaks.add(bar);
  });
  const timeline = chordTimeline(names);
  const breathEvery = breath === "off" ? 0 : Number(breath);
  const notes = onsetsOf(rhythmSlots(names.length, breaks, cellsFor(spec, rhythm), breathEvery))
    .map((note) => ({ ...note, at: chordFor(timeline, note) }))
    .filter((note) => note.at);
  const midis = spec.pitches(notes, runs);
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
  K: line). `options` is practiceNotes' { rhythm, runs }.
*/
export function buildPracticeTune(text, chords, song, exercise, options = {}) {
  if (!chords || chords.length === 0 || !EXERCISES[exercise]) return null;
  const notes = practiceNotes(resolveChordNames(chords), exercise, options);
  const abc = appendBarVoice(text, song, ({ keyScale, keySig, lnum, lden }) => (
    barFragments(notes, chords.length, createPracticeSpeller(keyScale))
      .map((fragment, i, all) => rebeamBar(respellBar(fragment, keySig, i > 0 && endsTied(all[i - 1])), lnum, lden))
  ), { name: "Practice", titleSuffix: "" });
  return abc === null ? null : { abc, notes };
}

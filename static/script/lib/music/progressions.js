/*
  Named chord progressions for the "Named progressions" layer — the
  traditional-jazz vocabulary Pops Coffee teaches on his blog "Playing
  Traditional Jazz" (playing-traditional-jazz.blogspot.com):

    Four-Leaf    I | II7 | V7 | I        Post 41 / Post 413 ("I'm Looking
                                          Over a Four-Leaf Clover")
    Salty Dog    VI7 | II7 | V7 | I      Post 92
    Georgia      I | III7 | VI7          Post 139 (usually carries on into
                                          a Salty Dog: II7 V7 I)
    Sunshine     IV | IVm | I            Post 565 (the last eight bars of
                                          so many 32-bar tunes)
    Apple Tree   I | IV | I              Post 41 — an opening pattern, so
                                          only matched where a part starts

  findNamedProgressions(song) walks the parsed tune's chord symbols (first
  voice) and returns where each one sits: [{ id, name, startNote, endNote,
  lineStarts }] — `startNote`/`endNote` index the first voice's notes and
  rests in order (the match is [startNote, endNote)), which stay the same
  however the text is annotated afterwards; `lineStarts` is the source
  offset of the match's first note on every printed line it covers.

  Matching is deliberately strict, so a label means what it says: each
  chord of the pattern must last at least a bar (the closing I may be
  shorter), in a major key. A short chromatic approach chord (half a bar or
  less, like the A♭7 in Basin Street's G7 | A♭7 G7 | C7) is stepped over.
  Two progressions may share a chord — Georgia hands its VI7 straight on to
  a Salty Dog — and then the earlier one's band ends where the next starts.
*/

const PROGRESSIONS = [
  { id: "salty-dog", name: "Salty Dog", steps: [[9, "dom"], [2, "dom"], [7, "dom"], [0, "maj"]] },
  { id: "four-leaf", name: "Four-Leaf", steps: [[0, "maj"], [2, "dom"], [7, "dom"], [0, "maj"]] },
  { id: "georgia", name: "Georgia", steps: [[0, "maj"], [4, "dom"], [9, "dom"]] },
  { id: "sunshine", name: "Sunshine", steps: [[5, "majOrDom"], [5, "min"], [0, "maj"]] },
  { id: "apple-tree", name: "Apple Tree", steps: [[0, "maj"], [5, "majOrDom"], [0, "maj"]], opening: true },
];

export const PROGRESSION_NAMES = PROGRESSIONS.map((p) => p.name);

const NATURALS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACCIDENTALS = { "#": 1, "♯": 1, b: -1, "♭": -1 };
const KEY_ACC = { sharp: 1, flat: -1, "#": 1, b: -1 };

/*
  A chord symbol as { root: 0-11, quality: "maj" | "min" | "dom" | "dim" |
  "hdim" | "aug" }, or null when it isn't one (N.C., an annotation...). The
  bass note after a slash doesn't change the function (B♭/D is still I).
*/
export function parseChordSymbol(name) {
  if (typeof name !== "string" || name.length === 0) return null;
  const natural = NATURALS[name[0]];
  if (natural === undefined) return null;
  let i = 1;
  let root = natural;
  while (i < name.length && ACCIDENTALS[name[i]] !== undefined && !name.startsWith("b5", i)) {
    root += ACCIDENTALS[name[i]];
    i += 1;
  }
  const slash = name.indexOf("/", i);
  const rest = slash === -1 ? name.slice(i) : name.slice(i, slash);
  return { root: (root + 12) % 12, quality: chordQuality(rest) };
}

function hasSeventhOrMore(rest) {
  return ["7", "9", "11", "13"].some((n) => rest.includes(n));
}

function minorQuality(rest) {
  return rest.includes("7b5") || rest.includes("7♭5") ? "hdim" : "min";
}

const startsWithAny = (rest, prefixes) => prefixes.some((p) => rest.startsWith(p));

// Checked in order: "maj7" must win over "m", "m7b5" over plain minor.
const QUALITY_RULES = [
  [(rest) => startsWithAny(rest, ["maj", "Maj", "M", "Δ"]), () => "maj"],
  [(rest) => rest.includes("ø"), () => "hdim"],
  [(rest) => startsWithAny(rest, ["dim", "°", "o"]), () => "dim"],
  [(rest) => startsWithAny(rest, ["m", "-"]), minorQuality],
  [(rest) => startsWithAny(rest, ["+", "aug"]), (rest) => (hasSeventhOrMore(rest) ? "dom" : "aug")],
];

function chordQuality(rest) {
  const rule = QUALITY_RULES.find(([applies]) => applies(rest));
  if (rule) return rule[1](rest);
  return hasSeventhOrMore(rest) && !rest.startsWith("6") ? "dom" : "maj";
}

function qualityFits(wanted, quality) {
  if (wanted === "majOrDom") return quality === "maj" || quality === "dom";
  return wanted === quality;
}

// The chord symbol an abcjs element carries, if any (annotations have a
// position of their own; a chord symbol's is "default").
function chordName(el) {
  if (!el.chord) return null;
  const symbol = el.chord.find((c) => c.position === "default" || c.position === undefined);
  return symbol ? symbol.name : null;
}

function keyTonic(key) {
  if (!key || NATURALS[key.root] === undefined) return null;
  if (key.mode && key.mode.toLowerCase().startsWith("m")) return null; // minor / modal: not these patterns
  return (NATURALS[key.root] + (KEY_ACC[key.acc] || 0) + 12) % 12;
}

function meterLength(staff) {
  const meter = staff && staff.meter;
  if (!meter) return null;
  if (meter.type === "common_time" || meter.type === "cut_time") return 1;
  const v = meter.value && meter.value[0];
  return v ? Number(v.num) / Number(v.den) : null;
}

/*
  The tune as a list of harmony segments — one per chord change, merged
  when the next symbol is the same function (B♭ then B♭6) — each with its
  start time and length in bars, plus every note onset (time, offset,
  printed line) for turning times back into source offsets.
*/
function collectHarmony(song) {
  const state = { time: 0, line: -1, segments: [], notes: [], bar: 1, partStart: true, tonic: null };
  song.lines.forEach((line, lineIndex) => {
    const staff = line.staff && line.staff[0];
    if (!staff || !staff.voices) return;
    if (state.tonic === null) state.tonic = keyTonic(staff.key);
    state.bar = meterLength(staff) || state.bar;
    (staff.voices[0] || []).forEach((el) => readElement(el, lineIndex, state));
  });
  closeSegment(state);
  return state;
}

function closeSegment(state) {
  const last = state.segments[state.segments.length - 1];
  if (last && last.end === undefined) last.end = state.time;
}

function startSegment(el, symbol, lineIndex, state) {
  const last = state.segments[state.segments.length - 1];
  const same = last && last.root === symbol.root && last.quality === symbol.quality && last.tonic === state.tonic;
  if (same && !state.partStart) return;
  closeSegment(state);
  state.segments.push({
    root: symbol.root, quality: symbol.quality, tonic: state.tonic,
    start: state.time, line: lineIndex, partStart: state.partStart,
  });
  state.partStart = false;
}

function readElement(el, lineIndex, state) {
  if (el.el_type === "part") state.partStart = true;
  if (el.el_type === "keySignature") state.tonic = keyTonic(el);
  const name = chordName(el);
  const symbol = name === null ? null : parseChordSymbol(name);
  if (symbol) startSegment(el, symbol, lineIndex, state);
  if (el.el_type === "note") {
    state.notes.push({ time: state.time, startChar: el.startChar, line: lineIndex });
    state.time += el.duration || 0;
  }
}

function fitsStep(segment, step) {
  if (segment.tonic === null) return false;
  return (segment.root - segment.tonic + 12) % 12 === step[0] && qualityFits(step[1], segment.quality);
}

const EPS = 1e-9;

/*
  Try to match `steps` from segment `i`. A step takes its segment plus any
  short approach chord that returns to it (G7 | A♭7 G7) and must then add up
  to a bar — except a closing I, which may be shorter; between steps one
  short approach chord may be stepped over. Returns the index of the last
  segment used, the first segment of its closing chord, and when the match ends (at most a bar into its last chord),
  or null.
*/
function matchAt(segments, i, steps, bar) {
  let at = i;
  for (let s = 0; s < steps.length; s++) {
    if (at >= segments.length || !fitsStep(segments[at], steps[s])) return null;
    const stepFirst = at;
    const stepStart = segments[at].start;
    while (at + 2 < segments.length && isPassing(segments[at + 1], bar) && fitsStep(segments[at + 2], steps[s])) at += 2;
    const stepEnd = segments[at].end;
    const closing = s === steps.length - 1;
    if (stepEnd - stepStart < bar - EPS && !(closing && steps[s][0] === 0)) return null;
    if (closing) return { last: at, closingFirst: stepFirst, end: Math.min(stepEnd, stepStart + bar) };
    at += 1;
    if (at + 1 < segments.length && isPassing(segments[at], bar) && fitsStep(segments[at + 1], steps[s + 1])) at += 1;
  }
  return null;
}

function isPassing(segment, bar) {
  return segment.end - segment.start <= bar / 2 + EPS;
}

// The index of the first note at or after `time` (notes.length when none).
function noteIndexAt(notes, time) {
  const index = notes.findIndex((n) => n.time >= time - EPS);
  return index === -1 ? notes.length : index;
}

function lineStartsWithin(notes, startTime, endTime) {
  const starts = [];
  let line = -1;
  notes.forEach((n) => {
    if (n.time < startTime - EPS || n.time >= endTime - EPS) return;
    if (n.line !== line) starts.push(n.startChar);
    line = n.line;
  });
  return starts;
}

// The first progression (in PROGRESSIONS order) that matches from segment i.
function firstMatchAt(segments, i, bar) {
  for (const p of PROGRESSIONS) {
    const m = p.opening && !segments[i].partStart ? null : matchAt(segments, i, p.steps, bar);
    if (m) return { progression: p, first: i, ...m };
  }
  return null;
}

function findMatches(segments, bar) {
  const found = [];
  let i = 0;
  while (i < segments.length) {
    const best = firstMatchAt(segments, i, bar);
    if (best) {
      found.push(best);
      // The closing chord may open the next progression (Georgia → Salty Dog).
      i = best.closingFirst > best.first ? best.closingFirst : best.last + 1;
    } else {
      i += 1;
    }
  }
  return found;
}

export function findNamedProgressions(song) {
  if (!song || !song.lines) return [];
  const { segments, notes, bar } = collectHarmony(song);
  const matches = findMatches(segments, bar);
  return matches.map((m, k) => {
    const startTime = segments[m.first].start;
    const next = matches[k + 1];
    const endTime = next && segments[next.first].start < m.end ? segments[next.first].start : m.end;
    return {
      id: m.progression.id,
      name: m.progression.name,
      startNote: noteIndexAt(notes, startTime),
      endNote: noteIndexAt(notes, endTime),
      lineStarts: lineStartsWithin(notes, startTime, endTime),
    };
  });
}

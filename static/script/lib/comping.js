"use strict";

/* global Tonal */

import { computeChordOffset } from "./chords.js";

/*
   Chord-tone comping generator.

   Given a lead sheet's chord scheme, this turns each bar into a rhythmic,
   three-note accompaniment figure (root / third / fifth) using one of a set
   of predefined rhythm patterns, and returns a new ABC tune string that adds
   the comping as a *second staff* (three coloured voices merged onto one
   staff) below the untouched melody.

   `buildCompingTune` is the entry point. Everything here is pure: it needs
   only the parsed chord scheme + key (from the caller's ABCjs parse) and the
   `Tonal` global for note math, the same way music-theory.js does.
*/

// ---------------------------------------------------------------------------
// Rhythm patterns
// ---------------------------------------------------------------------------
// Each builder returns an ABC bar fragment in eighth-note units (one 4/4 bar =
// 8 slots; `half` = 4 slots, used when two chords share a bar). Builders take
// up to four ABC note tokens: n (the chord tone), nd / nu (one diatonic scale
// step below / above it) and nu2 (two steps above). Patterns that don't need
// the step tones just ignore the extra arguments.

const PATTERNS = {
  on_2_and_4: {
    twobar1: (n) => `z2 ${n}2 z2 ${n}2`,
    twobar2: (n) => `${n} z z ${n}-${n}4`,
    half: (n) => `z2 ${n}2`,
  },
  hold_over: {
    twobar1: (n) => `${n}8-`,
    twobar2: (n) => `${n}6 z2`,
    half: (n) => `${n}4`,
  },
  hit_and_hold: {
    twobar1: (n) => `${n} z z ${n}-${n}4`,
    twobar2: (n) => `${n} z z ${n}-${n}4`,
    half: (n) => `${n} z z ${n}`,
  },
  double_hit: {
    twobar1: (n) => `${n} ${n} z2 z4`,
    twobar2: (n) => `${n} ${n} z ${n} z ${n}3`,
    half: (n) => `${n} ${n} z2`,
  },
  whole_note: {
    twobar1: (n) => `${n}8-`,
    twobar2: (n) => `${n}8`,
    half: (n) => `${n}4`,
  },
  walk_down_a: {
    twobar1: (n) => `${n} z z ${n}-${n}2 z2`,
    twobar2: (n, nd) => `${n} ${n} ${nd} ${n} z4`,
    half: (n) => `${n} z z ${n}`,
  },
  walk_down_b: {
    twobar1: (n, nd) => `z2 ${n} z ${nd} ${n}2 ${nd}`,
    twobar2: (n, nd) => `${n} ${n} ${nd} ${n} z4`,
    half: (n) => `z2 ${n} z`,
  },
  whole_then_step: {
    twobar1: (n) => `${n}8`,
    twobar2: (n, nd) => `${nd} z z ${nd} z4`,
    half: (n) => `${n}4`,
  },
  walk_eighths: {
    twobar1: (n, nd) => `${n} ${n} ${nd} ${nd} ${n} ${n} ${nd} ${nd}`,
    twobar2: (n) => `${n} z z ${n}-${n}4`,
    half: (n, nd) => `${n} ${n} ${nd} ${nd}`,
  },
  cross_step: {
    twobar1: (n) => `z2 ${n} z z ${n} z2`,
    twobar2: (n, nd, nu) => `${n} z z ${n}-${n} ${nu} ${nd} z`,
    half: (n) => `z2 ${n} z`,
  },
  step_approach: {
    twobar1: (n, nd, nu) => `${n} ${nd} z2 ${nu} ${nd} z2`,
    twobar2: (n, nd, nu) => `${nu}3 ${nd} z4`,
    half: (n, nd) => `${n} ${nd} z2`,
  },
  double_then_step: {
    twobar1: (n) => `${n} ${n} z2 ${n} ${n} z2`,
    twobar2: (n, nd, nu) => `${n} z ${nu} ${nd} z4`,
    half: (n) => `${n} ${n} z2`,
  },
  full_walk: {
    twobar1: (n, nd, nu) => `${n} ${n} ${nd} ${n} ${nu} ${n} ${nd} ${n}`,
    twobar2: (n, nd) => `${nd} z z ${n}-${n}4`,
    half: (n, nd) => `${n} ${n} ${nd} ${n}`,
  },
  third_approach: {
    twobar1: (n, nd) => `${n} ${nd} z ${nd}-${n}4`,
    twobar2: (n, nd, nu, nu2) => `${nu2} ${nd} z ${nd}-${n}4`,
    half: (n, nd) => `${n} ${nd} z ${nd}`,
  },
  step_neighbor: {
    twobar1: (n, nd, nu) => `${n} ${nd} z ${nu}-${n}4`,
    twobar2: (n, nd, nu) => `${n} ${nd} z ${nu} z ${n}3`,
    half: (n, nd, nu) => `${n} ${nd} z ${nu}`,
  },
};

// Ordered list for the sheet's <select>, grouped like the prototype's optgroups.
export const COMPING_PATTERNS = [
  { value: "on_2_and_4", label: "On 2 and 4", group: "Base patterns" },
  { value: "hold_over", label: "Hold over", group: "Base patterns" },
  { value: "hit_and_hold", label: "Hit and hold", group: "Base patterns" },
  { value: "double_hit", label: "Double hit", group: "Base patterns" },
  { value: "whole_note", label: "Whole note", group: "Base patterns" },
  { value: "walk_down_a", label: "Walk down A", group: "Step down" },
  { value: "walk_down_b", label: "Walk down B", group: "Step down" },
  { value: "whole_then_step", label: "Whole then step", group: "Step down" },
  { value: "walk_eighths", label: "Walk eighths", group: "Step down" },
  { value: "cross_step", label: "Cross step", group: "Step up & down" },
  { value: "step_approach", label: "Step approach", group: "Step up & down" },
  { value: "double_then_step", label: "Double then step", group: "Step up & down" },
  { value: "full_walk", label: "Full walk", group: "Step up & down" },
  { value: "third_approach", label: "Third approach", group: "Step up & down" },
  { value: "step_neighbor", label: "Step neighbor", group: "Step up & down" },
];

const PATTERN_LABEL = COMPING_PATTERNS.reduce((acc, p) => {
  acc[p.value] = p.label;
  return acc;
}, {});

// ---------------------------------------------------------------------------
// Pure ABC / rhythm helpers (no Tonal)
// ---------------------------------------------------------------------------

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

/*
   Format a duration given in eighth-note slots as an ABC length suffix,
   scaled to the tune's own unit note length L:num/den. With L:1/8 a slot is
   "" (dur 1) / "2" / "8" …; with L:1/4 a slot is "/2", two slots "", etc.
*/
export function formatDuration(slots, lnum, lden) {
  let num = slots * lden;
  let den = 8 * lnum;
  const g = gcd(num, den);
  num /= g;
  den /= g;
  if (den === 1) return num === 1 ? "" : String(num);
  if (num === 1) return "/" + den;
  return num + "/" + den;
}

// Split an ABC bar fragment into note / rest / annotation tokens.
export function tokenizeBar(str) {
  const tokens = [];
  const re = /"[^"]*"|[_^=]*[A-Ga-gxz][',]*\d*\/?\d*-?/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    const t = m[0];
    if (t[0] === '"') {
      tokens.push({ annotation: t });
      continue;
    }
    const tie = t.slice(-1) === "-";
    const body = tie ? t.slice(0, -1) : t;
    const dm = body.match(/(\d+)$/);
    const dur = dm ? parseInt(dm[1], 10) : 1;
    const pitch = dm ? body.slice(0, -dm[1].length) : body;
    const head = pitch.replace(/^[_^=]+/, "")[0];
    tokens.push({ pitch, dur, tie, rest: head === "z" || head === "x" });
  }
  return tokens;
}

/*
   Re-emit a bar fragment (authored in eighth slots) with:
     - every duration scaled to the tune's unit note length, and
     - whitespace only at 4-slot boundaries / around long notes, so ABCjs
       beams the eighths in groups of four instead of one long run.
*/
export function rebeamBar(str, lnum, lden) {
  const tokens = tokenizeBar(str);
  let out = "";
  let pos = 0;
  let prevDur = 0;
  let prevRest = false;
  let started = false;
  for (const tok of tokens) {
    if (tok.annotation) {
      out += (out ? " " : "") + tok.annotation;
      continue;
    }
    const needSpace =
      started &&
      (tok.rest || prevRest || pos % 4 === 0 || prevDur > 1 || tok.dur > 1);
    if (needSpace) out += " ";
    out += tok.pitch + formatDuration(tok.dur, lnum, lden) + (tok.tie ? "-" : "");
    pos += tok.dur;
    prevDur = tok.dur;
    prevRest = tok.rest;
    started = true;
  }
  return out;
}

// Spread `total` eighth slots across `parts` notes as evenly as possible.
function distribute(total, parts) {
  const base = Math.floor(total / parts);
  let remainder = total - base * parts;
  const out = [];
  for (let i = 0; i < parts; i++) {
    out.push(base + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder--;
  }
  return out;
}

// Accepted meters — the patterns are written for a bar of 8 eighth slots.
const SUPPORTED_METERS = new Set(["4/4", "C", "C|", "2/2"]);

function readMeter(text) {
  const m = text.match(/^M:\s*(\S+)/m);
  if (!m) return "4/4";
  return SUPPORTED_METERS.has(m[1]) ? m[1] : null;
}

function readUnit(text) {
  const m = text.match(/^L:\s*(\d+)\s*\/\s*(\d+)/m);
  if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)];
  return [1, 8];
}

/*
   Split an ABC tune string into { header, kLine, body }: header is every line
   before the last K: line, body is everything after it. Returns null when
   there is no K: line to split on.
*/
function splitHeaderBody(text) {
  const lines = text.split("\n");
  let kIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^K:/.test(lines[i])) {
      kIdx = i;
      break;
    }
  }
  if (kIdx === -1) return null;
  return {
    header: lines.slice(0, kIdx),
    kLine: lines[kIdx],
    body: lines.slice(kIdx + 1).join("\n"),
  };
}

// Drop lyric / part / directive lines so they can't be mistaken for note bars.
function stripNonMusicLines(body) {
  return body
    .split("\n")
    .filter((line) => !/^\s*(w:|W:|s:|P:|N:|O:|%)/.test(line))
    .join("\n");
}

// Barline tokens, longest match first so "|1", ":|2", "[2" stay intact.
const BARLINE = /:\|:|:\|\d+|\|\|:?|::|\|:|:\||\[\||\|\]|\|\d+|\[\d+(?:[-,]\d+)*|\|/g;

/*
   Walk a melody body's barlines and, for every segment that carries notes,
   substitute the matching comping bar string. Barlines, repeats, volta
   brackets, inline [X:...] fields and line breaks are all kept verbatim, so
   the comping voice inherits the melody's exact structure and line wrapping.

   `leadingRestBars` note segments at the start (pickup / intro bars before
   the first chord) get `restToken` (a plain whole-bar rest) instead of
   consuming a pattern; so do any bars left once the patterns run out.
*/
export function buildVoiceBody(rawBody, barStrings, leadingRestBars, restToken) {
  restToken = restToken || "x8";
  const body = stripNonMusicLines(rawBody);
  const parts = [];
  let lastIdx = 0;
  let m;
  BARLINE.lastIndex = 0;
  while ((m = BARLINE.exec(body)) !== null) {
    parts.push({ bar: false, s: body.slice(lastIdx, m.index) });
    parts.push({ bar: true, s: m[0] });
    lastIdx = m.index + m[0].length;
  }
  parts.push({ bar: false, s: body.slice(lastIdx) });

  let patternIdx = 0;
  let seen = 0;
  let out = "";
  for (const p of parts) {
    if (p.bar) {
      out += p.s;
      continue;
    }
    const stripped = p.s
      .replace(/"[^"]*"/g, "")
      .replace(/![^!]*!/g, "")
      .replace(/\[[A-Za-z]:[^\]]*\]/g, "");
    if (!/[A-Ga-gxz]/.test(stripped)) {
      out += p.s;
      continue;
    }
    const inlineFields = (p.s.match(/\[[A-Za-z]:[^\]]*\]/g) || []).join(" ");
    const leadWs = (p.s.match(/^\s*/) || [""])[0];
    let content;
    if (seen < leadingRestBars) {
      content = restToken;
    } else if (patternIdx < barStrings.length) {
      content = barStrings[patternIdx++];
    } else {
      content = restToken;
    }
    seen++;
    out += leadWs + (inlineFields ? inlineFields + " " : "") + content + " ";
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tonal-backed note math
// ---------------------------------------------------------------------------

// Undo parseChordScheme's cosmetic unicode so Tonal can read the chord.
function plainChordName(name) {
  return String(name)
    .replace(/♭/g, "b")
    .replace(/♯/g, "#")
    .replace(/Ø/g, "dim")
    .trim();
}

const MODE_ALIASES = {
  "": "major", maj: "major", major: "major", m: "minor", min: "minor",
  minor: "minor", dor: "dorian", phr: "phrygian", lyd: "lydian",
  mix: "mixolydian", aeo: "aeolian", loc: "locrian",
};

function keyScaleNotes(key) {
  const tonic = (key.root || "C") + (key.acc || "");
  const mode = MODE_ALIASES[String(key.mode || "").toLowerCase()] || "major";
  let notes = Tonal.Scale.get(tonic + " " + mode).notes;
  if (!notes.length) notes = Tonal.Scale.get(tonic + " major").notes;
  return notes;
}

// Pitch class -> ABC pitch token, clustering root/third/fifth around one octave.
function toAbc(noteName) {
  if (!noteName) return "z";
  const abc = Tonal.AbcNotation.scientificToAbcNotation(noteName + "4");
  return noteName.charCodeAt(0) >= "C".charCodeAt(0) ? abc.toLowerCase() : abc;
}

// Shift an ABC pitch token up one octave (used to break voice unisons).
function abcOctaveUp(note) {
  const m = note.match(/^([_^=]*)([A-Ga-g])([,']*)$/);
  if (!m) return note;
  const [, acc, letter, marks] = m;
  if (marks.indexOf(",") !== -1) return acc + letter + marks.slice(1);
  if (letter === letter.toUpperCase()) return acc + letter.toLowerCase() + marks;
  return acc + letter + marks + "'";
}

/*
   For a chord tone, return [main, stepDown, stepUp, stepUp2] as ABC tokens:
   the tone itself plus its diatonic neighbours one/two scale steps away,
   each picked at the octave closest to the main note so the step figures
   never leap.
*/
function noteArgs(pc, keyScale) {
  const mainAbc = toAbc(pc);
  const mainSci = Tonal.AbcNotation.abcToScientificNotation(mainAbc);
  const mainMidi =
    (mainSci && Tonal.Note.midi(mainSci)) || Tonal.Note.midi(pc + "4") || 60;

  function step(delta) {
    const sign = delta > 0 ? 1 : -1;
    const idx = keyScale.indexOf(pc);
    let candidates = [];
    if (idx !== -1) {
      const stepPc =
        keyScale[((idx + delta) % keyScale.length + keyScale.length) % keyScale.length];
      for (let oct = 2; oct <= 6; oct++) {
        const mid = Tonal.Note.midi(stepPc + oct);
        if (mid) candidates.push({ note: stepPc + oct, dist: sign * (mid - mainMidi) });
      }
    } else {
      for (let si = 0; si < keyScale.length; si++) {
        for (let oct = 2; oct <= 6; oct++) {
          const mid = Tonal.Note.midi(keyScale[si] + oct);
          if (mid) candidates.push({ note: keyScale[si] + oct, dist: sign * (mid - mainMidi) });
        }
      }
    }
    candidates = candidates.filter((c) => c.dist > 0);
    if (!candidates.length) return mainAbc;
    candidates.sort((a, b) => a.dist - b.dist);
    return Tonal.AbcNotation.scientificToAbcNotation(candidates[0].note);
  }

  return [mainAbc, step(-1), step(1), step(2)];
}

// noteArgs for the three voices, nudging octaves so no slot has two voices in unison.
function resolvedNoteArgs(pc0, pc1, pc2, keyScale) {
  const a0 = noteArgs(pc0, keyScale);
  const a1 = noteArgs(pc1, keyScale);
  const a2 = noteArgs(pc2, keyScale);
  for (let s = 0; s < 4; s++) {
    if (a1[s] === a0[s]) a1[s] = abcOctaveUp(a1[s]);
    if (a2[s] === a0[s] || a2[s] === a1[s]) a2[s] = abcOctaveUp(a2[s]);
  }
  return [a0, a1, a2];
}

// Chord scheme -> per-bar arrays of [root, third, fifth] pitch-class triples.
function extractChordNotes(chords) {
  const result = [];
  let last = "C";
  for (const measure of chords) {
    const row = [];
    for (const raw of measure.text) {
      let name = plainChordName(raw);
      if (name === "%" || name === "") name = last;
      name = name.split("/")[0];
      last = name;
      let notes = Tonal.Chord.get(name).notes.slice(0, 3);
      while (notes.length < 3) notes.push(notes[0] || "C");
      row.push(notes);
    }
    result.push(row);
  }
  return result;
}

// Per bar, pick the inversion of each chord that moves least from the previous.
function voiceLead(chordNotes) {
  function semitones(a, b) {
    const up = Tonal.Interval.semitones(Tonal.Interval.distance(a, b));
    const down = Tonal.Interval.semitones(Tonal.Interval.distance(b, a));
    return Math.min(up, down);
  }
  let prev =
    chordNotes[0] && chordNotes[0][0] ? chordNotes[0][0].slice(0, 3) : ["C", "E", "G"];
  const out = [];
  for (const bar of chordNotes) {
    const voicedBar = [];
    for (const curr of bar) {
      const cost = [];
      for (let p = 0; p < 3; p++) {
        for (let n = 0; n < 3; n++) cost.push({ p, n, d: semitones(prev[p], curr[n]) });
      }
      cost.sort((x, y) => x.d - y.d);
      const usedP = new Set();
      const usedN = new Set();
      const pick = [null, null, null];
      for (const c of cost) {
        if (usedP.has(c.p) || usedN.has(c.n)) continue;
        pick[c.p] = curr[c.n];
        usedP.add(c.p);
        usedN.add(c.n);
      }
      voicedBar.push(pick);
      prev = pick;
    }
    out.push(voicedBar);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/*
   Build the comping tune.

   Parameters:
     text   - the ABC string about to be rendered (already clef-adjusted for
              the instrument), parsed by the caller at visualTranspose 0 so
              the chords/key below are in concert pitch. The single
              visualTranspose the caller passes to ABCjs.renderAbc then
              transposes melody and comping together.
     chords - parseChordScheme(song) output (concert pitch).
     song   - the ABCjs parseOnly tune (concert pitch).
     pattern- a COMPING_PATTERNS value.

   Returns the augmented ABC string, or null when comping can't apply (no
   chords, an unsupported meter, an already multi-voiced tune, no K: line).
*/
export function buildCompingTune(text, chords, song, pattern) {
  const pat = PATTERNS[pattern];
  if (!pat) return null;
  if (!chords || !chords.length) return null;
  if (!song || !song.lines || !song.lines[0] || !song.lines[0].staff) return null;
  if (/^V:/m.test(text) || /\[V:/.test(text)) return null;

  const meter = readMeter(text);
  if (!meter) return null;

  const split = splitHeaderBody(text);
  if (!split) return null;

  const [lnum, lden] = readUnit(text);
  const key = song.lines[0].staff[0].key || { root: "C", acc: "", mode: "" };
  const keyScale = keyScaleNotes(key);
  const bassClef = /clef\s*=\s*bass/.test(split.kLine);

  const voiced = voiceLead(extractChordNotes(chords));

  // Three parallel voices, each a list of bar fragments.
  const voices = [[], [], []];
  for (let bar = 0; bar < voiced.length; bar++) {
    const cb = voiced[bar];
    for (let vk = 0; vk < 3; vk++) {
      let fragment;
      if (cb.length === 1) {
        const fn = bar % 2 === 0 ? pat.twobar1 : pat.twobar2;
        const ra = resolvedNoteArgs(cb[0][0], cb[0][1], cb[0][2], keyScale);
        fragment = fn.apply(null, ra[vk]);
      } else if (cb.length === 2) {
        const ra0 = resolvedNoteArgs(cb[0][0], cb[0][1], cb[0][2], keyScale);
        const ra1 = resolvedNoteArgs(cb[1][0], cb[1][1], cb[1][2], keyScale);
        fragment = pat.half.apply(null, ra0[vk]) + " " + pat.half.apply(null, ra1[vk]);
      } else {
        const durs = distribute(8, cb.length);
        fragment = cb
          .map((triple, i) => {
            const ra = resolvedNoteArgs(triple[0], triple[1], triple[2], keyScale);
            return ra[vk][0] + durs[i];
          })
          .join(" ");
      }
      // The three voices share one rhythm; showing every rest three times
      // over is noise, so only the root voice draws them — the third and
      // fifth use invisible rests.
      if (vk > 0) fragment = fragment.replace(/z/g, "x");
      voices[vk].push(rebeamBar(fragment, lnum, lden));
    }
  }

  const leadingRestBars = computeChordOffset(song) || 0;
  // Invisible rest: keeps the comping voices bar-aligned with the melody
  // through pickup / intro / tail bars without drawing anything.
  const restToken = "x" + formatDuration(8, lnum, lden);
  const bodies = voices.map((bars) =>
    buildVoiceBody(split.body, bars, leadingRestBars, restToken).trim()
  );

  const clefSuffix = bassClef ? " clef=bass middle=D" : "";
  const label = PATTERN_LABEL[pattern] || pattern;

  const headerOut = [];
  for (const line of split.header) {
    if (/^L:/.test(line)) continue;
    if (/^%%(score|staves)\b/.test(line)) continue;
    if (/^T:/.test(line)) {
      headerOut.push(line + "  (comping \u2013 " + label + ")");
      continue;
    }
    headerOut.push(line);
  }
  headerOut.push("L:" + lnum + "/" + lden);
  // %%staves (not %%score) so ABCjs draws the barlines connecting the melody
  // staff to the comping staff — they read as one system. The bracket [ ]
  // groups them; ( ) merges the three comping voices onto one staff.
  headerOut.push("%%staves [1 (2 3 4)]");
  headerOut.push("V:1");
  headerOut.push('V:2 name="R"' + clefSuffix);
  headerOut.push('V:3 name="3"' + clefSuffix);
  headerOut.push('V:4 name="5"' + clefSuffix);
  headerOut.push(split.kLine);

  const melodyBody = split.body.replace(/\s+$/, "");
  return (
    headerOut.join("\n") +
    "\nV:1\n" + melodyBody +
    "\nV:2\n" + bodies[0] +
    "\nV:3\n" + bodies[1] +
    "\nV:4\n" + bodies[2] + "\n"
  );
}

import { computeChordOffset } from "./chords.js";

/*
   Chord-tone comping generator.

   Given a lead sheet's chord scheme, this turns each bar into a rhythmic,
   three-note accompaniment figure (root / third / fifth) using one of a set
   of predefined rhythm patterns, and returns a new ABC tune string that adds
   the comping as a *second staff* below the untouched melody.

   The comping is a single voice of block chords — one stem per hit — with the
   three chord tones drawn as one chord token "[low mid high]". The three
   voices are voice-led from bar to bar: each of the low / mid / high voices
   moves to the nearest tone of the next chord (in real register, octaves
   included) and the voices never cross, so a chord can come out in any
   inversion. split.css then colour-keys the noteheads by their
   abcjs-chord-pos-N class (N counts up from the bottom); the palette
   `buildCompingTune` returns says which chord tone (R / 3 / 5) each position
   ended up being.

   `buildCompingTune` is the entry point. Everything here is pure: it needs
   only the parsed chord scheme + key (from the caller's ABCjs parse) and the
   `Tonal` global for note math, the same way music-theory.js does.
*/

// ---------------------------------------------------------------------------
// Rhythm patterns
// ---------------------------------------------------------------------------
// Each builder returns an ABC bar fragment in eighth-note units (one 4/4 bar =
// 8 slots; `half` = 4 slots, used when two chords share a bar). Builders take
// up to four ABC chord tokens: n (the triad "[ceg]"), nd / nu (the whole
// triad planed one diatonic scale step below / above) and nu2 (two steps
// above). Patterns that don't need the step tokens just ignore the extras.

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

function gcd(x, y) {
  let a = Math.abs(x);
  let b = Math.abs(y);
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

/*
   Sum the played duration of one melody bar segment, in eighth-note slots,
   scaled to the tune's unit note length L:lnum/lden. Chords ([CEG]) count
   once, grace notes / decorations / chord symbols / inline fields are
   ignored, and broken rhythm (`>` `<`) nets to zero across a bar so it's
   dropped. Returns 0 when nothing measurable is found.

   Used to give a pickup/anacrusis its true length in the comping voices: a
   fixed whole-bar rest there pushes the first barline out and the melody and
   comping staves stop lining up.
*/
export function measureBarSlots(segment, lnum, lden) {
  const unitSlots = (8 * lnum) / lden;
  const s = String(segment)
    .replace(/"[^"]*"/g, "")
    .replace(/![^!]*!/g, "")
    .replace(/\[[A-Za-z]:[^\]]*\]/g, "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\[[^\]]*\]/g, "Y");
  const re = /(?:Y|[_^=]*[A-Ga-gxzZ])[,']*(\d+)?(\/+)?(\d*)/g;
  let total = 0;
  let matched = false;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m.index === re.lastIndex) {
      re.lastIndex++;
      continue;
    }
    matched = true;
    let mult = m[1] ? parseInt(m[1], 10) : 1;
    if (m[2]) {
      const denom = m[3] ? parseInt(m[3], 10) : Math.pow(2, m[2].length);
      mult /= denom;
    }
    total += unitSlots * mult;
  }
  return matched ? total : 0;
}

// Split an ABC bar fragment into note / chord / rest / annotation tokens.
export function tokenizeBar(str) {
  const tokens = [];
  const re =
    /"[^"]*"|\[(?:[_^=]*[A-Ga-g][',]*)+\]\d*\/?\d*-?|[_^=]*[A-Ga-gxz][',]*\d*\/?\d*-?/g;
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
    const head = pitch[0] === "[" ? "[" : pitch.replace(/^[_^=]+/, "")[0];
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
   consuming a pattern; so do any bars left once the patterns run out. When
   `lnum`/`lden` are given, a leading segment shorter than a full bar (a
   pickup) instead gets an invisible rest of its own measured length, so the
   comping voices stay bar-aligned with the melody.
*/
export function buildVoiceBody(rawBody, barStrings, leadingRestBars, restToken, lnum, lden) {
  const rest = restToken || "x8";
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
      content = rest;
      if (lnum && lden) {
        const slots = measureBarSlots(p.s, lnum, lden);
        if (slots > 0 && slots < 8) content = "x" + formatDuration(slots, lnum, lden);
      }
    } else if (patternIdx < barStrings.length) {
      content = barStrings[patternIdx++];
    } else {
      content = rest;
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

// Pitch class -> chroma 0..11 (Tonal.Note.chroma isn't in the test stub).
function pcChromaVal(pc) {
  const mid = Tonal.Note.midi(pc + "4");
  return mid == null ? 0 : ((mid % 12) + 12) % 12;
}

/*
   Move a pitch class `steps` diatonic scale steps along `keyScale`. A tone
   that isn't in the key is first snapped to the nearest scale degree (by
   pitch-class distance) so chromatic chord roots still plane sensibly.
*/
function scaleShift(pc, keyScale, steps) {
  if (!steps || !keyScale.length) return pc;
  let idx = keyScale.indexOf(pc);
  if (idx === -1) {
    const target = pcChromaVal(pc);
    let best = 0;
    let bestDist = 99;
    for (let i = 0; i < keyScale.length; i++) {
      const raw = Math.abs(pcChromaVal(keyScale[i]) - target);
      const dist = Math.min(raw, 12 - raw);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    idx = best;
  }
  const n = keyScale.length;
  return keyScale[(((idx + steps) % n) + n) % n];
}

/*
   Emit an ABC chord token "[low mid high]" from voiced chord tones
   ({ pc, oct }) already in bottom-to-top order with the concrete octaves the
   voice-leading chose. Nothing is re-stacked here — the octaves are honoured
   as given, so the printed noteheads sit exactly where the voice-leading put
   them (any inversion) and move the shortest way from chord to chord. ABCjs
   tags the noteheads .abcjs-chord-pos-1/2/3 (up from the bottom) and
   sheet-decorations.js colours each by the matching voice's fn.
*/
function stackChord(voices) {
  const notes = voices.map((v) =>
    Tonal.AbcNotation.scientificToAbcNotation(v.pc + v.oct),
  );
  return "[" + notes.join("") + "]";
}

/*
   Lowest-cost octave for pitch class `pc` measured against a reference MIDI
   (the same voice's previous note) — i.e. the octave that moves the voice
   least.
*/
function nearestOctave(pc, refMidi) {
  let bestOct = 4;
  let bestDist = Infinity;
  for (let oct = 1; oct <= 7; oct++) {
    const midi = Tonal.Note.midi(pc + oct);
    if (midi == null) continue;
    const dist = Math.abs(midi - refMidi);
    if (dist < bestDist) {
      bestDist = dist;
      bestOct = oct;
    }
  }
  return bestOct;
}

/*
   Place pitch classes `pcs` (bottom-to-top voice order) into concrete octaves:
   each voice takes the octave nearest its reference MIDI `refMidis[i]`, then
   any voice sitting at or below the one under it is lifted by whole octaves.
   Result stays strictly ascending, so the voices never cross. Returns
   [{ pc, oct, midi }] bottom-to-top.
*/
function voiceNear(pcs, refMidis) {
  const placed = pcs.map((pc, i) => {
    const oct = nearestOctave(pc, refMidis[i]);
    const midi = Tonal.Note.midi(pc + oct);
    return { pc, oct, midi: midi == null ? refMidis[i] : midi };
  });
  for (let i = 1; i < placed.length; i++) {
    while (placed[i].midi <= placed[i - 1].midi) {
      placed[i].oct += 1;
      placed[i].midi += 12;
    }
  }
  return placed;
}

/*
   For a voiced triad ([{pc,fn,oct}] bottom-to-top), return [main, down1, up1,
   up2] as ABC chord tokens: the triad itself plus the whole triad planed
   one/one/two diatonic scale steps below/above, each re-voiced to stay near
   the main triad's register (and non-crossing). Planing keeps the voice
   order, so the colour order (voices.map(fn)) is the same for all four.
*/
function chordArgs(voices, keyScale) {
  const refMidis = voices.map((v) => {
    const m = Tonal.Note.midi(v.pc + v.oct);
    return m == null ? 60 : m;
  });
  const plane = (steps) => {
    if (steps === 0) return stackChord(voices);
    const pcs = voices.map((v) => scaleShift(v.pc, keyScale, steps));
    return stackChord(voiceNear(pcs, refMidis));
  };
  return [plane(0), plane(-1), plane(1), plane(2)];
}

const FN_LABELS = ["R", "3", "5"];

// Chord scheme -> per-bar arrays of triads, each triad [{pc,fn}] (root/3rd/5th).
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
      const notes = Tonal.Chord.get(name).notes.slice(0, 3);
      while (notes.length < 3) notes.push(notes[0] || "C");
      row.push(notes.map((pc, i) => ({ pc, fn: FN_LABELS[i] })));
    }
    result.push(row);
  }
  return result;
}

// The six ways to map a chord's three tones onto the low / mid / high voices.
const VOICE_PERMS = [
  [0, 1, 2], [0, 2, 1], [1, 0, 2],
  [1, 2, 0], [2, 0, 1], [2, 1, 0],
];

/*
   Per bar, voice-lead each chord from the previous one: try all six ways of
   assigning the chord's tones to the low / mid / high voices, place each voice
   at the octave nearest where that voice sat before (real register, so an
   octave leap counts as an octave), forbid the voices from crossing, and keep
   the assignment with the least total motion. So each colour — root, third,
   fifth — travels the shortest distance it can and the three lines never swap
   order. Returns the same shape as extractChordNotes but with each triad's
   { pc, fn } re-ordered bottom-to-top and given the octave the voice-leading
   chose, so a chord can come out in any inversion.
*/
function voiceLead(bars) {
  // Seed: the first chord's tones in root position around middle C.
  let prevMidis = [60, 64, 67];
  const out = [];
  for (const bar of bars) {
    const voicedBar = [];
    for (const curr of bar) {
      let best = null;
      for (const perm of VOICE_PERMS) {
        const placed = voiceNear(
          perm.map((ci) => curr[ci].pc),
          prevMidis,
        );
        const cost = placed.reduce(
          (sum, p, i) => sum + Math.abs(p.midi - prevMidis[i]),
          0,
        );
        if (!best || cost < best.cost) best = { perm, placed, cost };
      }
      // Nudge back by an octave if the stack has drifted off the staff.
      const mid = (best.placed[0].midi + best.placed[2].midi) / 2;
      const shift = mid < 55 ? 12 : mid > 78 ? -12 : 0;
      const pick = best.perm.map((ci, i) => ({
        pc: curr[ci].pc,
        fn: curr[ci].fn,
        oct: best.placed[i].oct + shift / 12,
      }));
      voicedBar.push(pick);
      prevMidis = best.placed.map((p) => p.midi + shift);
    }
    out.push(voicedBar);
  }
  return out;
}

// The [ tokens in an ABC bar fragment == the chord onsets ABCjs will draw.
function countChords(fragment) {
  return (String(fragment).match(/\[/g) || []).length;
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

   Returns { abc, palette }, or null when comping can't apply (no chords, an
   unsupported meter, an already multi-voiced tune, no K: line):
     abc     - the augmented ABC (melody as V:1, one block-chord comping voice
               as V:2)
     palette - one entry per chord onset ABCjs will draw in the comping voice,
               in reading order: ["R","3","5"] giving the chord-tone function
               of each notehead bottom-to-top (voice-leading can invert a
               chord, so this is not always root/third/fifth).
               sheet-decorations.js zips it against the rendered noteheads and
               colours each.
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

  // One comping voice: each pattern slot is a block chord "[low mid high]".
  // compBars[i] is bar i's ABC fragment; compPalettes[i] is a colour order
  // (["R","3","5"] bottom-to-top) per chord onset in that fragment.
  const compBars = [];
  const compPalettes = [];
  for (let bar = 0; bar < voiced.length; bar++) {
    const cb = voiced[bar];
    let fragment;
    let barPalette;
    if (cb.length === 1) {
      const fn = bar % 2 === 0 ? pat.twobar1 : pat.twobar2;
      fragment = fn.apply(null, chordArgs(cb[0], keyScale));
      const order = cb[0].map((v) => v.fn);
      barPalette = Array(countChords(fragment)).fill(order);
    } else if (cb.length === 2) {
      const fragA = pat.half.apply(null, chordArgs(cb[0], keyScale));
      const fragB = pat.half.apply(null, chordArgs(cb[1], keyScale));
      fragment = fragA + " " + fragB;
      barPalette = Array(countChords(fragA))
        .fill(cb[0].map((v) => v.fn))
        .concat(Array(countChords(fragB)).fill(cb[1].map((v) => v.fn)));
    } else {
      const durs = distribute(8, cb.length);
      fragment = cb
        .map((triple, i) => chordArgs(triple, keyScale)[0] + durs[i])
        .join(" ");
      barPalette = cb.map((triple) => triple.map((v) => v.fn));
    }
    compBars.push(rebeamBar(fragment, lnum, lden));
    compPalettes.push(barPalette);
  }

  const leadingRestBars = computeChordOffset(song) || 0;
  // Invisible rest: keeps the comping voice bar-aligned with the melody
  // through pickup / intro / tail bars without drawing anything.
  const restToken = "x" + formatDuration(8, lnum, lden);
  const compBody = buildVoiceBody(
    split.body, compBars, leadingRestBars, restToken, lnum, lden,
  ).trim();
  // buildVoiceBody consumes compBars in order (leading/tail bars use the plain
  // rest), so the drawn chord onsets are compPalettes flattened in bar order.
  const palette = compPalettes.flat();

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
  // groups them.
  headerOut.push("%%staves [1 2]");
  headerOut.push("V:1");
  // Stacked R / 3 / 5 label at the staff's left, naming the chord tones the
  // three notehead colours pick out (root / third / fifth, bottom to top).
  headerOut.push('V:2 name="R\\n3\\n5"' + clefSuffix);
  headerOut.push(split.kLine);

  const melodyBody = split.body.replace(/\s+$/, "");
  const abc =
    headerOut.join("\n") +
    "\nV:1\n" + melodyBody +
    "\nV:2\n" + compBody + "\n";
  return { abc, palette };
}

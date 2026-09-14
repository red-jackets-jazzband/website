import {
  scanNoteLetter, scanDurationMultiplier,
  CHORD_NOTE_LETTERS, BARLINE, ALWAYS_STRIP, splitHeaderBody, findVoiceIds, findInlineVoiceIds, formatDuration, readUnit,
} from "./comping.js";

// Scans a "[note[dur] note[dur] ...]" chord bracket, returning the index
// just past the "]", or -1 if `i` isn't the start of a well-formed one.
// Unlike lib/comping.js's own scanChordBracket (built for comping's own
// *generated* brackets, which only ever carry one shared duration after the
// closing "]", never a per-note one), this also accepts a duration suffix
// on each inner note — happy_feet_blues.abc's "[F2_d2]" ("_Break rhythm"
// bars, spelling each chord tone's own length individually instead of
// sharing one after the "]") is a real, hand-authored example; comping.js's
// own stripChordBrackets doc comment already flags the same pattern.
// Without this, "[F2_d2]" isn't recognised as a chord bracket at all (the
// bare "[" matches no token start), so the '[' is skipped one character at
// a time and "F2"/"_d2" are each picked up as their own separate, phantom
// note tokens instead of the one real chord.
function scanChordBracket(str, i) {
  let j = i + 1;
  let sawNote = false;
  let noteEnd = scanNoteLetter(str, j, CHORD_NOTE_LETTERS);
  while (noteEnd !== -1) {
    sawNote = true;
    j = scanDurationMultiplier(str, noteEnd).end;
    noteEnd = scanNoteLetter(str, j, CHORD_NOTE_LETTERS);
  }
  return sawNote && str[j] === "]" ? j + 1 : -1;
}

// abcjs recognizes five single-letter rest tokens — x/X/y/z/Z (see
// node_modules/abcjs/src/parse/abc_parse_settings.js's `rests` map:
// invisible / invisible-multimeasure / spacer / rest / multimeasure) — and
// counts every one of them for its own note-in-measure numbering exactly
// like a real note (abc_parse_music.js's note/rest handling doesn't treat
// them differently for that). lib/comping.js's own NOTE_LETTERS only
// recognises the lowercase pair (x/z), which is all its generated comping
// bars ever emit; a hand-authored melody bar (buckets_got_a_hole.abc's
// "yyy" spacer) can use any of the five, so this file widens the set
// locally rather than the shared constant several other, already-tested
// comping.js functions depend on.
const REST_LETTERS = "xXyzZ";
const NOTE_LETTERS = CHORD_NOTE_LETTERS + REST_LETTERS;

/*
  ABC-text patch application: applyPatchesToAbc(abcText, patches) -> patched
  ABC text. Pure — no DOM, no abcjs. Patches are pitch/rest/insert/chord
  edits addressed by lib/note-address.js's *flat* index — "the Kth real
  note/rest in this voice, counting from the start, in source order" — not
  abcjs's own per-measure {measure, note} pair.

  That pair looked reflow-independent (abcjs-mm{measure} is a running total
  across the whole tune, abcjs-n{note} resets each barline) and was this
  file's original design, but a real-corpus audit turned up abcjs's own
  Classes.prototype.newMeasure()/measureTotal() (node_modules/abcjs/src/
  write/draw/staff-group.js and voice.js — the real source, not the
  minified vendored bundle) occasionally *skipping* a measure number at
  certain line-wrap boundaries: basin_street.abc's Part B, rendered at this
  site's own staffwidth, draws mm14 immediately followed by mm16 — no mm15
  ever appears in the DOM. Confirmed present on ~13% of this corpus (any
  song where a bar happens to land exactly on such a boundary), each one
  cascading — every later measure number shifts by one. Since the skip is
  driven by abcjs's real, width-dependent line layout, no from-scratch text
  scan of the .abc source can predict it (short of re-implementing abcjs's
  own internal engraving pipeline). The flat position sidesteps the whole
  problem: neither abcjs's renderer nor a text scan of the source ever
  disagrees about *how many* real notes/rests exist or what order they're
  in — only about which measure-numbered bucket abcjs sorts each one into,
  which a flat count never depends on.

  V1 is scoped to the tune's first/melody voice: a chart that interleaves
  several voices' bars through one shared body (a Trumpet+Sousaphone-style
  chart's repeated whole-line "V: 1"/"V: 2" switches, or big_chief.abc's
  inline "[V:1] ... [V:2] ..." markers) has no single contiguous run of
  "voice 0's own bars" that a plain barline scan can locate safely, so
  patches on such a chart are left unapplied rather than risk splicing text
  into the wrong voice's bars. The vast majority of songs here have no voice
  declaration of their own at all and are unaffected by this.

  Bar-locating strategy deliberately does not rely on abcjs's internal parse
  offsets (undocumented, not a stable API): bars are split the same way
  lib/comping.js's own BARLINE regex already does. Bar *boundaries* found
  this way line up with abcjs's own (see splitBars' own doc comment for the
  two real-corpus edge cases that took to get right); it's only the
  *numbering* abcjs hangs on them that can occasionally skip — which is
  exactly why patches/notes are keyed by flat position instead of bar
  number.
*/

// A whole interleaved lyric/part/directive line (a w: line between two
// melody lines is the common case — see lib/comping.js's ALWAYS_STRIP,
// reused here) needs skipping in two different ways, both handled from
// this one check: its ordinary text is riddled with letters that double as
// ABC note names (lowercase a-g are octave-5 pitches — see scanBarTokens'
// own use of this below), and a w: line can *also* carry its own literal
// "|" characters to align syllables with barlines (gloryland.abc's "w: tell
// my | Sa-vior That  | I'm comin' soon." is a real example) — indistinguishable
// from a real barline to a plain BARLINE-regex scan over the whole body, so
// splitBars below must skip a match that falls inside one of these spans
// too, or a lyric line's own pipes silently shift every later bar's
// boundary. Returns the index just past the line (its own trailing newline
// included), or -1 when `i` isn't the start of one.
function skipNonMusicLine(str, i) {
  if (i !== 0 && str[i - 1] !== "\n") return -1;
  const nl = str.indexOf("\n", i);
  const line = nl === -1 ? str.slice(i) : str.slice(i, nl);
  if (!ALWAYS_STRIP.test(line)) return -1;
  return nl === -1 ? str.length : nl + 1;
}

// Every non-music line's { start, end } span in `body`, via skipNonMusicLine
// above — used by splitBars to ignore a barline-like character sitting
// inside one of them (a w: line's own alignment pipes).
function nonMusicLineSpans(body) {
  const spans = [];
  let i = 0;
  while (i < body.length) {
    const end = skipNonMusicLine(body, i);
    if (end !== -1) {
      spans.push({ start: i, end });
      i = end;
    } else {
      const nl = body.indexOf("\n", i);
      i = nl === -1 ? body.length : nl + 1;
    }
  }
  return spans;
}

// Bar boundaries within `body`, in source order — bars[i] is the ith bar's
// { start, end } span, the barlines themselves excluded. A BARLINE match
// inside a non-music line (see nonMusicLineSpans) isn't a real barline and
// is skipped rather than closing a bar early. A barline with no *real note*
// before it isn't a real bar either — confirmed on two different shapes in
// this corpus: glory_halleluja.abc opens straight on "|:" with no pickup at
// all, and basin_street.abc's Part B opens with "P:B\n|:..." — a bare
// directive line, not silence, between Part A's closing barline and Part
// B's own opening one. A plain whitespace/blank check isn't enough for the
// second shape (a P: line "looks" non-empty), so this scans the candidate
// span the same way scanBarTokens will, and only counts it as a bar once
// it actually finds at least one real note/rest/chord token — a whole-bar
// rest ("z8") still counts, since that *is* real content, just silent.
function splitBars(body) {
  const skipSpans = nonMusicLineSpans(body);
  const isSkipped = (pos) => skipSpans.some((s) => pos >= s.start && pos < s.end);
  const bars = [];
  let lastIdx = 0;
  BARLINE.lastIndex = 0;
  let m = BARLINE.exec(body);
  while (m !== null) {
    if (!isSkipped(m.index)) {
      if (scanBarTokens(body.slice(lastIdx, m.index)).tokens.length > 0) {
        bars.push({ start: lastIdx, end: m.index });
      }
      lastIdx = m.index + m[0].length;
    }
    m = BARLINE.exec(body);
  }
  bars.push({ start: lastIdx, end: body.length });
  return bars;
}

function isInlineFieldStart(str, i) {
  return str[i] === "[" && /[A-Za-z]/.test(str[i + 1] ?? "") && str[i + 2] === ":";
}

// Advances past a `closeChar`-terminated run starting at `i` (the opening
// character already identified by the caller) — an unterminated run is left
// as a single skipped character, same fallback tokenizeBar/measureBarSlots
// use in lib/comping.js.
function skipToClose(str, i, closeChar) {
  const end = str.indexOf(closeChar, i + 1);
  return end === -1 ? i + 1 : end + 1;
}

// Scans one real note/rest/chord-bracket token starting at `i` (accidentals
// already skipped for a plain note, or the whole bracket for a chord), plus
// its duration suffix and tie mark. Returns null when `i` isn't the start of
// one. `spacer` flags abcjs's "y" rest type — a zero-width spacing hint
// that abcjs's own note-in-measure numbering explicitly never counts (see
// voice.js's isNonSpacerRest: `rest.type !== 'spacer'` gates incrNote()) —
// so the caller must skip it without indexing, the same way a decoration or
// grace note is skipped, not treat it as a real rest.
function scanRealToken(str, i) {
  const chordEnd = str[i] === "[" ? scanChordBracket(str, i) : -1;
  const isChord = chordEnd !== -1;
  // scanNoteLetter already scans past any octave marks itself for a plain
  // note; only a chord bracket's own closing "]" needs no such extra scan.
  const pitchEnd = isChord ? chordEnd : scanNoteLetter(str, i, NOTE_LETTERS);
  if (pitchEnd === -1) return null;

  const dur = scanDurationMultiplier(str, pitchEnd);
  let end = dur.end;
  let tie = false;
  if (str[end] === "-") {
    tie = true;
    end += 1;
  }
  const bareLetter = isChord ? null : str.slice(i, pitchEnd).replace(/^[_^=]+/, "")[0];
  const rest = !isChord && REST_LETTERS.includes(bareLetter);
  const spacer = bareLetter === "y";
  return {
    start: i, end, pitchStart: i, pitchEnd, tie, rest, chord: isChord, spacer,
  };
}

/*
  Position-preserving bar scanner: walks one bar's untouched text once,
  skipping over (but not indexing) chord/annotation strings, !decoration!s,
  {grace notes}, inline [K:...] fields, and any whole interleaved w:/P:/...
  line (see skipNonMusicLine above), and indexing real note/rest/chord
  tokens the same way abcjs's own Classes.prototype.incrNote() does. These
  per-bar indices are only ever used locally, to locate a flat position
  within its owning bar (see locateFlatToken) — the persisted address is the
  flat count across the whole voice, not this bar-local one (see this
  file's own doc comment on why). Deliberately not reused from
  lib/comping.js's tokenizeBar, which exists to regenerate a bar from
  comping's own cleaned, already-stripped synthetic fragments, discarding
  original position/decoration info — the wrong tool for editing one token
  in an arbitrary hand-authored bar in place.

  Returns { tokens, annotations }:
    tokens      - [{ index, start, end, pitchStart, pitchEnd, tie, rest,
                  chord }], one per real note/rest/chord-bracket, in source
                  order.
    annotations - [{ start, end, noteIndex }], one per "..." chord-symbol
                  string, keyed by the bar-local index of the note it
                  precedes (or null for a trailing annotation with no
                  following note — rare but ABC-legal, treated as
                  end-of-bar-anchored).
*/
// Scans a `"..."` chord-symbol/annotation string at `i`, if one starts
// there. Returns the index just past it, recording its span in `pending`
// unless it's unterminated (then just skip the opening quote) — or -1 when
// `i` isn't the start of one.
function scanAnnotation(str, i, pending) {
  if (str[i] !== '"') return -1;
  const closeIdx = str.indexOf('"', i + 1);
  if (closeIdx === -1) return i + 1;
  pending.push({ start: i, end: closeIdx + 1 });
  return closeIdx + 1;
}

export function scanBarTokens(barText) {
  const str = String(barText);
  const tokens = [];
  const annotations = [];
  let pending = [];
  let i = 0;
  while (i < str.length) {
    const lineSkip = skipNonMusicLine(str, i);
    if (lineSkip !== -1) {
      i = lineSkip;
      continue;
    }
    const annotationEnd = scanAnnotation(str, i, pending);
    if (annotationEnd !== -1) {
      i = annotationEnd;
      continue;
    }

    const skipped = skipNonTokenSpan(str, i);
    if (skipped !== -1) {
      i = skipped;
      continue;
    }

    const token = scanRealToken(str, i);
    if (!token) {
      i += 1;
      continue;
    }
    if (token.spacer) {
      i = token.end;
      continue;
    }
    const index = tokens.length;
    for (const a of pending) annotations.push({ ...a, noteIndex: index });
    pending = [];
    tokens.push({ index, ...token });
    i = token.end;
  }
  for (const a of pending) annotations.push({ ...a, noteIndex: null });
  return { tokens, annotations };
}

// Skips a !decoration!, {grace note} group or inline [X:...] field at `i`, if
// one starts there — everything scanBarTokens walks past without indexing.
// Returns the index just past it, or -1 when `i` isn't the start of any of
// the three.
function skipNonTokenSpan(str, i) {
  if (str[i] === "!") return skipToClose(str, i, "!");
  if (str[i] === "{") return skipToClose(str, i, "}");
  if (isInlineFieldStart(str, i)) {
    // Search from i + 3 (past "[X:"), but fall back to skipping just the
    // "[" — not the whole 3-char prefix — on an unterminated field, same
    // single-character-skip convention as every other branch here.
    const closeIdx = str.indexOf("]", i + 3);
    return closeIdx === -1 ? i + 1 : closeIdx + 1;
  }
  return -1;
}

const NATURAL_SEMITONE = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};
// One entry per chromatic semitone 0-11 — see stepPitchSemitone's own doc
// comment for why every result is spelled off this fixed table.
const CHROMATIC_SPELLING = [
  { letter: "C", accidental: "" }, { letter: "C", accidental: "^" },
  { letter: "D", accidental: "" }, { letter: "D", accidental: "^" },
  { letter: "E", accidental: "" }, { letter: "F", accidental: "" },
  { letter: "F", accidental: "^" }, { letter: "G", accidental: "" },
  { letter: "G", accidental: "^" }, { letter: "A", accidental: "" },
  { letter: "A", accidental: "^" }, { letter: "B", accidental: "" },
];

/*
  Shift one plain ABC pitch token (accidentals + letter + octave marks, e.g.
  "_B," or "^^c'") by a single semitone. A small, self-contained codec — not
  lib/music-theory.js's Tonal-based helpers, which don't understand ABC's
  ,/' octave-mark spelling and are overkill for a one-semitone nudge.
  Re-spells every result off a plain ascending chromatic scale (natural or
  sharp, never flat) rather than trying to stay key-signature-aware, same as
  the nudge itself — a stylistic simplification, not a wrong pitch.
  Returns null for anything that isn't a recognisable plain note (a rest, a
  chord bracket, ...).
*/
export function stepPitchSemitone(pitchToken, direction) {
  const m = /^([_^=]*)([A-Ga-g])([,']*)$/.exec(pitchToken);
  if (!m) return null;
  const [, accidentalRaw, letterRaw, marksRaw] = m;
  let accidentalValue = 0;
  for (const c of accidentalRaw) {
    if (c === "^") accidentalValue += 1;
    else if (c === "_") accidentalValue -= 1;
  }
  const isLower = letterRaw === letterRaw.toLowerCase();
  let octave = isLower ? 5 : 4;
  for (const c of marksRaw) {
    if (c === "'") octave += 1;
    else if (c === ",") octave -= 1;
  }
  const absolute =
    octave * 12 + NATURAL_SEMITONE[letterRaw.toUpperCase()] + accidentalValue + direction;
  const newOctave = Math.floor(absolute / 12);
  const semitoneInOctave = ((absolute % 12) + 12) % 12;
  const { letter, accidental } = CHROMATIC_SPELLING[semitoneInOctave];
  const newIsLower = newOctave >= 5;
  const marks = newIsLower ? "'".repeat(newOctave - 5) : ",".repeat(4 - newOctave);
  return accidental + (newIsLower ? letter.toLowerCase() : letter) + marks;
}

// Where a chord/insert patch with no existing token to anchor to lands:
// before the bar-local token at `note`, or at the end of the bar when
// `note` is null/one-past-the-last-token (both meaning "the end of the
// bar" — locateFlatToken/locateAppendPoint resolve a patch's flat `note`
// down to one of these bar-local positions before spliceForPatch ever runs).
function insertAnchor(note, tokens, barText) {
  return note == null || note >= tokens.length ? barText.length : tokens[note].start;
}

// pitch/rest only ever touch an existing real (non-chord-bracket) token.
function spliceForPitchOrRest(patch, ctx) {
  const token = patch.note == null ? null : ctx.tokens[patch.note];
  if (!token || token.chord) return [];
  const text = patch.action === "rest" ? "z" : patch.value;
  return [{ start: token.pitchStart, end: token.pitchEnd, text }];
}

function spliceForChord(patch, ctx) {
  const existing = ctx.annotations.find((a) => a.noteIndex === patch.note);
  if (patch.value === null) {
    return existing ? [{ start: existing.start, end: existing.end, text: "" }] : [];
  }
  // Replacing an existing annotation keeps whatever whitespace already
  // surrounded it; a brand-new one has none to lean on, so it carries its
  // own trailing space.
  if (existing) return [{ start: existing.start, end: existing.end, text: `"${patch.value}"` }];
  const anchor = insertAnchor(patch.note, ctx.tokens, ctx.barText);
  return [{ start: anchor, end: anchor, text: `"${patch.value}" ` }];
}

function spliceForInsert(patch, ctx) {
  const anchor = insertAnchor(patch.note, ctx.tokens, ctx.barText);
  const inserted = String(patch.value) + formatDuration(1, ctx.lnum, ctx.lden);
  return [{ start: anchor, end: anchor, text: `${inserted} ` }];
}

const SPLICE_BUILDERS = {
  pitch: spliceForPitchOrRest,
  rest: spliceForPitchOrRest,
  chord: spliceForChord,
  insert: spliceForInsert,
};

// One patch -> the { start, end, text } text splices (bar-relative) it needs.
function spliceForPatch(patch, ctx) {
  const builder = SPLICE_BUILDERS[patch.action];
  return builder ? builder(patch, ctx) : [];
}

// True when `split.body` is a single contiguous run of voice 0's own bars —
// see this file's own doc comment on why an interleaved multi-voice body
// (several voices' bars sharing one body) has no such safe sequence.
function isSingleVoiceScoped(abcText, split) {
  const declaredVoiceIds = findVoiceIds(abcText);
  const inlineVoiceIds = findInlineVoiceIds(abcText).filter((id) => !declaredVoiceIds.includes(id));
  const explicitVoices = declaredVoiceIds.length > 0 || inlineVoiceIds.length > 0;
  const bodyHasVoiceSwitches = /^V:\s*\S+/m.test(split.body) || /\[V:/.test(split.body);
  return !(explicitVoices && bodyHasVoiceSwitches);
}

// Every bar's parsed tokens/annotations, computed once and shared by every
// patch/lookup against one `abcText` — flattened[i] pairs 1:1 with bars[i].
function flattenBars(body, bars) {
  return bars.map((bar) => {
    const barText = body.slice(bar.start, bar.end);
    const { tokens, annotations } = scanBarTokens(barText);
    return {
      bar, barText, tokens, annotations,
    };
  });
}

function scopedFlattenedBars(abcText) {
  const split = splitHeaderBody(abcText);
  if (!split || !isSingleVoiceScoped(abcText, split)) return null;
  return { split, flattened: flattenBars(split.body, splitBars(split.body)) };
}

// Locates flat index `flatIdx` (the Kth real note/rest/chord token across
// the whole voice, in source order — see this file's own doc comment on why
// this, not abcjs's own {measure, note} pair, is what patches/notes are
// addressed by) within `flattened` (see flattenBars). Returns the owning
// bar's entry plus `noteInBar`, the bar-local index spliceForPatch already
// knows how to work with — or null when out of range.
function locateFlatToken(flattened, flatIdx) {
  let seen = 0;
  for (const entry of flattened) {
    if (flatIdx < seen + entry.tokens.length) {
      return { ...entry, noteInBar: flatIdx - seen };
    }
    seen += entry.tokens.length;
  }
  return null;
}

// Where a null flat index (chord/insert's own "no specific note" case)
// anchors: the very end of the tune's last bar *with real content* — splitBars
// always appends one final { start, end } tail span past the last barline
// (typically empty, e.g. right after a closing "|]"), which would otherwise
// look like "the last bar" and anchor past the music entirely.
function locateAppendPoint(flattened) {
  const withContent = flattened.filter((entry) => entry.tokens.length > 0);
  const target = withContent.at(-1) ?? flattened[0];
  return target ? { ...target, noteInBar: target.tokens.length } : null;
}

/*
  Resolves flat index `flatIndex` to what a UI module (songs/note-patches.js)
  needs before offering a pitch nudge: the owning bar's raw (unpatched) text
  and the specific token within it ({ pitchStart, pitchEnd, tie, rest,
  chord }, positions relative to that bar text — see scanBarTokens). Returns
  null when `abcText` has no K: line, the tune is out of V1's single-voice
  scope (see isSingleVoiceScoped), or `flatIndex` is past the last real
  note/rest in the tune.
*/
export function resolveFlatToken(abcText, flatIndex) {
  const scoped = scopedFlattenedBars(abcText);
  if (!scoped) return null;
  const located = locateFlatToken(scoped.flattened, flatIndex);
  return located ? { barText: located.barText, token: located.tokens[located.noteInBar] } : null;
}

export function applyPatchesToAbc(abcText, patches) {
  if (!patches || !patches.length) return abcText;
  const scoped = scopedFlattenedBars(abcText);
  if (!scoped) return abcText;
  const { split, flattened } = scoped;

  const [lnum, lden] = readUnit(abcText);
  const splices = [];
  for (const patch of patches) {
    const located = patch.note == null
      ? locateAppendPoint(flattened)
      : locateFlatToken(flattened, patch.note);
    if (!located) continue;
    const ctx = {
      tokens: located.tokens, annotations: located.annotations, barText: located.barText, lnum, lden,
    };
    const barLocalPatch = { ...patch, note: located.noteInBar };
    for (const s of spliceForPatch(barLocalPatch, ctx)) {
      splices.push({ start: located.bar.start + s.start, end: located.bar.start + s.end, text: s.text });
    }
  }

  if (!splices.length) return abcText;
  // Applied back-to-front so an earlier splice's start/end offsets (computed
  // against the untouched body) stay valid through every later splice.
  splices.sort((a, b) => b.start - a.start);
  let newBody = split.body;
  for (const s of splices) {
    newBody = newBody.slice(0, s.start) + s.text + newBody.slice(s.end);
  }
  return `${split.header.join("\n")}\n${split.kLine}\n${newBody}`;
}

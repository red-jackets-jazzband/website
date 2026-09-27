// Lints every ABC notation file in static/songs/ using abcjs's own tune
// parser - the same parser the /songs/ page uses to render a tune, run
// headlessly here (no DOM needed for parsing) so a broken or malformed
// transcription fails CI instead of only showing up as a blank/garbled staff
// discovered later in the browser. Four checks:
//
// 1. Parser warnings: unknown characters, malformed headers, bad note
//    syntax, ... - anything abcjs's own parser flags.
// 2. Bar length: every bar's notated duration (across ties, tuplets, broken
//    rhythm, voice overlays, chords) should add up to a full measure of the
//    tune's M: meter. abcjs's parser doesn't check this itself; a wrong beat
//    count is one of the most common real transcription slips (a dropped
//    rest, a mistyped note length) and is otherwise invisible until someone
//    notices the sheet or playback sounds off. Pickup (anacrusis) bars and a
//    tune/part's closing bar are legitimately allowed to run short, so only
//    an overfull bar, or an underfull *interior* bar, is flagged.
// 3. Chord placement and 4. beam grouping: see the doc comment above
//    findChordAndBeamIssues below.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ABCJS from "abcjs";

const SONGS_DIR = join(import.meta.dirname, "..", "static", "songs");
const DURATION_EPSILON = 1e-6;

function stripMarkup(text) {
  let result = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "<") {
      const close = text.indexOf(">", i);
      i = close === -1 ? text.length : close + 1;
    } else {
      result += text[i];
      i += 1;
    }
  }
  return result;
}

function charToLineCol(content, index) {
  const before = content.slice(0, index).split("\n");
  return `${before.length}:${before[before.length - 1].length + 1}`;
}

function formatBeats(n) {
  return String(Math.round(n * 1000) / 1000);
}

function newVoiceState() {
  return { acc: 0, tripletMultiplier: 1, pendingSectionStart: true, bars: [] };
}

function closePreviousBarForPart(state) {
  if (state.acc <= DURATION_EPSILON && state.bars.length > 0) {
    state.bars[state.bars.length - 1].exemptUnderfull = true;
  }
  state.pendingSectionStart = true;
}

function closeBar(state, el) {
  if (state.acc > DURATION_EPSILON) {
    state.bars.push({ acc: state.acc, startChar: el.startChar, exemptUnderfull: state.pendingSectionStart });
    state.pendingSectionStart = false;
  }
  state.acc = 0;
}

function accumulateNote(state, el) {
  const isSpacer = el.rest && el.rest.type === "spacer";
  if (typeof el.duration === "number" && !isSpacer) {
    state.acc += el.duration * state.tripletMultiplier;
  }
  if (el.endTriplet) state.tripletMultiplier = 1;
}

function accumulateVoice(state, voice) {
  for (const el of voice) {
    if (el.el_type === "overlay") {
      state.acc = 0;
      continue;
    }
    if (el.el_type === "part") {
      closePreviousBarForPart(state);
      continue;
    }
    if (el.startTriplet) state.tripletMultiplier = el.tripletMultiplier;
    if (el.el_type === "bar") {
      closeBar(state, el);
      continue;
    }
    accumulateNote(state, el);
  }
}

function collectVoiceStrands(tune) {
  const strands = new Map();
  for (const line of tune.lines) {
    if (!line.staff) continue;
    line.staff.forEach((staff, staffIndex) => {
      staff.voices.forEach((voice, voiceIndex) => {
        const key = `${staffIndex}-${voiceIndex}`;
        if (!strands.has(key)) strands.set(key, newVoiceState());
        accumulateVoice(strands.get(key), voice);
      });
    });
  }
  return strands;
}

function findBarLengthIssues(tune, content) {
  const barLength = tune.getBarLength();
  const expectedBeats = tune.getMeterFraction().num;
  const strands = collectVoiceStrands(tune);
  const issues = [];

  for (const state of strands.values()) {
    state.bars.forEach((bar, index) => {
      const isLast = index === state.bars.length - 1;
      const overfull = bar.acc > barLength + DURATION_EPSILON;
      const underfull = bar.acc < barLength - DURATION_EPSILON;
      if (!overfull && !(underfull && !bar.exemptUnderfull && !isLast)) return;
      const actualBeats = (bar.acc / barLength) * expectedBeats;
      issues.push(
        `Music Line:${charToLineCol(content, bar.startChar)}: Bar has ${formatBeats(actualBeats)} beats, ` +
          `expected ${expectedBeats}`,
      );
    });
  }
  return issues;
}

// 3. Chord placement: a chord shouldn't sit on the first half of a tie when
//    its own continuation lands exactly on the bar's downbeat or midpoint
//    (beat 1 or beat 3 in 4/4) - that's a chord symbol anticipating the beat
//    by whatever the tie-start's own duration is (often one eighth note)
//    instead of attaching to the note that actually falls on it; see
//    references/abc-style.md for the tie-split fix. This is deliberately
//    narrow: a chord elsewhere in the bar (beat 2, beat 4, three chords
//    sharing a bar, ...) is not flagged - plenty of real harmonic rhythm
//    (a cadential approach chord, a syncopated punch, a turnaround) legitimately
//    lands off that grid, and this check has no way to tell that apart from
//    a real mistake without the original chart. Only the tie-anticipation
//    shape is unambiguous: the chord and its rightful note are the same
//    sustained pitch, so moving the symbol changes nothing about the audio.
//    Also exempt: a chord attached to a `y` spacer - `y` is deliberately
//    excluded from a bar's counted duration (same as the bar-length check
//    above), so a chord printed on one isn't claiming a real timed onset at
//    all; it's a preview/lookahead annotation (the corpus already does
//    this, e.g. `"F"F8- "Bb7"yyy` previewing the chord after a tied
//    whole-bar note), not the kind of harmony change this rule checks.
// 4. Beam grouping: eighths (and shorter) should beam in runs of at most 4,
//    a run of exactly 4 only at the very start/end of the bar, and never
//    spanning the bar's halfway point. abcjs's own parser already resolves
//    beam grouping from the source's note-vs-whitespace layout (the same
//    startBeam/endBeam flags the live site's renderer uses), so this reuses
//    that instead of re-deriving groups from raw text.
//
// Both checks only make sense in a meter that splits evenly in half (4/4,
// 2/2, 2/4, 6/8, ... - an even numerator); they're skipped for an odd-num
// meter like 3/4 or 9/8, where there's no such thing as "beat 3". A beam
// group containing a tuplet note is skipped too - a tuplet forms its own
// bracketed rhythmic unit and isn't subject to the plain-eighths rule.

const MAX_BEAM_GROUP = 4;

function isRealChord(chordEntry) {
  return chordEntry.position === "default" || chordEntry.position === undefined;
}

function hasRealChord(el) {
  return Array.isArray(el.chord) && el.chord.some(isRealChord);
}

function newRhythmState() {
  return { acc: 0, tripletMultiplier: 1, elements: [] };
}

function isOnBeatGrid(start, meter) {
  const atStart = start < DURATION_EPSILON;
  const atMid = meter.checkMidpoint && Math.abs(start - meter.halfBar) < DURATION_EPSILON;
  return atStart || atMid;
}

function findTieContinuation(elements, index) {
  const pitch = elements[index].el.pitches && elements[index].el.pitches[0];
  if (!pitch || !pitch.startTie) return null;
  const next = elements[index + 1];
  const nextPitch = next && next.el.pitches && next.el.pitches[0];
  return nextPitch && nextPitch.endTie && nextPitch.name === pitch.name ? next : null;
}

function checkChordPlacement(elements, meter, content, issues) {
  elements.forEach((entry, index) => {
    if (!hasRealChord(entry.el)) return;
    if (entry.el.rest && entry.el.rest.type === "spacer") return;
    if (isOnBeatGrid(entry.start, meter)) return;
    const continuation = findTieContinuation(elements, index);
    if (!continuation || !isOnBeatGrid(continuation.start, meter)) return;

    const name = entry.el.chord.find(isRealChord).name;
    issues.push(
      `Music Line:${charToLineCol(content, entry.el.startChar)}: Chord "${name}" anticipates its tied ` +
        "continuation, which lands on the beat - move the chord there instead",
    );
  });
}

function computeBeamGroups(elements) {
  const groups = [];
  let i = 0;
  while (i < elements.length) {
    if (!elements[i].el.startBeam) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < elements.length && !elements[j].el.endBeam) j += 1;
    groups.push(elements.slice(i, j + 1));
    i = j + 1;
  }
  return groups;
}

function checkBeamGroups(groups, meter, content, issues) {
  for (const group of groups) {
    if (group.some((entry) => entry.el.tripletR || entry.el.startTriplet || entry.el.endTriplet)) continue;

    const first = group[0];
    const last = group[group.length - 1];
    if (group.length > MAX_BEAM_GROUP) {
      issues.push(
        `Music Line:${charToLineCol(content, first.el.startChar)}: Beam group of ${group.length} notes ` +
          `exceeds the max of ${MAX_BEAM_GROUP}`,
      );
      continue;
    }
    if (group.length === MAX_BEAM_GROUP) {
      const atBarStart = first.start < DURATION_EPSILON;
      const atBarEnd = Math.abs(last.end - meter.barLength) < DURATION_EPSILON;
      if (!atBarStart && !atBarEnd) {
        issues.push(
          `Music Line:${charToLineCol(content, first.el.startChar)}: A ${MAX_BEAM_GROUP}-note beam group ` +
            "should only appear at the very start or end of the bar",
        );
        continue;
      }
    }
    if (meter.checkMidpoint && first.start < meter.halfBar - DURATION_EPSILON && last.end > meter.halfBar + DURATION_EPSILON) {
      issues.push(
        `Music Line:${charToLineCol(content, first.el.startChar)}: Beam group spans the bar's halfway point`,
      );
    }
  }
}

function pushRhythmElement(state, el) {
  const isSpacer = el.rest && el.rest.type === "spacer";
  const duration = typeof el.duration === "number" && !isSpacer ? el.duration * state.tripletMultiplier : 0;
  state.elements.push({ el, start: state.acc, end: state.acc + duration });
  state.acc += duration;
}

function findChordAndBeamIssues(tune, content) {
  const barLength = tune.getBarLength();
  const meter = { barLength, halfBar: barLength / 2, checkMidpoint: tune.getMeterFraction().num % 2 === 0 };
  const issues = [];
  const strands = new Map();

  function flush(state) {
    const groups = computeBeamGroups(state.elements);
    checkChordPlacement(state.elements, meter, content, issues);
    checkBeamGroups(groups, meter, content, issues);
    state.elements = [];
    state.acc = 0;
  }

  for (const line of tune.lines) {
    if (!line.staff) continue;
    line.staff.forEach((staff, staffIndex) => {
      staff.voices.forEach((voice, voiceIndex) => {
        const key = `${staffIndex}-${voiceIndex}`;
        if (!strands.has(key)) strands.set(key, newRhythmState());
        const state = strands.get(key);
        for (const el of voice) {
          if (el.el_type === "overlay") {
            flush(state);
            continue;
          }
          if (el.el_type === "part") continue;
          if (el.startTriplet) state.tripletMultiplier = el.tripletMultiplier;
          if (el.el_type === "bar") {
            flush(state);
            continue;
          }
          if (el.el_type === "note") pushRhythmElement(state, el);
          if (el.endTriplet) state.tripletMultiplier = 1;
        }
      });
    });
  }
  for (const state of strands.values()) flush(state);
  return issues;
}

function lintFile(file) {
  const content = readFileSync(join(SONGS_DIR, file), "utf8");
  const tunes = ABCJS.parseOnly(content);
  return tunes.flatMap((tune) => [
    ...(tune.warnings || []).map(stripMarkup),
    ...findBarLengthIssues(tune, content),
    ...findChordAndBeamIssues(tune, content),
  ]);
}

const files = readdirSync(SONGS_DIR).filter((file) => file.endsWith(".abc")).sort();
let hasIssues = false;

for (const file of files) {
  const issues = lintFile(file);
  if (issues.length > 0) {
    hasIssues = true;
    console.error(`\n${file}`);
    for (const issue of issues) {
      console.error(`  ${issue}`);
    }
  }
}

if (hasIssues) {
  console.error("\nabc lint failed: issues found in the files above.");
  process.exit(1);
}

console.error(`abc lint passed: ${files.length} files, no issues.`);

// Lints every ABC notation file in static/songs/ using abcjs's own tune
// parser - the same parser the /songs/ page uses to render a tune, run
// headlessly here (no DOM needed for parsing) so a broken or malformed
// transcription fails CI instead of only showing up as a blank/garbled staff
// discovered later in the browser. Two checks:
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

function lintFile(file) {
  const content = readFileSync(join(SONGS_DIR, file), "utf8");
  const tunes = ABCJS.parseOnly(content);
  return tunes.flatMap((tune) => [
    ...(tune.warnings || []).map(stripMarkup),
    ...findBarLengthIssues(tune, content),
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

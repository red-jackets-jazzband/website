// House-style checks for a parsed ABC tune, on top of the structural checks in
// lint-abc.js. These encode the rules in docs/leadsheet-style-guide.md:
//
// 1. A part change (`P:`) must be preceded by a double bar (`||`, `|]`, a
//    repeat sign...), never a plain `|`.
// 2. The first bar of every part carries a chord, even when it repeats the
//    previous part's last chord.
// 3. The first bar of every printed line of music carries a chord (it is also
//    the first cell of a line in the chord table).
// 4. Everywhere else, a chord that is identical to the chord already in effect
//    is left out.
// 5. A pickup is written as just its notes: the first bar of a (single-voice)
//    tune must not be a full bar that starts with rests and ends on a double or
//    repeat bar line - drop the rests and let the first bar be short.
//
// Nothing is required before a tune's very first chord (a chordless intro or
// lead-in has no chord to restate, and inventing one is not the linter's job).
//
// All of it runs on abcjs's own parse of the tune, on the voice that carries
// the chords (the one with the most real chord symbols - a multi-voice chart
// usually only writes them once). A short first bar (a pickup) is allowed to
// have its chord on the following bar instead. A repeat sign or a 1st/2nd
// ending breaks the harmonic context, so a chord restated right after one is
// not flagged.

const DURATION_EPSILON = 1e-6;
// Anything below this isn't a real bar line: abcjs reports a plain `|` as
// bar_thin and everything else (`||`, `|]`, `:|`, ...) as another type.
const PLAIN_BAR = "bar_thin";

function isRealChord(chordEntry) {
  return chordEntry.position === "default" || chordEntry.position === undefined;
}

function realChords(el) {
  if (!Array.isArray(el.chord) || el.rest?.type === "spacer") return [];
  return el.chord.filter(isRealChord);
}

function breaksContext(barEl) {
  return Boolean(barEl) && (String(barEl.type).includes("repeat") || Boolean(barEl.startEnding));
}

function flattenStrands(tune) {
  const strands = new Map();
  for (const line of tune.lines) {
    if (!line.staff) continue;
    line.staff.forEach((staff, staffIndex) => {
      staff.voices.forEach((voice, voiceIndex) => {
        const key = `${staffIndex}-${voiceIndex}`;
        if (!strands.has(key)) strands.set(key, []);
        const items = strands.get(key);
        items.push({ kind: "line" });
        for (const el of voice) items.push({ kind: el.el_type, el });
      });
    });
  }
  return strands;
}

function countChords(items) {
  return items.reduce((total, item) => total + (item.kind === "note" ? realChords(item.el).length : 0), 0);
}

function pickChordStrand(strands) {
  let best = null;
  let bestCount = -1;
  for (const items of strands.values()) {
    const count = countChords(items);
    if (count > bestCount) {
      best = items;
      bestCount = count;
    }
  }
  return best || [];
}

function newBar(precededBy) {
  return { notes: [], acc: 0, precededBy, closedBy: null, lineStart: false, partStart: false };
}

function startBar(state, el) {
  state.lastBar = el;
  if (state.current.notes.length === 0) {
    state.current.precededBy = el;
    return;
  }
  state.current.closedBy = el;
  state.bars.push(state.current);
  state.current = newBar(el);
}

function startPart(state, el, findings) {
  state.pendingPart = true;
  const afterPlainBar = state.lastBar && state.lastBar.type === PLAIN_BAR;
  if (afterPlainBar && state.current.notes.length === 0 && state.bars.length > 0) {
    findings.push({ type: "plain-bar-before-part", at: el.startChar, bar: state.lastBar });
  }
}

function addNote(state, el) {
  const bar = state.current;
  if (bar.notes.length === 0) {
    bar.lineStart = state.pendingLine;
    bar.partStart = state.pendingPart;
    state.pendingLine = false;
    state.pendingPart = false;
  }
  if (el.startTriplet) state.tripletMultiplier = el.tripletMultiplier;
  if (typeof el.duration === "number" && el.rest?.type !== "spacer") {
    bar.acc += el.duration * state.tripletMultiplier;
  }
  if (el.endTriplet) state.tripletMultiplier = 1;
  bar.notes.push(el);
}

// Splits one voice into bars, tagging each with whether it opens a printed line
// or a part. Also reports every part marker that follows a plain bar line.
function splitBars(items, findings) {
  const state = {
    bars: [],
    current: newBar(null),
    lastBar: null,
    pendingLine: false,
    pendingPart: false,
    tripletMultiplier: 1,
  };
  for (const { kind, el } of items) {
    if (kind === "line") state.pendingLine = true;
    else if (kind === "part") startPart(state, el, findings);
    else if (kind === "bar") startBar(state, el);
    else if (kind === "note") addNote(state, el);
  }
  if (state.current.notes.length > 0) state.bars.push(state.current);
  return state.bars;
}

function hasChord(bar) {
  return bar.notes.some((el) => realChords(el).length > 0);
}

// The chord written most recently before bars[index], for a fixer to restate.
function chordInEffect(bars, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    for (let j = bars[i].notes.length - 1; j >= 0; j -= 1) {
      const chords = realChords(bars[i].notes[j]);
      if (chords.length > 0) return { el: bars[i].notes[j], index: chords.length - 1, name: chords[chords.length - 1].name };
    }
  }
  return null;
}

function checkRequiredChords(bars, barLength, findings) {
  bars.forEach((bar, index) => {
    if (!bar.partStart && !bar.lineStart) return;
    if (hasChord(bar)) return;
    // A pickup (short first bar) hands the chord to the bar that follows it.
    const underfull = bar.acc < barLength - DURATION_EPSILON;
    if (underfull && bars[index + 1] && hasChord(bars[index + 1])) return;
    const inEffect = chordInEffect(bars, index);
    if (!inEffect) return; // before the tune's first chord: nothing to restate
    findings.push({
      type: "missing-chord",
      at: bar.notes[0].startChar,
      scope: bar.partStart ? "part" : "line of music",
      el: bar.notes[0],
      inEffect,
    });
  });
}

function isSoundingRest(el) {
  return Boolean(el.rest) && el.rest.type !== "spacer";
}

function checkPickup(bars, barLength, findings) {
  const bar = bars[0];
  if (!bar || !bar.closedBy || bar.closedBy.type === PLAIN_BAR) return;
  if (Math.abs(bar.acc - barLength) > DURATION_EPSILON) return;
  const leading = [];
  for (const el of bar.notes) {
    if (!isSoundingRest(el)) break;
    leading.push(el);
  }
  const hasMusic = leading.length < bar.notes.length;
  if (leading.length === 0 || !hasMusic || leading.some((el) => realChords(el).length > 0)) return;
  findings.push({ type: "pickup-rests", at: leading[0].startChar, rests: leading });
}

function checkRepeatedChords(bars, findings) {
  let current = null;
  for (const bar of bars) {
    if (breaksContext(bar.precededBy)) current = null;
    let firstInBar = true;
    for (const el of bar.notes) {
      realChords(el).forEach((chord, chordIndex) => {
        const required = firstInBar && (bar.partStart || bar.lineStart);
        if (chord.name === current && !required) {
          findings.push({ type: "repeated-chord", at: el.startChar, name: chord.name, el, chordIndex });
        }
        current = chord.name;
        firstInBar = false;
      });
    }
  }
}

const MESSAGES = {
  "plain-bar-before-part": () => "Part change must be preceded by a double bar line (||), not |",
  "missing-chord": (f) => `First bar of a ${f.scope} has no chord symbol`,
  "pickup-rests": () => "Pickup is written with leading rests - drop them and let the first bar be short",
  "repeated-chord": (f) => `Chord "${f.name}" repeats the chord already in effect - leave it out`,
};

// Structured findings (with the abcjs elements involved), for tooling that
// wants to fix them; findStyleIssues turns the same list into lint messages.
export function findStyleFindings(tune) {
  const findings = [];
  const strands = flattenStrands(tune);
  const strand = pickChordStrand(strands);
  // A melody-only tune (no chord symbols anywhere) has nothing to place.
  if (countChords(strand) === 0) return findings;
  const bars = splitBars(strand, findings);
  // A multi-voice chart's first bar is a riff for every voice, not a pickup.
  if (strands.size === 1) checkPickup(bars, tune.getBarLength(), findings);
  checkRequiredChords(bars, tune.getBarLength(), findings);
  checkRepeatedChords(bars, findings);
  return findings;
}

export function findStyleIssues(tune, locate) {
  return findStyleFindings(tune).map((f) => `Music Line:${locate(f.at)}: ${MESSAGES[f.type](f)}`);
}

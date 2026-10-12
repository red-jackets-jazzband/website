/*
  The "Pulse (2 & 4)" layer's music: each bar of the first voice read as a
  rhythm, for drawing one rhythmic fingerprint per bar (after Fürst, Miller
  et al., "Augmenting Sheet Music with Rhythmic Fingerprints", 2020): a
  clock face where one turn is one bar, beat 1 at twelve o'clock, so in 4/4
  the backbeat — beats 2 and 4, where a trad band's banjo and snare lean —
  sits at three and nine o'clock.

    meterPulse(meter)     { barLength, beats, beatLength } for an abcjs
                          meter (whole notes), or null for one we can't
                          count (a complex 2+3/8, free time)
    ringLevel(length, beatLength)
                          which ring a note or rest of that length is drawn
                          on: 0 (innermost) two beats or more, 1 a beat, 2 a
                          half or third of a beat, 3 anything shorter — the
                          levels of the rhythm tree, long notes in the middle
    barRhythms(song)      one entry per bar of the first voice:
        { index, number, line, elements, events, barLength, beats,
          beatLength, onBeats, backbeats, kind, sameAs }
      events     [{ start, end, rest, tied, el }] in whole notes from the
                 bar's start (a pickup is right-aligned, so its notes sit at
                 the end of the clock, where they are played)
      onBeats    the beats (1-based) a note starts exactly on
      backbeats  the even beats (2 and 4 in 4/4) — what the glyph stresses
      kind       "backbeat"   a note starts on every backbeat
                 "syncopated" a note starts between beats and is held (or
                              tied) over the next beat, or over the bar line
                 "steady"     anything else with a note in it
                 "rest"       no note at all
      sameAs     the index of the first earlier bar with exactly the same
                 rhythm, or null — "same rhythm as bar 3"
    fingerprintArcs(bar)  [{ ring, from, to, type, backbeat }]: the arcs to
                          draw, from/to as fractions of the bar (0..1), type
                          "note" | "tie" (a tied continuation) | "rest";
                          `backbeat` marks a note that starts on beat 2 or 4
    describeBar(bar, bars) the bar's rhythm in words, for the tooltip

  Only durations and positions are read, never pitches, so a transposed
  sheet gives exactly the same fingerprints. Every simple meter counts in
  quarters (2/2 and C| too: a trad band's backbeat is still the second and
  fourth quarter of a cut-time bar); x/8 in threes counts dotted quarters.
*/
import { listOf, tl } from "../core/i18n.js";

const EPS = 1e-6;
// Signature grid: 96 ticks to a whole note (catches 32nds and triplets).
const TICKS = 96;

function meterNumbers(meter) {
  if (!meter) return null;
  if (meter.type === "common_time" || meter.type === "cut_time") return { num: 4, den: 4 };
  const v = meter.value && meter.value[0]; // NOSONAR
  if (!v) return null;
  const num = Number(v.num);
  const den = Number(v.den);
  if (!Number.isInteger(num) || !Number.isInteger(den) || num <= 0 || den <= 0) return null;
  return { num, den };
}

export function meterPulse(meter) {
  const m = meterNumbers(meter);
  if (m === null) return null;
  const barLength = m.num / m.den;
  if (m.den === 8 && m.num > 3 && m.num % 3 === 0) return { barLength, beats: m.num / 3, beatLength: 3 / 8 };
  if (m.den <= 4) return { barLength, beats: Math.round(barLength * 4), beatLength: 1 / 4 };
  return { barLength, beats: m.num, beatLength: 1 / m.den };
}

export function ringLevel(length, beatLength) {
  const beats = length / beatLength;
  if (beats >= 2 - EPS) return 0;
  if (beats >= 1 - EPS) return 1;
  if (beats >= 1 / 3 - EPS) return 2;
  return 3;
}

function isTiedInto(el) {
  return Boolean(el.pitches && el.pitches.some((p) => p.endTie));
}

function tiesOut(el) {
  return Boolean(el.pitches && el.pitches.some((p) => p.startTie));
}

// The bar being collected while walking the voice.
function newBar(pulse, line) {
  return { line, elements: [], events: [], time: 0, pulse, overlay: false };
}

function addNote(bar, el, multiplier) {
  if (bar.overlay) return; // a voice overlay (&) is a second lane, not more time
  const length = (el.duration || 0) * multiplier;
  bar.elements.push(el);
  if (length <= 0) return;
  bar.events.push({ start: bar.time, end: bar.time + length, rest: Boolean(el.rest), tied: !el.rest && isTiedInto(el), el });
  bar.time += length;
}

// Collect the first voice's bars: [{ line, elements, events, time, pulse }].
function collectBars(song) {
  const bars = [];
  let pulse = null;
  let bar = null;
  let multiplier = 1;
  const flush = () => {
    if (bar && bar.events.length > 0 && bar.pulse) bars.push(bar);
    bar = null;
  };
  song.lines.forEach((line, lineIndex) => {
    const staff = line.staff && line.staff[0]; // NOSONAR
    if (!staff || !staff.voices) return; // NOSONAR
    pulse = meterPulse(staff.meter) || pulse;
    (staff.voices[0] || []).forEach((el) => {
      if (el.el_type === "meter") {
        flush();
        pulse = meterPulse(el) || pulse;
      } else if (el.el_type === "bar") {
        flush();
      } else if (el.el_type === "overlay") {
        if (bar) bar.overlay = true;
      } else if (el.el_type === "note") {
        if (!bar) bar = newBar(pulse, lineIndex);
        if (el.startTriplet) multiplier = el.tripletMultiplier || 1;
        addNote(bar, el, multiplier);
        if (el.endTriplet) multiplier = 1;
      }
    });
  });
  flush();
  return bars;
}

function shift(events, by) {
  return by > EPS ? events.map((e) => ({ ...e, start: e.start + by, end: e.end + by })) : events;
}

function isOnBeat(time, beatLength) {
  const beats = time / beatLength;
  return Math.abs(beats - Math.round(beats)) < EPS;
}

// When the note starting at events[i] stops sounding: its tied
// continuations in the bar count, and Infinity if it's still tied at the
// bar line (an anticipation of the next bar).
function soundingEnd(events, i) {
  let j = i;
  while (j + 1 < events.length && events[j + 1].tied) j += 1;
  return j === events.length - 1 && tiesOut(events[j].el) ? Infinity : events[j].end;
}

function isSyncopation(events, i, beatLength) {
  const e = events[i];
  if (e.rest || e.tied || isOnBeat(e.start, beatLength)) return false;
  const nextBeat = Math.ceil(e.start / beatLength - EPS) * beatLength;
  return soundingEnd(events, i) > nextBeat + EPS;
}

function classify(bar) {
  const { events, beatLength, beats } = bar;
  const onBeats = [];
  events.forEach((e) => {
    if (!e.rest && !e.tied && isOnBeat(e.start, beatLength)) onBeats.push(Math.round(e.start / beatLength) + 1);
  });
  const backbeats = [];
  for (let b = 2; b <= beats; b += 2) backbeats.push(b);
  let kind = "steady";
  if (events.every((e) => e.rest)) kind = "rest";
  else if (events.some((_e, i) => isSyncopation(events, i, beatLength))) kind = "syncopated";
  else if (backbeats.length > 0 && backbeats.every((b) => onBeats.includes(b))) kind = "backbeat";
  return { onBeats, backbeats, kind };
}

function kindMark(e) {
  if (e.rest) return "r";
  return e.tied ? "t" : "n";
}

function eventSignature(e) {
  return `${Math.round(e.start * TICKS)}+${Math.round((e.end - e.start) * TICKS)}${kindMark(e)}`;
}

function signatureOf(bar) {
  return `${Math.round(bar.barLength * TICKS)}:${bar.events.map(eventSignature).join(",")}`;
}

export function barRhythms(song) {
  const collected = collectBars(song);
  const seen = new Map();
  let number = 0;
  return collected.map((raw, index) => {
    const { barLength, beats, beatLength } = raw.pulse;
    // A short first bar is a pickup: it ends on the bar line, so its notes
    // belong at the end of the clock. It's bar 0, as musicians count.
    const pickup = index === 0 && raw.time < barLength - EPS;
    if (!pickup) number += 1;
    const bar = {
      index,
      number: pickup ? 0 : number,
      line: raw.line,
      elements: raw.elements,
      events: pickup ? shift(raw.events, barLength - raw.time) : raw.events,
      barLength, beats, beatLength,
    };
    Object.assign(bar, classify(bar));
    const signature = signatureOf(bar);
    bar.sameAs = seen.has(signature) ? seen.get(signature) : null;
    if (!seen.has(signature)) seen.set(signature, index);
    return bar;
  });
}

export function fingerprintArcs(bar) {
  const { barLength, beatLength, backbeats } = bar;
  return bar.events
    .filter((e) => e.start < barLength - EPS)
    .map((e) => {
      const end = Math.min(e.end, barLength);
      let type = "note";
      if (e.rest) type = "rest";
      else if (e.tied) type = "tie";
      const beat = isOnBeat(e.start, beatLength) ? Math.round(e.start / beatLength) + 1 : null;
      return {
        ring: ringLevel(e.end - e.start, beatLength),
        from: e.start / barLength,
        to: end / barLength,
        type,
        backbeat: type === "note" && beat !== null && backbeats.includes(beat),
      };
    });
}

function barName(bar) {
  return bar.number === 0 ? tl("pulse_pickup", "Pickup") : tl("pulse_bar", "Bar {n}", { n: bar.number });
}

function kindText(bar) {
  if (bar.kind === "backbeat") return tl("pulse_kind_backbeat", "Lands on the 2 & 4 backbeat.");
  if (bar.kind === "syncopated") return tl("pulse_kind_syncopated", "Syncopated: a note between the beats is held over the next beat.");
  if (bar.kind === "rest") return tl("pulse_kind_rest", "All rest: keep feeling 2 & 4.");
  return tl("pulse_kind_steady", "Feel the band's 2 & 4 under it.");
}

export function describeBar(bar, bars) {
  const parts = [barName(bar)];
  const beats = bar.onBeats.map(String);
  if (beats.length > 0) parts.push(tl("pulse_on_beats", "notes on beat {beats}", { beats: listOf(beats, "and") }));
  else if (bar.kind !== "rest") parts.push(tl("pulse_off_beats", "no note on a beat"));
  let text = `${parts.join(": ")}. ${kindText(bar)}`;
  const same = bar.sameAs === null ? null : bars[bar.sameAs];
  if (same && same.number > 0) text += ` ${tl("pulse_same_as", "Same rhythm as bar {n}.", { n: same.number })}`;
  return text;
}

/*
  Draws the "Pulse (2 & 4)" layer (lib/music/pulse.js) after ABCjs has
  engraved the sheet: a small rhythmic fingerprint under every bar — a clock
  face where one turn is the bar, beat 1 at twelve o'clock. Each note and
  rest is an arc from where it starts to where it stops, on the ring for its
  length (long notes inside, short ones outside); rests are pale, a tied
  continuation is lighter than the note it holds. The backbeat — beats 2 and
  4, three and nine o'clock — is always there as a gold slice and a gold
  dot, and a note that starts on it is drawn gold too, so a run of bars that
  hit 2 & 4 reads as a run of matching faces. The face's rim says the bar's
  kind: gold for "lands on 2 & 4", magenta for syncopated.

  Each printed line's svg is grown downward to make a row for its glyphs
  (split.css sizes a line's svg from its viewBox, so the line just gets
  taller; the music isn't shrunk).
  Nothing goes into the ABC, so nothing is played.

  Hovering a glyph lights up its bar's notes and shows a tooltip (an svg
  <title>) describing the rhythm; a click (a tap) keeps them lit.
  followPlayhead/stopPlayhead are fed by the audio player (through
  ctx.layers): the bar being played gets a gold rim and its 2 & 4 dots flash
  in time, one bar per turn.
*/
import { barRhythms, describeBar, fingerprintArcs } from "../../../lib/music/pulse.js";
import { arcPath, clockPoint, fingerprintRings, sectorPath } from "../../../lib/music/layer-geometry.js";
import { bboxOf, noteGroup, svgEl } from "./svg.js";

const RINGS = 4;
const MIN_RADIUS = 9;
const MAX_RADIUS = 20;
// Space kept between neighbouring glyphs, and above/below the row.
const SIDE_GAP = 3;
const ROW_GAP = 4;
// Gap left at the end of each arc, as a share of the bar, so onsets show.
const ARC_GAP = 0.012;

const HILITE = "rj-pulse-hilite";
const PLAYING = "is-playing";

// note node -> { glyph, from }: what the playhead lights up.
let byNode = new WeakMap();
let current = null;
let pinned = null;

function barGroups(bar) {
  return bar.elements.map(noteGroup).filter(Boolean);
}

// { svg, left, right } of a bar's drawn notes, or null when not laid out.
function barExtent(bar) {
  const groups = barGroups(bar);
  const boxes = groups.map(bboxOf).filter((box) => box && box.width > 0);
  const svg = groups.length > 0 ? groups[0].ownerSVGElement : null;
  if (!svg || boxes.length === 0) return null;
  return {
    svg,
    left: Math.min(...boxes.map((b) => b.x)),
    right: Math.max(...boxes.map((b) => b.x + b.width)),
  };
}

// One radius for the whole sheet: as big as the tightest bar allows.
function sheetRadius(placed) {
  let room = MAX_RADIUS;
  placed.forEach((p, i) => {
    const next = placed[i + 1];
    if (next && next.svg === p.svg) room = Math.min(room, (next.left - p.left) / 2 - SIDE_GAP);
  });
  return Math.max(MIN_RADIUS, room);
}

// Grow each svg downward by one glyph row; returns svg -> the row's centre y.
function makeRows(placed, radius) {
  const rows = new Map();
  placed.forEach(({ svg }) => {
    if (rows.has(svg)) return;
    const view = svg.viewBox && svg.viewBox.baseVal; // NOSONAR
    if (!view || view.width === 0) return;
    const bottom = view.y + view.height;
    const height = view.height + 2 * (radius + ROW_GAP);
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${height}`);
    rows.set(svg, bottom + ROW_GAP + radius);
  });
  return rows;
}

function drawFace(glyph, bar, cx, cy, radius) {
  glyph.append(svgEl("circle", { class: "rj-pulse-face", cx, cy, r: radius + 1 }));
  bar.backbeats.forEach((beat) => {
    const from = (beat - 1) / bar.beats;
    glyph.append(svgEl("path", { class: "rj-pulse-slice", d: sectorPath(cx, cy, radius, from, from + 1 / bar.beats) }));
  });
  fingerprintRings(radius, RINGS).radii.forEach((r) => {
    glyph.append(svgEl("circle", { class: "rj-pulse-guide", cx, cy, r }));
  });
}

function drawArcs(glyph, bar, cx, cy, radius) {
  const { width, radii } = fingerprintRings(radius, RINGS);
  fingerprintArcs(bar).forEach((arc) => {
    const to = Math.max(arc.from + ARC_GAP / 2, arc.to - ARC_GAP);
    const classes = ["rj-pulse-arc", `rj-pulse-arc--${arc.type}`];
    if (arc.backbeat) classes.push("rj-pulse-arc--back");
    glyph.append(svgEl("path", {
      class: classes.join(" "),
      d: arcPath(cx, cy, radii[arc.ring], arc.from, to),
      "stroke-width": Math.round(width * (arc.backbeat ? 0.95 : 0.75) * 100) / 100,
    }));
  });
}

function drawBeats(glyph, bar, cx, cy, radius) {
  for (let beat = 1; beat <= bar.beats; beat += 1) {
    const at = (beat - 1) / bar.beats;
    const point = clockPoint(cx, cy, radius + 1, at);
    const back = bar.backbeats.includes(beat);
    glyph.append(svgEl("circle", {
      class: back ? "rj-pulse-beat rj-pulse-beat--back" : "rj-pulse-beat",
      cx: point.x, cy: point.y, r: back ? 1.9 : 1,
      "data-at": at,
    }));
  }
}

function setHilite(bar, on) {
  barGroups(bar).forEach((group) => group.classList.toggle(HILITE, on));
}

function wireHover(glyph, bar) {
  glyph.addEventListener("mouseenter", () => setHilite(bar, true));
  glyph.addEventListener("mouseleave", () => {
    if (pinned === null || pinned.glyph !== glyph) setHilite(bar, false);
  });
  glyph.addEventListener("click", () => {
    const was = pinned;
    if (was) {
      setHilite(was.bar, false);
      was.glyph.classList.remove("is-pinned");
    }
    pinned = was && was.glyph === glyph ? null : { glyph, bar };
    if (pinned) {
      setHilite(bar, true);
      glyph.classList.add("is-pinned");
    }
  });
}

function register(glyph, bar) {
  bar.events.forEach((event) => {
    const set = event.el.abselem && event.el.abselem.elemset; // NOSONAR
    (set || []).forEach((node) => byNode.set(node, { glyph, from: event.start / bar.barLength }));
  });
}

function drawGlyph(bar, bars, extent, cy, radius) {
  const cx = Math.round(((extent.left + extent.right) / 2) * 100) / 100;
  const label = describeBar(bar, bars);
  const glyph = svgEl("g", {
    class: `rj-pulse rj-pulse--${bar.kind}`,
    role: "img",
    "aria-label": label,
    "data-bar": bar.number,
  });
  const title = svgEl("title", {});
  title.textContent = label;
  glyph.append(title);
  drawFace(glyph, bar, cx, cy, radius);
  drawArcs(glyph, bar, cx, cy, radius);
  drawBeats(glyph, bar, cx, cy, radius);
  wireHover(glyph, bar);
  register(glyph, bar);
  extent.svg.append(glyph);
}

export function drawPulse(visualObj) {
  byNode = new WeakMap();
  current = null;
  pinned = null;
  const bars = barRhythms(visualObj);
  const placed = [];
  bars.forEach((bar) => {
    const extent = barExtent(bar);
    if (extent) placed.push({ ...extent, bar });
  });
  if (placed.length === 0) return;
  const radius = sheetRadius(placed);
  const rows = makeRows(placed, radius);
  placed.forEach((p) => {
    if (rows.has(p.svg)) drawGlyph(p.bar, bars, p, rows.get(p.svg), radius);
  });
}

function startPulse(glyph, from, msPerMeasure) {
  glyph.querySelectorAll(".rj-pulse-beat--back").forEach((dot) => {
    const at = Number(dot.getAttribute("data-at"));
    const delay = (((at - from) % 1) + 1) % 1;
    dot.style.animationDuration = `${Math.round(msPerMeasure)}ms`;
    dot.style.animationDelay = `${Math.round(delay * msPerMeasure)}ms`;
  });
  glyph.classList.add(PLAYING);
}

/*
  The audio player's play cursor moved onto `nodes` (the svg nodes of the
  note now sounding). When that's a new bar, its glyph takes over the gold
  rim, and its 2 & 4 dots start flashing a bar (msPerMeasure) apart, timed
  from where in the bar the note falls.
*/
export function followPlayhead(nodes, msPerMeasure) {
  const hit = (nodes || []).map((node) => byNode.get(node)).find(Boolean);
  if (!hit || (current && current.glyph === hit.glyph)) return;
  stopPlayhead();
  if (!hit.glyph.isConnected) return;
  current = hit;
  if (msPerMeasure > 0) startPulse(hit.glyph, hit.from, msPerMeasure);
  else hit.glyph.classList.add(PLAYING);
}

export function stopPlayhead() {
  if (current) current.glyph.classList.remove(PLAYING);
  current = null;
}

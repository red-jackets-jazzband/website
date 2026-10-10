/*
  What the Layers panel's switches add to the engraved sheet beyond the ABC
  annotations lib/music/layers.js already put into the text (ABCjs places
  and spaces those itself):

  - a named progression's label ("Salty Dog") gets a highlighter band behind
    it, running over every bar of the progression on that line, so you see
    at a glance where it starts and stops — each name in its own warm
    shade;
  - fingering numbers get their own class, so split.css sets them upright
    and bold instead of the italic annotation face.

  Called by sheet.js's paint() right after ABCjs draws, for the live sheet
  and a booklet alike (a booklet's plan simply has no layers on).
*/
import { CONTINUED } from "../../lib/music/layers.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const FINGERING_TEXT = /^[0-7]{1,3}$/;
const BAND_PAD_X = 6;
const BAND_PAD_Y = 2;
// split.css's rj-layer-prog--0 .. --4: amber, apricot, rose, butter, clay.
const BAND_SHADES = 5;

// The tune's first voice, in order, across every line: { el, line }.
function melodyNotes(visualObj) {
  const notes = [];
  (visualObj.lines || []).forEach((line, lineIndex) => {
    const staff = line.staff && line.staff[0];
    if (!staff || !staff.voices) return;
    (staff.voices[0] || []).forEach((el) => {
      if (el.el_type === "note") notes.push({ el, line: lineIndex });
    });
  });
  return notes;
}

function noteGroup(el) {
  return el.abselem && el.abselem.elemset ? el.abselem.elemset[0] : null;
}

// The progression's label among the annotations drawn with `el`.
function labelText(el, label) {
  const group = noteGroup(el);
  if (!group) return null;
  const texts = [...group.querySelectorAll(".abcjs-annotation")];
  return texts.find((t) => t.textContent.trim() === label) || null;
}

function bboxOf(node) {
  try {
    return node.getBBox();
  } catch {
    return null; // not laid out (jsdom, a hidden container)
  }
}

// One line's stretch of a progression: a rounded band behind its label,
// from the first note's left edge to the last note's right edge.
function drawBand(run, label, shade) {
  const first = run[0].el;
  const last = run[run.length - 1].el;
  const text = labelText(first, label);
  if (!text) return;
  text.classList.add("rj-layer-prog-label", shade);
  if (typeof text.getBBox !== "function") return;
  const box = bboxOf(text);
  const svg = text.ownerSVGElement;
  if (!box || !svg || !first.abselem || !last.abselem) return;
  const x1 = Math.min(first.abselem.x, box.x) - BAND_PAD_X;
  const x2 = Math.max(last.abselem.x + (last.abselem.w || 0), box.x + box.width) + BAND_PAD_X;
  const band = document.createElementNS(SVG_NS, "rect");
  band.setAttribute("class", `rj-layer-prog-band ${shade}`);
  band.setAttribute("x", String(x1));
  band.setAttribute("y", String(box.y - BAND_PAD_Y));
  band.setAttribute("width", String(x2 - x1));
  band.setAttribute("height", String(box.height + 2 * BAND_PAD_Y));
  band.setAttribute("rx", "4");
  // First in the svg, so the notation draws over it.
  svg.insertBefore(band, svg.firstChild);
}

/*
  One shade per progression *name*, in order of first appearance — the same
  idea as the form strip's arrows (sheet.js's stepShades): every Salty Dog
  on the page wears the same tone, a Georgia next to it a different one.
*/
export function progressionShades(progressions) {
  const names = [];
  return progressions.map((match) => {
    if (!names.includes(match.name)) names.push(match.name);
    return `rj-layer-prog--${names.indexOf(match.name) % BAND_SHADES}`;
  });
}

function drawProgressionBands(visualObj, progressions) {
  const notes = melodyNotes(visualObj);
  const shades = progressionShades(progressions);
  progressions.forEach((match, k) => {
    const runs = [];
    notes.slice(match.startNote, match.endNote).forEach((note) => {
      const run = runs[runs.length - 1];
      if (run && run[0].line === note.line) run.push(note);
      else runs.push([note]);
    });
    runs.forEach((run, i) => drawBand(run, i === 0 ? match.name : CONTINUED + match.name, shades[k]));
  });
}

function styleFingerings(notationEl) {
  notationEl.querySelectorAll(".abcjs-annotation").forEach((text) => {
    if (FINGERING_TEXT.test(text.textContent.trim())) text.classList.add("rj-layer-fingering");
  });
}

export function decorateLayers(notationEl, visualObj, plan) {
  if (!notationEl || !visualObj) return;
  if (plan.progressions && plan.progressions.length > 0) drawProgressionBands(visualObj, plan.progressions);
  if (plan.layersApplied && plan.layersApplied.includes("fingerings")) styleFingerings(notationEl);
}

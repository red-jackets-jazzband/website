import { test } from "node:test";
import assert from "node:assert/strict";
import ABCJS from "abcjs";
import { mountSvg } from "../../../../../tests/helpers/svg-layout.js";
import { drawPulse, followPlayhead, stopPlayhead } from "./pulse.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// The tune parsed, each note given a measurable group in the svg (laid out
// 30 units apart, 12 wide), as ABCjs would have drawn it.
function setup(body) {
  const mounted = mountSvg("", { viewBox: { x: 0, y: 0, width: 1000, height: 100 } });
  const { svg, page } = mounted;
  const tune = ABCJS.parseOnly(`X:1\nM:C\nL:1/8\nK:F\n${body}\n`)[0];
  let x = 20;
  tune.lines.forEach((line) => line.staff[0].voices[0].forEach((el) => {
    if (el.el_type !== "note") return;
    const group = page.document.createElementNS(SVG_NS, "g");
    group.dataset.box = `${x},20,12,30`;
    group.append(page.document.createElementNS(SVG_NS, "path"));
    svg.append(group);
    el.abselem = { elemset: [group] };
    x += 30;
  }));
  return { ...mounted, tune };
}

test("one glyph per bar, under the line, in a row the svg grows to hold", () => {
  const { page, svg, tune } = setup("F2 A2 c2 A2 | F A3 c4 |");
  try {
    drawPulse(tune);
    const glyphs = [...svg.querySelectorAll(".rj-pulse")];
    assert.equal(glyphs.length, 2);
    assert.ok(glyphs[0].classList.contains("rj-pulse--backbeat"));
    assert.ok(glyphs[1].classList.contains("rj-pulse--syncopated"));
    const view = svg.viewBox.baseVal;
    assert.ok(view.height > 100);
    const face = glyphs[0].querySelector(".rj-pulse-face");
    assert.ok(Number(face.getAttribute("cy")) > 100);
    assert.match(glyphs[0].querySelector("title").textContent, /^Bar 1: notes on beat 1, 2, 3 and 4\./);
    assert.equal(glyphs[0].getAttribute("aria-label"), glyphs[0].querySelector("title").textContent);
  } finally {
    page.cleanup();
  }
});

test("beats 2 and 4 get the gold slices and dots; a note on them a gold arc", () => {
  const { page, svg, tune } = setup("F2 A2 c2 A2 |");
  try {
    drawPulse(tune);
    assert.equal(svg.querySelectorAll(".rj-pulse-slice").length, 2);
    assert.equal(svg.querySelectorAll(".rj-pulse-beat").length, 4);
    assert.deepEqual([...svg.querySelectorAll(".rj-pulse-beat--back")].map((d) => d.getAttribute("data-at")), ["0.25", "0.75"]);
    assert.equal(svg.querySelectorAll(".rj-pulse-arc").length, 4);
    assert.equal(svg.querySelectorAll(".rj-pulse-arc--back").length, 2);
  } finally {
    page.cleanup();
  }
});

test("hovering lights up the bar's notes; a click keeps them lit", () => {
  const { page, svg, tune } = setup("F2 A2 c2 A2 | F8 |");
  try {
    drawPulse(tune);
    const [first] = svg.querySelectorAll(".rj-pulse");
    const hover = (type) => first.dispatchEvent(new page.window.MouseEvent(type));
    hover("mouseenter");
    assert.equal(svg.querySelectorAll(".rj-pulse-hilite").length, 4);
    hover("mouseleave");
    assert.equal(svg.querySelectorAll(".rj-pulse-hilite").length, 0);
    first.dispatchEvent(new page.window.MouseEvent("click"));
    hover("mouseleave");
    assert.equal(svg.querySelectorAll(".rj-pulse-hilite").length, 4);
    assert.ok(first.classList.contains("is-pinned"));
    first.dispatchEvent(new page.window.MouseEvent("click"));
    assert.equal(svg.querySelectorAll(".rj-pulse-hilite").length, 0);
  } finally {
    page.cleanup();
  }
});

test("the playhead lights the bar it's in and times the 2 & 4 flashes from its note", () => {
  const { page, svg, tune } = setup("F2 A2 c2 A2 | F8 |");
  try {
    drawPulse(tune);
    const [first, second] = svg.querySelectorAll(".rj-pulse");
    const notes = [...svg.querySelectorAll("g[data-box]")];
    followPlayhead([notes[1]], 2000); // beat 2 of bar 1
    assert.ok(first.classList.contains("is-playing"));
    const dots = [...first.querySelectorAll(".rj-pulse-beat--back")];
    assert.deepEqual(dots.map((d) => d.style.animationDelay), ["0ms", "1000ms"]);
    assert.equal(dots[0].style.animationDuration, "2000ms");
    followPlayhead([notes[4]], 2000);
    assert.ok(!first.classList.contains("is-playing"));
    assert.ok(second.classList.contains("is-playing"));
    stopPlayhead();
    assert.equal(svg.querySelectorAll(".is-playing").length, 0);
  } finally {
    page.cleanup();
  }
});

test("nothing is drawn when the sheet can't be measured", () => {
  const { page, svg, tune } = setup("F2 A2 c2 A2 |");
  try {
    svg.querySelectorAll("g[data-box]").forEach((g) => g.removeAttribute("data-box"));
    drawPulse(tune);
    assert.equal(svg.querySelectorAll(".rj-pulse").length, 0);
    assert.equal(svg.viewBox.baseVal.height, 100);
  } finally {
    page.cleanup();
  }
});

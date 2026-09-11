import { test } from "node:test";
import assert from "node:assert/strict";
import { mountPage } from "../../../tests/helpers/dom.js";
import { buildTitlePage, fitTitlePage, fitTextWidth } from "./setlist-titlepage.js";

function inDom(fn) {
  const page = mountPage();
  try {
    return fn();
  } finally {
    page.cleanup();
  }
}

test("buildTitlePage renders the N.O.A.D.S. branding for the original songbook", () => {
  inDom(() => {
    const page = buildTitlePage({ isNoads: true, setlistName: "Anything", instrumentText: "bb clarinet" });
    assert.equal(page.className, "setlist-titlepage");
    assert.equal(page.querySelector(".setlist-titlepage-title").textContent, "N.O.A.D.S.");
    assert.equal(page.querySelector(".setlist-titlepage-sub").textContent, "songbook");
    assert.equal(page.querySelector(".setlist-titlepage-name").textContent, "streetclassics");
    assert.equal(page.querySelector(".setlist-titlepage-url").textContent, "www.redjackets.nl");
    assert.equal(page.querySelector(".setlist-titlepage-instrument").textContent, "bb clarinet");
    const image = page.querySelector("image");
    assert.equal(image.getAttribute("href"), "/images/songbook_cover_bg.svg");
    assert.equal(image.getAttribute("xlink:href"), "/images/songbook_cover_bg.svg");
  });
});

test("buildTitlePage swaps in generic branding for any other setlist", () => {
  inDom(() => {
    const page = buildTitlePage({ isNoads: false, setlistName: "Summer Wedding 2026", instrumentText: "trumpet" });
    assert.equal(page.querySelector(".setlist-titlepage-title").textContent, "Red Jackets");
    assert.equal(page.querySelector(".setlist-titlepage-sub").textContent, "songbook");
    assert.equal(page.querySelector(".setlist-titlepage-name").textContent, "Summer Wedding 2026");
  });
});

test("fitTitlePage fits the title/name text of an attached page (patched getBBox)", () => {
  inDom(() => {
    const page = buildTitlePage({ isNoads: false, setlistName: "Setlist 2026", instrumentText: "trumpet" });
    document.body.append(page); // must be attached before fitting — see buildTitlePage's own doc comment
    const title = page.querySelector(".setlist-titlepage-title");
    const name = page.querySelector(".setlist-titlepage-name");
    title.getBBox = () => ({ width: 250 });
    name.getBBox = () => ({ width: 150 });
    fitTitlePage(page);
    assert.notEqual(title.getAttribute("font-size"), "64.419");
    assert.notEqual(name.getAttribute("font-size"), "38.197");
  });
});

test("fitTitlePage is a no-op (keeps the placeholder size) before the page is attached", () => {
  inDom(() => {
    // mountPage's default getBBox stub reports a zero-width box, the same
    // shape a real browser reports for a not-yet-attached SVG node.
    const page = buildTitlePage({ isNoads: true, setlistName: "x", instrumentText: "" });
    fitTitlePage(page);
    assert.equal(page.querySelector(".setlist-titlepage-title").getAttribute("font-size"), "64.419");
    assert.equal(page.querySelector(".setlist-titlepage-name").getAttribute("font-size"), "38.197");
  });
});

test("fitTextWidth shrinks font-size proportionally to hit the target width", () => {
  const el = {
    attrs: { "font-size": "64.419" },
    getBBox: () => ({ width: 300 }),
    getAttribute(name) { return this.attrs[name]; },
    setAttribute(name, value) { this.attrs[name] = value; },
  };
  fitTextWidth(el, 150, 1000);
  // 150/300 * 64.419 = 32.2095
  assert.equal(Number.parseFloat(el.getAttribute("font-size")), 32.2095);
});

test("fitTextWidth caps the result so a very short string can't blow up", () => {
  const el = {
    attrs: { "font-size": "64.419" },
    getBBox: () => ({ width: 10 }), // tiny rendered width -> huge naive fit
    getAttribute(name) { return this.attrs[name]; },
    setAttribute(name, value) { this.attrs[name] = value; },
  };
  fitTextWidth(el, 188.6, 75);
  assert.equal(Number.parseFloat(el.getAttribute("font-size")), 75);
});

test("fitTextWidth leaves the placeholder size alone when not laid out", () => {
  const throwing = {
    getBBox() { throw new Error("not laid out"); },
    getAttribute: () => "64.419",
    setAttribute() { throw new Error("must not be called"); },
  };
  assert.doesNotThrow(() => fitTextWidth(throwing, 188.6, 75));

  const zeroWidth = {
    getBBox: () => ({ width: 0 }),
    getAttribute: () => "64.419",
    setAttribute() { throw new Error("must not be called"); },
  };
  assert.doesNotThrow(() => fitTextWidth(zeroWidth, 188.6, 75));
});

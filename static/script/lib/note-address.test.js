import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { parseAbcClasses, flatNoteIndex, findNoteElementByFlatIndex } from "./note-address.js";

test("parseAbcClasses reads all four numbers off a real abcjs class string", () => {
  assert.deepEqual(
    parseAbcClasses("abcjs-note abcjs-l1 abcjs-m2 abcjs-mm7 abcjs-v0 abcjs-n3"),
    {
      line: 1, measureInLine: 2, measure: 7, note: 3, voice: 0,
    },
  );
});

test("parseAbcClasses doesn't confuse abcjs-m with abcjs-mm (or vice versa)", () => {
  // A degenerate but plausible case: line 1, measure-in-line 1, measure-total
  // 11 — abcjs-m1 and abcjs-mm11 share no digits, but a naive substring match
  // could still cross-read one for the other.
  const parsed = parseAbcClasses("abcjs-l1 abcjs-m1 abcjs-mm11 abcjs-v1 abcjs-n0");
  assert.equal(parsed.measureInLine, 1);
  assert.equal(parsed.measure, 11);
});

test("parseAbcClasses returns null for a non-note element (missing note number)", () => {
  assert.equal(parseAbcClasses("abcjs-l1 abcjs-m2 abcjs-mm2 abcjs-v0"), null);
});

test("parseAbcClasses returns null for an empty/missing class attribute", () => {
  assert.equal(parseAbcClasses(""), null);
  assert.equal(parseAbcClasses(null), null);
});

function withDom(fn) {
  const dom = new JSDOM("<!doctype html><body><svg id=notation></svg></body>");
  try {
    fn(dom.window.document);
  } finally {
    dom.window.close();
  }
}

const NOTE_V0_CLASS = "abcjs-note abcjs-v0";

function addNote(doc, container, cls) {
  const node = doc.createElementNS("http://www.w3.org/2000/svg", "g");
  node.setAttribute("class", cls);
  container.appendChild(node);
  return node;
}

test("flatNoteIndex is each note/rest's 0-based position in document order, per voice", () => {
  withDom((doc) => {
    const container = doc.getElementById("notation");
    const a = addNote(doc, container, NOTE_V0_CLASS);
    const b = addNote(doc, container, "abcjs-rest abcjs-v0");
    const c = addNote(doc, container, NOTE_V0_CLASS);
    assert.equal(flatNoteIndex(container, 0, a), 0);
    assert.equal(flatNoteIndex(container, 0, b), 1);
    assert.equal(flatNoteIndex(container, 0, c), 2);
  });
});

test("flatNoteIndex only counts the given voice, and returns -1 for an element not in it", () => {
  withDom((doc) => {
    const container = doc.getElementById("notation");
    addNote(doc, container, "abcjs-note abcjs-v1");
    const target = addNote(doc, container, NOTE_V0_CLASS);
    const other = addNote(doc, container, "abcjs-note abcjs-v1");
    assert.equal(flatNoteIndex(container, 0, target), 0);
    assert.equal(flatNoteIndex(container, 0, other), -1);
  });
});

test("flatNoteIndex ignores reflow-dependent line/measure classes entirely — position is all that matters", () => {
  withDom((doc) => {
    const container = doc.getElementById("notation");
    const a = addNote(doc, container, "abcjs-note abcjs-l0 abcjs-m0 abcjs-mm0 abcjs-v0 abcjs-n0");
    const b = addNote(doc, container, "abcjs-note abcjs-l3 abcjs-m2 abcjs-mm9 abcjs-v0 abcjs-n4");
    assert.equal(flatNoteIndex(container, 0, a), 0);
    assert.equal(flatNoteIndex(container, 0, b), 1);
  });
});

test("findNoteElementByFlatIndex locates the element at that position, and only that voice", () => {
  withDom((doc) => {
    const container = doc.getElementById("notation");
    addNote(doc, container, "abcjs-note abcjs-v1");
    const first = addNote(doc, container, NOTE_V0_CLASS);
    const second = addNote(doc, container, "abcjs-rest abcjs-v0");
    assert.equal(findNoteElementByFlatIndex(container, 0, 0), first);
    assert.equal(findNoteElementByFlatIndex(container, 0, 1), second);
  });
});

test("findNoteElementByFlatIndex returns null when out of range, or the container is null", () => {
  withDom((doc) => {
    const container = doc.getElementById("notation");
    addNote(doc, container, NOTE_V0_CLASS);
    assert.equal(findNoteElementByFlatIndex(container, 0, 5), null);
    assert.equal(findNoteElementByFlatIndex(container, 0, -1), null);
    assert.equal(findNoteElementByFlatIndex(null, 0, 0), null);
  });
});

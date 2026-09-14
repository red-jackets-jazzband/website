import { test } from "node:test";
import assert from "node:assert/strict";
import { mountPage } from "../../../tests/helpers/dom.js";
import { makeCtx, memoryStorage } from "../../../tests/helpers/ctx.js";
import { createSheetEditMode } from "./sheet-edit-mode.js";
import { createPracticeNotes } from "./practice-notes.js";
import { listPracticeNotes, addPracticeNote } from "../lib/practice-notes-store.js";

const SVGNS = "http://www.w3.org/2000/svg";
const BASIN_STREET = "basin_street.abc";
const NOTE_0_CLASS = "abcjs-note abcjs-l0 abcjs-m0 abcjs-mm0 abcjs-v0 abcjs-n0";
const BUBBLE_SELECTOR = ".rj-practice-note-bubble";
const TEXTAREA_SELECTOR = "#editPopoverBody .rj-edit-popover-textarea";
const SAVE_BTN_SELECTOR = "#editPopoverBody .rj-edit-popover-btn-primary";
const ACTION_BTN_SELECTOR = "#editPopoverBody .rj-edit-popover-action";

function setup(songFile = BASIN_STREET) {
  const page = mountPage();
  const storage = memoryStorage();
  const ctx = makeCtx({ state: { currentSongFile: songFile }, storage: () => storage });
  ctx.editMode = createSheetEditMode();
  ctx.editMode.init();
  ctx.practiceNotes = createPracticeNotes(ctx);
  ctx.practiceNotes.init();
  return {
    page, ctx, storage, cleanup: page.cleanup,
  };
}

function click(el, coords = {}) {
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, ...coords }));
}

function addNoteEl(svg, cls) {
  const g = document.createElementNS(SVGNS, "g");
  g.setAttribute("class", cls);
  svg.append(g);
  return g;
}

function freshSvgNotation() {
  const notation = document.getElementById("notation");
  const svg = document.createElementNS(SVGNS, "svg");
  notation.append(svg);
  return { notation, svg };
}

test("renderOverlays draws one bubble per stored note, anchored to its resolved element", () => {
  const { ctx, cleanup } = setup();
  try {
    const { notation, svg } = freshSvgNotation();
    addNoteEl(svg, NOTE_0_CLASS);
    const target = addNoteEl(svg, "abcjs-note abcjs-v0");
    addPracticeNote(ctx.storage(), {
      songFile: BASIN_STREET, note: 1, text: "watch the turnaround",
    });

    ctx.practiceNotes.renderOverlays(notation);
    const bubbles = notation.querySelectorAll(BUBBLE_SELECTOR);
    assert.equal(bubbles.length, 1);
    assert.equal(bubbles[0].previousElementSibling, target);
    assert.equal(bubbles[0].querySelector(".rj-practice-note-bubble-text tspan").textContent, "watch the turnaround");
  } finally {
    cleanup();
  }
});

test("renderOverlays skips a note whose anchor isn't on the rendered sheet", () => {
  const { ctx, cleanup } = setup();
  try {
    const { notation } = freshSvgNotation();
    addPracticeNote(ctx.storage(), {
      songFile: BASIN_STREET, note: 9, text: "orphaned",
    });
    ctx.practiceNotes.renderOverlays(notation);
    assert.equal(notation.querySelectorAll(BUBBLE_SELECTOR).length, 0);
  } finally {
    cleanup();
  }
});

test("renderOverlays skips a bar-anchored note (note: null) — deferred in V1", () => {
  const { ctx, cleanup } = setup();
  try {
    const { notation, svg } = freshSvgNotation();
    addNoteEl(svg, NOTE_0_CLASS);
    addPracticeNote(ctx.storage(), {
      songFile: BASIN_STREET, note: null, text: "slow down here",
    });
    ctx.practiceNotes.renderOverlays(notation);
    assert.equal(notation.querySelectorAll(BUBBLE_SELECTOR).length, 0);
  } finally {
    cleanup();
  }
});

test("renderOverlays clears previous bubbles before redrawing (no stacking on re-render)", () => {
  const { ctx, cleanup } = setup();
  try {
    const { notation, svg } = freshSvgNotation();
    addNoteEl(svg, NOTE_0_CLASS);
    addPracticeNote(ctx.storage(), {
      songFile: BASIN_STREET, note: 0, text: "a",
    });
    ctx.practiceNotes.renderOverlays(notation);
    ctx.practiceNotes.renderOverlays(notation);
    assert.equal(notation.querySelectorAll(BUBBLE_SELECTOR).length, 1);
  } finally {
    cleanup();
  }
});

test("renderOverlays only draws notes for the current song", () => {
  const { ctx, cleanup } = setup();
  try {
    const { notation, svg } = freshSvgNotation();
    addNoteEl(svg, NOTE_0_CLASS);
    addPracticeNote(ctx.storage(), { songFile: "tiger_rag.abc", note: 0, text: "wrong song" });
    ctx.practiceNotes.renderOverlays(notation);
    assert.equal(notation.querySelectorAll(BUBBLE_SELECTOR).length, 0);
  } finally {
    cleanup();
  }
});

test("clicking a note in edit mode offers Add a note here; saving stores and redraws it", () => {
  const { ctx, cleanup } = setup();
  try {
    const { svg } = freshSvgNotation();
    const target = addNoteEl(svg, "abcjs-note abcjs-l0 abcjs-m1 abcjs-mm1 abcjs-v0 abcjs-n2");
    ctx.editMode.setActive(true);

    click(target, { clientX: 10, clientY: 20 });
    const actionBtn = document.querySelector(ACTION_BTN_SELECTOR);
    assert.equal(actionBtn.textContent, "Add a note here");

    click(actionBtn);
    const textarea = document.querySelector(TEXTAREA_SELECTOR);
    assert.ok(textarea, "expected the note form to replace the action menu");
    textarea.value = "watch the turnaround";
    click(document.querySelector(SAVE_BTN_SELECTOR));

    const stored = listPracticeNotes(ctx.storage(), BASIN_STREET);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].note, 0);
    assert.equal(stored[0].text, "watch the turnaround");
    assert.equal(document.getElementById("editPopover").hidden, true);
    assert.equal(document.querySelectorAll(BUBBLE_SELECTOR).length, 1);
  } finally {
    cleanup();
  }
});

test("a note/rest click offers no action for a non-melody voice (V1 scope)", () => {
  const { ctx, cleanup } = setup();
  try {
    const { svg } = freshSvgNotation();
    const target = addNoteEl(svg, "abcjs-note abcjs-l0 abcjs-m0 abcjs-mm0 abcjs-v1 abcjs-n0");
    ctx.editMode.setActive(true);
    click(target);
    assert.equal(document.getElementById("editPopover").hidden, true);
  } finally {
    cleanup();
  }
});

test("clicking an existing bubble opens an edit form pre-filled with its text", () => {
  const { ctx, cleanup } = setup();
  try {
    const { notation, svg } = freshSvgNotation();
    addNoteEl(svg, NOTE_0_CLASS);
    const note = addPracticeNote(ctx.storage(), {
      songFile: BASIN_STREET, note: 0, text: "original text",
    });
    ctx.practiceNotes.renderOverlays(notation);
    ctx.editMode.setActive(true);

    const bubble = notation.querySelector(BUBBLE_SELECTOR);
    click(bubble, { clientX: 1, clientY: 2 });
    const textarea = document.querySelector(TEXTAREA_SELECTOR);
    assert.equal(textarea.value, "original text");

    textarea.value = "edited text";
    click(document.querySelector(SAVE_BTN_SELECTOR));

    const stored = listPracticeNotes(ctx.storage(), BASIN_STREET);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].id, note.id);
    assert.equal(stored[0].text, "edited text");
  } finally {
    cleanup();
  }
});

test("Delete on an existing bubble's edit form removes it and redraws without it", () => {
  const { ctx, cleanup } = setup();
  try {
    const { notation, svg } = freshSvgNotation();
    addNoteEl(svg, NOTE_0_CLASS);
    addPracticeNote(ctx.storage(), {
      songFile: BASIN_STREET, note: 0, text: "to be deleted",
    });
    ctx.practiceNotes.renderOverlays(notation);
    ctx.editMode.setActive(true);

    const bubble = notation.querySelector(BUBBLE_SELECTOR);
    click(bubble);
    click(document.querySelector("#editPopoverBody .rj-edit-popover-btn-danger"));

    assert.equal(listPracticeNotes(ctx.storage(), BASIN_STREET).length, 0);
    assert.equal(notation.querySelectorAll(BUBBLE_SELECTOR).length, 0);
    assert.equal(document.getElementById("editPopover").hidden, true);
  } finally {
    cleanup();
  }
});

test("an empty/whitespace-only save is a no-op (no note created)", () => {
  const { ctx, cleanup } = setup();
  try {
    const { svg } = freshSvgNotation();
    const target = addNoteEl(svg, NOTE_0_CLASS);
    ctx.editMode.setActive(true);
    click(target);
    click(document.querySelector(ACTION_BTN_SELECTOR));
    const textarea = document.querySelector(TEXTAREA_SELECTOR);
    textarea.value = "   ";
    click(document.querySelector(SAVE_BTN_SELECTOR));
    assert.equal(listPracticeNotes(ctx.storage(), BASIN_STREET).length, 0);
  } finally {
    cleanup();
  }
});

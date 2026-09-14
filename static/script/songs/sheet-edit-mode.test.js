import { test } from "node:test";
import assert from "node:assert/strict";
import { mountPage } from "../../../tests/helpers/dom.js";
import { createSheetEditMode } from "./sheet-edit-mode.js";

function setup() {
  const page = mountPage();
  const editMode = createSheetEditMode();
  editMode.init();
  return { page, editMode, cleanup: page.cleanup };
}

function click(el, coords = {}) {
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, ...coords }));
}

function addNoteEl(notation, cls) {
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("class", cls);
  notation.append(g);
  return g;
}

test("toggle() flips rj-edit-mode on #rjSheet and the button's active/aria-pressed state", () => {
  const { editMode, cleanup } = setup();
  try {
    const sheet = document.getElementById("rjSheet");
    const btn = document.getElementById("editModeBtn");
    assert.equal(editMode.isActive(), false);
    editMode.toggle();
    assert.equal(sheet.classList.contains("rj-edit-mode"), true);
    assert.equal(btn.classList.contains("active"), true);
    assert.equal(btn.getAttribute("aria-pressed"), "true");
    editMode.toggle();
    assert.equal(sheet.classList.contains("rj-edit-mode"), false);
    assert.equal(btn.getAttribute("aria-pressed"), "false");
  } finally {
    cleanup();
  }
});

test("clicking #editModeBtn toggles edit mode", () => {
  const { editMode, cleanup } = setup();
  try {
    click(document.getElementById("editModeBtn"));
    assert.equal(editMode.isActive(), true);
  } finally {
    cleanup();
  }
});

test("setActive(false) closes an open popover", () => {
  const { editMode, cleanup } = setup();
  try {
    editMode.setActive(true);
    editMode.openPopoverAt(10, 20, (body) => { body.textContent = "hi"; });
    assert.equal(document.getElementById("editPopover").hidden, false);
    editMode.setActive(false);
    assert.equal(document.getElementById("editPopover").hidden, true);
  } finally {
    cleanup();
  }
});

test("a click on a classed note runs registered contributors and opens the popover with their actions", () => {
  const { editMode, cleanup } = setup();
  try {
    editMode.setActive(true);
    const notation = document.getElementById("notation");
    const note = addNoteEl(notation, "abcjs-note abcjs-l0 abcjs-m1 abcjs-mm1 abcjs-v0 abcjs-n2");
    let received = null;
    editMode.registerActions((target) => {
      received = target;
      return [{ label: "Add a note here", onClick() {} }];
    });
    click(note, { clientX: 42, clientY: 84 });
    assert.deepEqual(received, {
      line: 0, measureInLine: 1, measure: 1, note: 2, voice: 0, flatIndex: 0,
    });
    const pop = document.getElementById("editPopover");
    assert.equal(pop.hidden, false);
    assert.equal(pop.style.left, "42px");
    assert.equal(pop.style.top, "84px");
    const actionBtn = document.querySelector("#editPopoverBody .rj-edit-popover-action");
    assert.equal(actionBtn.textContent, "Add a note here");
  } finally {
    cleanup();
  }
});

test("clicking an action button invokes its onClick", () => {
  const { editMode, cleanup } = setup();
  try {
    editMode.setActive(true);
    const notation = document.getElementById("notation");
    const note = addNoteEl(notation, "abcjs-note abcjs-l0 abcjs-m0 abcjs-mm0 abcjs-v0 abcjs-n0");
    let clicked = false;
    editMode.registerActions(() => [{ label: "Do it", onClick() { clicked = true; } }]);
    click(note);
    click(document.querySelector("#editPopoverBody .rj-edit-popover-action"));
    assert.equal(clicked, true);
  } finally {
    cleanup();
  }
});

test("an action that rebuilds the popover's content (replacePopoverBody) doesn't get closed by the same click's own bubble-to-document phase", () => {
  const { editMode, cleanup } = setup();
  try {
    editMode.setActive(true);
    const notation = document.getElementById("notation");
    const note = addNoteEl(notation, "abcjs-note abcjs-l0 abcjs-m0 abcjs-mm0 abcjs-v0 abcjs-n0");
    editMode.registerActions(() => [{
      label: "Add a note here",
      onClick() {
        // Synchronously detaches the button that was just clicked — the
        // real-world case (practice-notes.js's openAddForm) that broke
        // handleOutsideClick's pop.contains(e.target) check.
        editMode.replacePopoverBody((body) => {
          const textarea = document.createElement("textarea");
          body.append(textarea);
        });
      },
    }]);
    click(note);
    click(document.querySelector("#editPopoverBody .rj-edit-popover-action"));
    assert.equal(document.getElementById("editPopover").hidden, false);
    assert.ok(document.querySelector("#editPopoverBody textarea"));
  } finally {
    cleanup();
  }
});

test("a click with no contributor actions leaves the popover closed", () => {
  const { editMode, cleanup } = setup();
  try {
    editMode.setActive(true);
    const notation = document.getElementById("notation");
    const note = addNoteEl(notation, "abcjs-note abcjs-l0 abcjs-m0 abcjs-mm0 abcjs-v0 abcjs-n0");
    editMode.registerActions(() => []);
    click(note);
    assert.equal(document.getElementById("editPopover").hidden, true);
  } finally {
    cleanup();
  }
});

test("clicks on #notation are ignored while edit mode is inactive", () => {
  const { editMode, cleanup } = setup();
  try {
    const notation = document.getElementById("notation");
    const note = addNoteEl(notation, "abcjs-note abcjs-l0 abcjs-m0 abcjs-mm0 abcjs-v0 abcjs-n0");
    editMode.registerActions(() => [{ label: "x", onClick() {} }]);
    click(note);
    assert.equal(document.getElementById("editPopover").hidden, true);
  } finally {
    cleanup();
  }
});

test("a click on an existing bubble calls the registered bubble handler instead of contributors", () => {
  const { editMode, cleanup } = setup();
  try {
    editMode.setActive(true);
    const notation = document.getElementById("notation");
    const bubble = addNoteEl(notation, "rj-practice-note-bubble");
    bubble.dataset.noteId = "abc123";
    let seen = null;
    editMode.setBubbleHandlers({
      onOpenForBubble(el, x, y) { seen = { id: el.dataset.noteId, x, y }; },
    });
    editMode.registerActions(() => [{ label: "should not run", onClick() { throw new Error("wrong path"); } }]);
    click(bubble, { clientX: 5, clientY: 6 });
    assert.deepEqual(seen, { id: "abc123", x: 5, y: 6 });
  } finally {
    cleanup();
  }
});

test("clicking outside the popover closes it, clicking inside does not", () => {
  const { editMode, cleanup } = setup();
  try {
    editMode.setActive(true);
    editMode.openPopoverAt(0, 0, (body) => {
      const inner = document.createElement("button");
      inner.textContent = "stay";
      body.append(inner);
    });
    click(document.querySelector("#editPopoverBody button"));
    assert.equal(document.getElementById("editPopover").hidden, false);
    click(document.body);
    assert.equal(document.getElementById("editPopover").hidden, true);
  } finally {
    cleanup();
  }
});

test("Escape closes the popover", () => {
  const { editMode, cleanup } = setup();
  try {
    editMode.setActive(true);
    editMode.openPopoverAt(0, 0, (body) => { body.textContent = "x"; });
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(document.getElementById("editPopover").hidden, true);
  } finally {
    cleanup();
  }
});

test("beforeprint force-closes the popover", () => {
  const { editMode, page, cleanup } = setup();
  try {
    editMode.setActive(true);
    editMode.openPopoverAt(0, 0, (body) => { body.textContent = "x"; });
    page.window.dispatchEvent(new page.window.Event("beforeprint"));
    assert.equal(document.getElementById("editPopover").hidden, true);
  } finally {
    cleanup();
  }
});

test("replacePopoverBody rebuilds content without moving the popover", () => {
  const { editMode, cleanup } = setup();
  try {
    editMode.setActive(true);
    editMode.openPopoverAt(15, 25, (body) => { body.textContent = "first"; });
    editMode.replacePopoverBody((body) => { body.textContent = "second"; });
    const pop = document.getElementById("editPopover");
    assert.equal(pop.style.left, "15px");
    assert.equal(document.getElementById("editPopoverBody").textContent, "second");
  } finally {
    cleanup();
  }
});

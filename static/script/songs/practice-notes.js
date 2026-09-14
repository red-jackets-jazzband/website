import { byId } from "../lib/dom.js";
import { findNoteElementByFlatIndex } from "../lib/note-address.js";
import { wrapTextLines } from "../lib/text-wrap.js";
import {
  listPracticeNotes, addPracticeNote, updatePracticeNoteText, deletePracticeNote,
} from "../lib/practice-notes-store.js";

const SVGNS = "http://www.w3.org/2000/svg";
const BUBBLE_CLASS = "rj-practice-note-bubble";
const BUBBLE_MAX_WIDTH = 140;
const BUBBLE_PAD_X = 6;
const BUBBLE_PAD_Y = 4;
const BUBBLE_LINE_HEIGHT = 13;
const BUBBLE_MIN_WIDTH = 24;
const BUBBLE_GAP_ABOVE_NOTE = 6;
// V1 scope (see lib/apply-patches.js's own doc comment): only voice 0's own
// notes are addressable.
const MELODY_VOICE = 0;

// Measures `text` at the bubble's own font by rendering it into a throwaway
// <text> node in the same <svg> (real glyph metrics, not an estimate) — same
// approach chord-table.js/setlist-titlepage.js use elsewhere for SVG text
// fitting. jsdom (and a not-yet-laid-out live SVG) has no layout engine, so
// getComputedTextLength can throw or return 0; a rough character-count
// estimate covers both.
function makeMeasurer(svg) {
  const probe = document.createElementNS(SVGNS, "text");
  probe.setAttribute("class", "rj-practice-note-bubble-text");
  svg.append(probe);
  return {
    measure(text) {
      probe.textContent = text;
      try {
        const width = probe.getComputedTextLength();
        if (width) return width;
      } catch {
        // no layout available — fall through to the estimate below.
      }
      return text.length * 5.5;
    },
    cleanup() {
      probe.remove();
    },
  };
}

function buildBubbleGroup(note, box, lines) {
  const { x, y, width, height } = box;
  const g = document.createElementNS(SVGNS, "g");
  g.setAttribute("class", BUBBLE_CLASS);
  g.dataset.noteId = note.id;

  const rect = document.createElementNS(SVGNS, "rect");
  rect.setAttribute("class", "rj-practice-note-bubble-bg");
  rect.setAttribute("x", String(x));
  rect.setAttribute("y", String(y));
  rect.setAttribute("width", String(width));
  rect.setAttribute("height", String(height));
  rect.setAttribute("rx", "4");
  g.append(rect);

  const text = document.createElementNS(SVGNS, "text");
  text.setAttribute("class", "rj-practice-note-bubble-text");
  text.setAttribute("text-anchor", "middle");
  const midX = x + width / 2;
  lines.forEach((line, i) => {
    const tspan = document.createElementNS(SVGNS, "tspan");
    tspan.setAttribute("x", String(midX));
    tspan.setAttribute("y", String(y + BUBBLE_PAD_Y + (i + 0.8) * BUBBLE_LINE_HEIGHT));
    tspan.textContent = line;
    text.append(tspan);
  });
  g.append(text);

  const handle = document.createElementNS(SVGNS, "text");
  handle.setAttribute("class", "rj-practice-note-bubble-edit-handle hideOnprint");
  handle.setAttribute("text-anchor", "end");
  handle.setAttribute("x", String(x + width - 3));
  handle.setAttribute("y", String(y + BUBBLE_LINE_HEIGHT));
  handle.textContent = "✎";
  g.append(handle);

  return g;
}

// One note -> its bubble <g>, or null when its anchor note isn't (yet, or
// any longer) on the rendered sheet — see renderOverlays's own doc comment.
function buildBubble(anchorEl, note) {
  const svg = anchorEl.closest("svg");
  if (!svg) return null;
  let bbox;
  try {
    bbox = anchorEl.getBBox();
  } catch {
    return null; // not laid out yet — nothing to anchor to
  }
  const measurer = makeMeasurer(svg);
  const maxTextWidth = BUBBLE_MAX_WIDTH - 2 * BUBBLE_PAD_X;
  const lines = wrapTextLines(note.text, maxTextWidth, measurer.measure);
  const textWidth = lines.reduce((max, line) => Math.max(max, measurer.measure(line)), 0);
  measurer.cleanup();

  const width = Math.max(BUBBLE_MIN_WIDTH, Math.min(BUBBLE_MAX_WIDTH, textWidth + 2 * BUBBLE_PAD_X));
  const height = lines.length * BUBBLE_LINE_HEIGHT + 2 * BUBBLE_PAD_Y;
  const x = bbox.x + bbox.width / 2 - width / 2;
  const y = bbox.y - height - BUBBLE_GAP_ABOVE_NOTE;

  return buildBubbleGroup(note, {
    x, y, width, height,
  }, lines);
}

function buildNoteForm(body, { initialText = "", onSave, onDelete }) {
  const textarea = document.createElement("textarea");
  textarea.className = "rj-edit-popover-textarea";
  textarea.rows = 2;
  textarea.placeholder = "Practice note…";
  textarea.value = initialText;
  body.append(textarea);

  const actions = document.createElement("div");
  actions.className = "rj-edit-popover-actions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "rj-edit-popover-btn rj-edit-popover-btn-primary";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", () => {
    const text = textarea.value.trim();
    if (text) onSave(text);
  });
  actions.append(saveBtn);

  if (onDelete) {
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "rj-edit-popover-btn rj-edit-popover-btn-danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", onDelete);
    actions.append(deleteBtn);
  }

  body.append(actions);
  textarea.focus();
}

/*
  Practice notes: short freeform text pinned to a note/rest on the sheet,
  rendered as native SVG bubble siblings (matching the only two existing
  decoration precedents in sheet-decorations.js — neither uses foreignObject
  or HTML-over-SVG positioning). renderOverlays() is called synchronously
  inside sheet.js's engrave(), on every render, and again once
  document.fonts.ready (bubble sizing needs real font metrics) — see
  sheet.js's own call site.
*/
export function createPracticeNotes(ctx) {
  function songFile() {
    return ctx.state.currentSongFile;
  }

  // Removes every existing bubble and redraws one per stored note whose
  // anchor is still findable on this render — ABCJS.renderAbc fully replaces
  // #notation's DOM on every call, so this is unconditional, not a diff.
  // `songFileOverride` is how the booklet print path (setlist-print.js, via
  // sheet.js's own songFile threading) renders another song's notes while
  // the live sheet still has a different one open — without it this would
  // repeat the exact bug lib/apply-patches.js's own wiring in sheet.js had
  // to avoid for patches. A note anchored to a specific flat position
  // (note !== null) that no longer resolves (the song's own .abc changed
  // underneath it, or the note count disagrees with abcjs's for some edge
  // case) is silently skipped — orphaned rather than corrupting the render —
  // as is an unanchored note (note === null): not currently reachable from
  // the UI (see this file's own createPracticeNotes doc comment), and V1 has
  // no bounding-box anchor for it if it ever is.
  function renderOverlays(notationEl, songFileOverride) {
    if (!notationEl) return;
    notationEl.querySelectorAll(`.${BUBBLE_CLASS}`).forEach((n) => n.remove());
    const notes = listPracticeNotes(ctx.storage(), songFileOverride ?? songFile());
    notes.forEach((note) => {
      if (note.note === null) return;
      const anchor = findNoteElementByFlatIndex(notationEl, MELODY_VOICE, note.note);
      if (!anchor) return;
      const bubble = buildBubble(anchor, note);
      if (bubble) anchor.parentNode.insertBefore(bubble, anchor.nextSibling);
    });
  }

  function openAddForm(flatIndex) {
    ctx.editMode.replacePopoverBody((body) => {
      buildNoteForm(body, {
        onSave(text) {
          addPracticeNote(ctx.storage(), {
            songFile: songFile(), note: flatIndex, text,
          });
          ctx.editMode.closePopover();
          renderOverlays(byId("notation"));
        },
      });
    });
  }

  function openEditForm(bubbleEl, x, y) {
    const id = bubbleEl.dataset.noteId;
    const existing = listPracticeNotes(ctx.storage(), songFile()).find((n) => n.id === id);
    if (!existing) return;
    ctx.editMode.openPopoverAt(x, y, (body) => {
      buildNoteForm(body, {
        initialText: existing.text,
        onSave(text) {
          updatePracticeNoteText(ctx.storage(), id, text);
          ctx.editMode.closePopover();
          renderOverlays(byId("notation"));
        },
        onDelete() {
          deletePracticeNote(ctx.storage(), id);
          ctx.editMode.closePopover();
          renderOverlays(byId("notation"));
        },
      });
    });
  }

  function init() {
    ctx.editMode.registerActions((target) => {
      if (target.voice !== MELODY_VOICE) return [];
      return [{
        label: "Add a note here",
        onClick() {
          openAddForm(target.flatIndex);
        },
      }];
    });
    ctx.editMode.setBubbleHandlers({ onOpenForBubble: openEditForm });
  }

  return { init, renderOverlays };
}

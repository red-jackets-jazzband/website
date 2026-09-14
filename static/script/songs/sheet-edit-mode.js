import { byId, on } from "../lib/dom.js";
import { parseAbcClasses, flatNoteIndex } from "../lib/note-address.js";

/*
  Sheet edit mode: the #editModeBtn toggle, the shared click-to-note-address
  resolver, and one reusable floating popover host (#editPopover) that other
  edit-mode modules (practice-notes.js, and Phase C's musical-patch module)
  build their contextual action menu into.

  Toggling adds/removes rj-edit-mode on #rjSheet; resetting it off on every
  new song is driven from sheet.js's render() (ctx.editMode.setActive(false)
  at that one call site, not here) so leaving mid-edit never leaves
  seek-on-click silently broken. audio-player.js's own click-to-seek checks
  isActive() and early-returns while this is on, rather than this file
  intercepting/stopping that event — the two listeners on #notation simply
  both run, and only one of them ever does anything for a given click.

  Action *contributors* (registerActions) let more than one module offer
  buttons for the same note/rest click — Phase C's pitch/rest/chord actions
  land in the very same popover as this file's own "Add a note here" for a
  note/rest click, per the plan's one-popover-many-actions click model. A
  click on an existing practice-note bubble bypasses the contributor list
  entirely (nothing else has actions for an already-placed bubble) and goes
  straight to whatever setBubbleHandlers registered.
*/

function isActive() {
  const sheet = byId("rjSheet");
  return Boolean(sheet && sheet.classList.contains("rj-edit-mode"));
}

function closePopover() {
  const pop = byId("editPopover");
  if (pop) pop.hidden = true;
}

function setActive(active) {
  const sheet = byId("rjSheet");
  if (sheet) sheet.classList.toggle("rj-edit-mode", active);
  const btn = byId("editModeBtn");
  if (btn) {
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  }
  if (!active) closePopover();
}

function toggle() {
  setActive(!isActive());
}

// Builds `body`'s content via `buildBody(body)` and shows the popover at
// (x, y) — client coordinates, same as the click that triggered it.
function openPopoverAt(x, y, buildBody) {
  const pop = byId("editPopover");
  const body = byId("editPopoverBody");
  if (!pop || !body) return;
  body.replaceChildren();
  buildBody(body);
  pop.style.left = `${x}px`;
  pop.style.top = `${y}px`;
  pop.hidden = false;
}

// Rebuilds the already-open popover's content in place, without moving it —
// used to swap from an action menu into a text-entry form for whichever
// action was picked.
function replacePopoverBody(buildBody) {
  const body = byId("editPopoverBody");
  if (!body) return;
  body.replaceChildren();
  buildBody(body);
}

// Resolves a click down to the abcjs-address fields (line/measureInLine/
// measure/note/voice — see parseAbcClasses) plus `flatIndex`, the stable,
// persistable address (lib/note-address.js's flatNoteIndex) that
// practice-notes.js/note-patches.js actually key their storage by — abcjs's
// own `measure`/`note` numbers are kept here only for voice-scope checks and
// debugging, never for persistence (see lib/note-address.js's own doc
// comment on why).
function resolveTargetFromEvent(e) {
  const notation = byId("notation");
  let node = e.target;
  while (node && node !== notation) {
    const cls = node.getAttribute && node.getAttribute("class");
    const parsed = cls && parseAbcClasses(cls);
    if (parsed) return { ...parsed, flatIndex: flatNoteIndex(notation, parsed.voice, node) };
    node = node.parentElement;
  }
  return null;
}

function buildActionMenu(body, actions) {
  actions.forEach((action) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rj-edit-popover-action";
    btn.textContent = action.label;
    btn.addEventListener("click", () => action.onClick());
    body.append(btn);
  });
}

function handleOutsideClick(e) {
  const pop = byId("editPopover");
  if (!pop || pop.hidden) return;
  // An action button's own click handler can synchronously rebuild the
  // popover's content (replacePopoverBody), detaching e.target from the
  // document before this same click event reaches here — a detached node
  // fails pop.contains() even though the click plainly originated inside
  // the popover, so treat "no longer connected" as "was inside" rather
  // than closing what the click just opened/changed.
  if (!e.target.isConnected) return;
  if (pop.contains(e.target)) return;
  if (e.target.closest && e.target.closest("#notation")) return; // its own click just opened/reopened it
  closePopover();
}

export function createSheetEditMode() {
  const contributors = [];
  let bubbleHandlers = null;

  // Registers a contributor: `fn(target)` -> an array of
  // { label, onClick() } buttons to offer for that click target (or [] for
  // none). `target` is a lib/note-address.js address plus its persistable
  // flat position: `{ voice, measure, note, line, measureInLine, flatIndex }`
  // — see resolveTargetFromEvent's own doc comment above.
  function registerActions(fn) {
    contributors.push(fn);
  }

  // `handlers.onOpenForBubble(bubbleEl, x, y)` is called instead of the
  // contributor list whenever a click lands on an existing
  // .rj-practice-note-bubble.
  function setBubbleHandlers(handlers) {
    bubbleHandlers = handlers;
  }

  function handleNotationClick(e) {
    if (!isActive()) return;
    const bubble = e.target.closest && e.target.closest(".rj-practice-note-bubble");
    if (bubble) {
      if (bubbleHandlers) bubbleHandlers.onOpenForBubble(bubble, e.clientX, e.clientY);
      return;
    }
    const target = resolveTargetFromEvent(e);
    if (!target) return;
    const actions = contributors.flatMap((fn) => fn(target) || []);
    if (!actions.length) return;
    openPopoverAt(e.clientX, e.clientY, (body) => buildActionMenu(body, actions));
  }

  function init() {
    on("editModeBtn", "click", toggle);
    on("notation", "click", handleNotationClick);
    on(document, "click", handleOutsideClick);
    on(document, "keydown", (e) => {
      if (e.key === "Escape") closePopover();
    });
    on(window, "beforeprint", closePopover);
  }

  return {
    init,
    isActive,
    setActive,
    toggle,
    registerActions,
    setBubbleHandlers,
    openPopoverAt,
    replacePopoverBody,
    closePopover,
    resolveTargetFromEvent,
  };
}

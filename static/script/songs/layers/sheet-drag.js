/*
  Drag-to-dismiss for the Layers bottom sheet (below 1024px). The little bar
  at the sheet's top (.rj-layers-grip) and the header row under it are the
  handle: pulling down moves the sheet — and the pill riding its top edge —
  with the finger through --rj-layers-drag on <body>; letting go past a third
  of the way, or in a quick flick, closes it, otherwise it springs back. A tap
  on the bar closes too. The decision itself is lib/platform/sheet-drag.js.
*/
import { shouldDismissSheet } from "../../lib/platform/sheet-drag.js";

const DOCKED = "(max-width: 1024px)";
const DRAG_VAR = "--rj-layers-drag";

function isDocked() {
  return Boolean(window.matchMedia) && window.matchMedia(DOCKED).matches; // NOSONAR
}

function setOffset(px) {
  document.body.style.setProperty(DRAG_VAR, `${px}px`);
}

function clearOffset() {
  document.body.style.removeProperty(DRAG_VAR);
  document.body.classList.remove("rj-layers-dragging");
}

// `handles` are the elements a drag may start on; `panel` is what moves.
export function initSheetDrag(panel, handles, onDismiss) {
  let drag = null;

  function end(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const { startY, startT } = drag;
    drag = null;
    const dy = event.clientY - startY;
    const dismiss = event.type !== "pointercancel" && shouldDismissSheet(dy, event.timeStamp - startT, panel.offsetHeight);
    clearOffset();
    if (dismiss) onDismiss();
  }

  function move(event) {
    if (!drag || event.pointerId !== drag.id) return;
    setOffset(Math.max(0, event.clientY - drag.startY));
  }

  function start(event) {
    if (!isDocked() || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (event.target.closest("button, a, input, select")) return;
    drag = { id: event.pointerId, startY: event.clientY, startT: event.timeStamp };
    document.body.classList.add("rj-layers-dragging");
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  handles.forEach((handle) => {
    handle.addEventListener("pointerdown", start);
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  });
}

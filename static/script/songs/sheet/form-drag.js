/*
  Drag and drop in the song form editor (song-form.js): a round by its grip,
  a part chip within its round or onto another round. A pointer-events drag,
  so it works on touch too; on a browser without pointer events (Safari 12)
  nothing here fires and the editor's buttons (up / down, tap to remove, the
  arrow keys on a chip) still do every move.

  The editor marks its cards `.songForm-card[data-round]` and its chips
  `.songForm-chip[data-part]`; a drop hands `onDrop(source, target)` plain
  numbers: source `{ kind: "round", round }` or `{ kind: "part", round, part }`,
  target `{ round, part }` (part null: the round itself).
*/

// A press only becomes a drag once the pointer has moved this far, so a tap
// on a chip stays a tap (it removes the part).
const DRAG_THRESHOLD_PX = 6;
const DROP_CLASSES = ["is-drop-before", "is-drop-after", "is-drop-into"];

// The card or chip under the pointer for a drag of `kind`.
function targetAt(x, y, kind) {
  const hit = document.elementFromPoint(x, y);
  const card = hit ? hit.closest(".songForm-card") : null;
  if (!card) return null;
  const round = Number(card.dataset.round);
  const chip = kind === "part" ? hit.closest(".songForm-chip[data-part]") : null;
  if (chip && chip.closest(".songForm-card") === card) return { round, part: Number(chip.dataset.part), node: chip };
  return { round, part: null, node: card };
}

// Which side of the target the gold line goes on, or a ring round a whole
// card a part is dropped into; null where a drop would change nothing.
function dropClass(source, target) {
  if (source.kind === "round") {
    if (target.round === source.round) return null;
    return target.round < source.round ? "is-drop-before" : "is-drop-after";
  }
  if (target.part === null) return target.round === source.round ? null : "is-drop-into";
  if (target.round !== source.round) return "is-drop-before";
  if (target.part === source.part) return null;
  return target.part < source.part ? "is-drop-before" : "is-drop-after";
}

export function createFormDrag({ onDrop }) {
  let drag = null;
  // Set when a drag ends, so the click the browser sends after it isn't
  // also taken as a tap on the chip.
  let swallowClick = false;

  function mark(target) {
    if (drag.marked) drag.marked.classList.remove(...DROP_CLASSES);
    drag.marked = null;
    drag.target = null;
    const cls = target ? dropClass(drag.source, target) : null;
    if (!cls) return;
    target.node.classList.add(cls);
    drag.marked = target.node;
    drag.target = target;
  }

  function onMove(e) {
    if (!drag) return;
    if (!drag.active) {
      if (Math.abs(e.clientX - drag.x) < DRAG_THRESHOLD_PX && Math.abs(e.clientY - drag.y) < DRAG_THRESHOLD_PX) return;
      drag.active = true;
      drag.node.classList.add("is-dragging");
      document.body.classList.add("songForm-dragging");
    }
    e.preventDefault();
    mark(targetAt(e.clientX, e.clientY, drag.source.kind));
  }

  function end() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    if (!drag) return;
    const done = drag;
    drag = null;
    if (!done.active) return;
    swallowClick = true;
    setTimeout(() => {
      swallowClick = false;
    }, 0);
    done.node.classList.remove("is-dragging");
    document.body.classList.remove("songForm-dragging");
    if (done.marked) done.marked.classList.remove(...DROP_CLASSES);
    if (done.target) onDrop(done.source, { round: done.target.round, part: done.target.part });
  }

  // Start watching a press on `node` (a grip or a chip) as a possible drag.
  function begin(e, node, source) {
    if (e.button !== undefined && e.button !== 0) return;
    drag = { node, source, x: e.clientX, y: e.clientY, active: false, marked: null, target: null };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  return {
    begin,
    // True (once) when the click being handled ended a drag.
    clickWasDrag() {
      return swallowClick;
    },
  };
}

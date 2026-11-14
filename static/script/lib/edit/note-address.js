// Stable note addressing for the songs sheet's practice-notes/patches
// features — reads the classes ABCjs stamps on each note/rest element (see
// node_modules/abcjs/src/write/helpers/classes.js, the real source, not the
// minified vendored bundle) and resolves between them and the persisted keys
// practice-notes-store.js / patches-store.js save.
//
// Persisted addresses are a flat, sequential position — "the Kth real
// note/rest in this voice, in document order" — not abcjs's own per-measure
// {measure, note} pair. That pair looked reflow-independent (abcjs-mm{measure}
// is a running total across the whole tune, abcjs-n{note} resets each
// barline) and was the original design here, but a real-corpus audit turned
// up abcjs's own Classes.prototype.newMeasure()/measureTotal() (see
// node_modules/abcjs/src/write/draw/staff-group.js/voice.js) occasionally
// *skipping* a measure number at certain line-wrap boundaries — confirmed
// directly against the rendered DOM on ~13% of the songs in this corpus
// (basin_street.abc's Part B/C boundary is one; see lib/apply-patches.js's
// own doc comment for the full story). Since that skip is driven by abcjs's
// real, width-dependent line layout, no from-scratch text scan of the .abc
// source can reliably predict it. The flat position never has this problem:
// neither abcjs's renderer nor a text scan of the source ever disagrees
// about *how many* real notes/rests exist or what order they're in — only
// about which measure-numbered bucket abcjs sorts each one into.

function readNum(classAttr, prefix) {
  const m = new RegExp(`(?:^|\\s)abcjs-${prefix}(\\d+)(?:\\s|$)`).exec(classAttr || "");
  return m ? Number.parseInt(m[1], 10) : null;
}

// An element's class attribute -> its abcjs-assigned address, or null when
// it isn't a classed note/rest/chord-onset element at all (a barline, a
// staff line, ...). Still used to read `voice` off a clicked element (V1's
// melody-voice scope check) and by sheet-decorations.js's applyCompingColors
// — just no longer the basis for a *persisted* key; see this file's own
// doc comment above.
export function parseAbcClasses(classAttr) {
  const line = readNum(classAttr, "l");
  const measureInLine = readNum(classAttr, "m");
  const measure = readNum(classAttr, "mm");
  const note = readNum(classAttr, "n");
  const voice = readNum(classAttr, "v");
  if (line === null || measure === null || note === null || voice === null) return null;
  return {
    line, measureInLine, measure, note, voice,
  };
}

// Every note/rest element for `voice`, in document (= musical) order — the
// ordering the flat index below is defined against.
function voiceNoteElements(container, voice) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(`.abcjs-note.abcjs-v${voice}, .abcjs-rest.abcjs-v${voice}`));
}

// Direction (a): a clicked note/rest element -> its flat, persistable
// address (its 0-based position among voiceNoteElements above), or -1 if
// `el` isn't one of them.
export function flatNoteIndex(container, voice, el) {
  return voiceNoteElements(container, voice).indexOf(el);
}

// Direction (b): a stored flat index -> this render's element for it, so a
// bubble/indicator can be re-anchored after every re-render. Returns null
// when out of range (a stale index from a since-edited song, say).
export function findNoteElementByFlatIndex(container, voice, flatIndex) {
  const all = voiceNoteElements(container, voice);
  return flatIndex >= 0 && flatIndex < all.length ? all[flatIndex] : null;
}

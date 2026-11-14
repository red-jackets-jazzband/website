/*
  Flags every currently-patched note/rest (note-patches.js's patchedNoteKeys:
  flat note positions with a pitch/rest edit) with a static rj-patched-note
  class, so a musical correction reads visibly different from the
  surrounding untouched notation (a fixed tint — see split.css). Keyed by the
  persisted flat position (lib/edit/note-address.js) rather than a
  drawn-onset ordinal, since a patch addresses one specific note. Voice 0
  only — see note-patches.js's V1 scope — so the flat position is just the
  element's 0-based index among the same ".abcjs-note.abcjs-v0,
  .abcjs-rest.abcjs-v0" selector note-address.js's own voiceNoteElements uses.
*/
export function applyPatchIndicators(container, patchedNotes) {
  if (!container || !patchedNotes || patchedNotes.length === 0) return;
  const flatIndices = new Set(patchedNotes);
  let i = 0;
  container.querySelectorAll("g.abcjs-note.abcjs-v0, g.abcjs-rest.abcjs-v0").forEach((group) => {
    group.classList.toggle("rj-patched-note", flatIndices.has(i));
    i += 1;
  });
}

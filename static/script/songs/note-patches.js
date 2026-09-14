import { stepPitchSemitone, resolveFlatToken } from "../lib/apply-patches.js";
import { listPatches, upsertPatch, removePatch } from "../lib/patches-store.js";

// V1 scope (matching lib/apply-patches.js and songs/practice-notes.js): only
// voice 0's own notes are addressable.
const MELODY_VOICE = 0;

function songFile(ctx) {
  return ctx.state.currentSongFile;
}

// The one "noteEdit"-family patch (pitch or rest) already applied to this
// flat note position, if any — see lib/patches-store.js's own doc comment on
// why pitch and rest share a family (a note is never simultaneously
// "repitched" and "rested"). Chord/insert patches on the same slot are a
// different family and irrelevant here.
function existingNoteEditPatch(ctx, flatIndex) {
  return listPatches(ctx.storage(), songFile(ctx))
    .find((p) => p.note === flatIndex && (p.action === "pitch" || p.action === "rest"));
}

/*
  Resolves a clicked note/rest target down to what the popover needs: whether
  it's currently a rest (a genuine rest already stored as-is, unless already
  reverted to it through a patch), the pitch a "nudge" should start from, and
  any existing patch to replace/undo. Returns null for a chord-bracket token
  (patches don't touch those — see apply-patches.js's own token.chord guard)
  or when the target can't be resolved at all (tune out of V1's single-voice
  scope, stale address, ...) — both handled by resolveFlatToken itself.
*/
function resolveNoteState(ctx, target) {
  const resolved = resolveFlatToken(ctx.state.currentSongText, target.flatIndex);
  if (!resolved) return null;
  const { barText, token } = resolved;
  if (token.chord) return null;
  const existing = existingNoteEditPatch(ctx, target.flatIndex);
  const originalPitch = barText.slice(token.pitchStart, token.pitchEnd);
  const isRest = existing ? existing.action === "rest" : token.rest;
  const currentPitch = existing && existing.action === "pitch" ? existing.value : originalPitch;
  return {
    isRest, currentPitch, existingPatchId: existing ? existing.id : null,
  };
}

function applyNudge(ctx, target, direction, onDone) {
  const state = resolveNoteState(ctx, target);
  if (!state || state.isRest) return;
  const nudged = stepPitchSemitone(state.currentPitch, direction);
  if (!nudged) return;
  upsertPatch(ctx.storage(), {
    songFile: songFile(ctx), note: target.flatIndex, action: "pitch", value: nudged,
  });
  onDone();
}

function applyRestToggle(ctx, target, onDone) {
  const state = resolveNoteState(ctx, target);
  if (!state) return;
  if (state.isRest) {
    // "Convert to note": undo whichever patch made it a rest. A note/rest
    // that was *always* a rest in the original notation (no patch on it at
    // all) has no defined pitch to restore it to, so there's nothing to do —
    // buildNoteEditActions below never offers this action in that case.
    if (state.existingPatchId) removePatch(ctx.storage(), state.existingPatchId);
  } else {
    upsertPatch(ctx.storage(), {
      songFile: songFile(ctx), note: target.flatIndex, action: "rest",
    });
  }
  onDone();
}

function applyReset(ctx, state, onDone) {
  if (!state.existingPatchId) return;
  removePatch(ctx.storage(), state.existingPatchId);
  onDone();
}

function buildNoteEditActions(ctx, target, rerenderSheet) {
  const state = resolveNoteState(ctx, target);
  if (!state) return [];
  if (state.isRest) {
    if (!state.existingPatchId) return []; // an original rest — no pitch to restore
    return [{ label: "Convert to note", onClick: () => applyRestToggle(ctx, target, rerenderSheet) }];
  }
  const actions = [
    { label: "Pitch ▲", onClick: () => applyNudge(ctx, target, 1, rerenderSheet) },
    { label: "Pitch ▼", onClick: () => applyNudge(ctx, target, -1, rerenderSheet) },
    { label: "Convert to rest", onClick: () => applyRestToggle(ctx, target, rerenderSheet) },
  ];
  if (state.existingPatchId) {
    actions.push({ label: "Reset to original", onClick: () => applyReset(ctx, state, rerenderSheet) });
  }
  return actions;
}

/*
  Musical patches (pitch nudge / convert to rest / convert to note / reset) —
  the "small correction" half of issue #70, alongside songs/practice-notes.js's
  freeform annotations. Registers a second sheet-edit-mode action
  contributor for the same note/rest click practice-notes.js already
  handles, so both sets of actions land in the one shared popover per the
  plan's click model. Re-renders the sheet (not just this module's own
  overlay) after every edit, since a patch changes the ABC text itself —
  sheet.js's own applyPatchIndicators call needs the fresh patch list too.
*/
export function createNotePatches(ctx) {
  function init() {
    ctx.editMode.registerActions((target) => {
      if (target.voice !== MELODY_VOICE) return [];
      return buildNoteEditActions(ctx, target, () => {
        ctx.editMode.closePopover();
        ctx.sheet.rerender();
      });
    });
  }

  return { init };
}

// Exported for sheet.js: the flat note positions (lib/note-address.js) this
// song currently has a pitch/rest patch on, for sheet-decorations.js's
// applyPatchIndicators to flag on the rendered sheet (a static "this note
// was edited" cue, distinct from practice-notes.js's own bubbles).
// `songFileOverride` is the same booklet-print threading practice-notes.js's
// renderOverlays needs — see that function's own doc comment.
export function patchedNoteKeys(ctx, songFileOverride) {
  return listPatches(ctx.storage(), songFileOverride ?? songFile(ctx))
    .filter((p) => p.action === "pitch" || p.action === "rest")
    .map((p) => p.note);
}

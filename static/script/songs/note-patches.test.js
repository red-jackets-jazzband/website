import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCtx, memoryStorage } from "../../../tests/helpers/ctx.js";
import { createNotePatches, patchedNoteKeys } from "./note-patches.js";
import { listPatches, upsertPatch } from "../lib/patches-store.js";

const BASIN_STREET = "basin_street.abc";
const TUNE = ["X:1", "T:Test Tune", "M:4/4", "L:1/8", "K:C", '"C" C2 D2 | E2 z2 | [CE]2 D2 |]'].join("\n");
// Flat order: C(0) D(1) | E(2) z(3) | [CE](4) D(5)

function setup() {
  const storage = memoryStorage();
  let registered = null;
  const calls = { popoverClosed: 0, rerenders: 0 };
  const ctx = makeCtx({
    state: { currentSongFile: BASIN_STREET, currentSongText: TUNE },
    storage: () => storage,
    editMode: {
      registerActions: (fn) => { registered = fn; },
      closePopover: () => { calls.popoverClosed += 1; },
    },
    sheet: { rerender: () => { calls.rerenders += 1; } },
  });
  ctx.notePatches = createNotePatches(ctx);
  ctx.notePatches.init();
  return {
    ctx, storage, calls, click: (target) => registered(target),
  };
}

const NOTE0 = { voice: 0, flatIndex: 0 };
const RESTNOTE = { voice: 0, flatIndex: 3 };
const CHORDNOTE = { voice: 0, flatIndex: 4 };
const PITCH_UP = "Pitch ▲";
const CONVERT_TO_REST = "Convert to rest";

test("a non-melody voice offers no actions", () => {
  const { click } = setup();
  assert.deepEqual(click({ ...NOTE0, voice: 1 }), []);
});

test("a plain note offers Pitch up/down and Convert to rest", () => {
  const { click } = setup();
  const actions = click(NOTE0);
  assert.deepEqual(actions.map((a) => a.label), [PITCH_UP, "Pitch ▼", CONVERT_TO_REST]);
});

test("a chord-bracket token offers no actions", () => {
  const { click } = setup();
  assert.deepEqual(click(CHORDNOTE), []);
});

test("an original (unpatched) rest offers no actions — no pitch to restore", () => {
  const { click } = setup();
  assert.deepEqual(click(RESTNOTE), []);
});

test("Pitch up stores a pitch patch one semitone above the original spelling", () => {
  const { ctx, click, calls } = setup();
  const actions = click(NOTE0);
  actions.find((a) => a.label === PITCH_UP).onClick();
  const patches = listPatches(ctx.storage(), BASIN_STREET);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].action, "pitch");
  assert.equal(patches[0].value, "^C"); // C -> ^C
  assert.equal(calls.popoverClosed, 1);
  assert.equal(calls.rerenders, 1);
});

test("nudging twice compounds from the already-patched value, not the original", () => {
  const { ctx, click } = setup();
  click(NOTE0).find((a) => a.label === PITCH_UP).onClick();
  // Re-click resolves fresh state, now reading the just-stored patch.
  click(NOTE0).find((a) => a.label === PITCH_UP).onClick();
  const patches = listPatches(ctx.storage(), BASIN_STREET);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].value, "D"); // C -> ^C -> D (two semitones up)
});

test("a pitch-patched note offers Reset to original alongside the usual actions", () => {
  const { click } = setup();
  click(NOTE0).find((a) => a.label === PITCH_UP).onClick();
  const actions = click(NOTE0);
  assert.deepEqual(
    actions.map((a) => a.label),
    [PITCH_UP, "Pitch ▼", CONVERT_TO_REST, "Reset to original"],
  );
});

test("Reset to original removes the pitch patch, reverting to the original notation", () => {
  const { ctx, click, calls } = setup();
  click(NOTE0).find((a) => a.label === PITCH_UP).onClick();
  click(NOTE0).find((a) => a.label === "Reset to original").onClick();
  assert.deepEqual(listPatches(ctx.storage(), BASIN_STREET), []);
  assert.equal(calls.rerenders, 2);
});

test("Convert to rest stores a rest patch, replacing any pitch patch on the same slot", () => {
  const { ctx, click } = setup();
  click(NOTE0).find((a) => a.label === PITCH_UP).onClick();
  click(NOTE0).find((a) => a.label === CONVERT_TO_REST).onClick();
  const patches = listPatches(ctx.storage(), BASIN_STREET);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].action, "rest");
});

test("once rested, the popover offers only Convert to note", () => {
  const { click } = setup();
  click(NOTE0).find((a) => a.label === CONVERT_TO_REST).onClick();
  const actions = click(NOTE0);
  assert.deepEqual(actions.map((a) => a.label), ["Convert to note"]);
});

test("Convert to note removes the rest patch, reverting to the original notation", () => {
  const { ctx, click } = setup();
  click(NOTE0).find((a) => a.label === CONVERT_TO_REST).onClick();
  click(NOTE0).find((a) => a.label === "Convert to note").onClick();
  assert.deepEqual(listPatches(ctx.storage(), BASIN_STREET), []);
});

test("patchedNoteKeys lists only pitch/rest patches, as flat note positions", () => {
  const { ctx, storage } = setup();
  upsertPatch(storage, {
    songFile: BASIN_STREET, note: 0, action: "pitch", value: "^C",
  });
  upsertPatch(storage, {
    songFile: BASIN_STREET, note: 3, action: "rest",
  });
  upsertPatch(storage, {
    songFile: BASIN_STREET, note: 1, action: "chord", value: "G7",
  });
  assert.deepEqual(patchedNoteKeys(ctx).sort((a, b) => a - b), [0, 3]);
});

test("patchedNoteKeys respects an explicit songFileOverride (booklet printing another song)", () => {
  const { ctx, storage } = setup();
  upsertPatch(storage, {
    songFile: BASIN_STREET, note: 0, action: "pitch", value: "^C",
  });
  upsertPatch(storage, {
    songFile: "tiger_rag.abc", note: 2, action: "pitch", value: "D",
  });
  assert.deepEqual(patchedNoteKeys(ctx, "tiger_rag.abc"), [2]);
});

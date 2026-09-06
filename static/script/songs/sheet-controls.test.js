import { test } from "node:test";
import assert from "node:assert/strict";
import { mountPage } from "../../../tests/helpers/dom.js";
import { makeCtx } from "../../../tests/helpers/ctx.js";
import { initSheetControls, clearBookletPrintState } from "./sheet-controls.js";

function setup(overrides = {}) {
  const page = mountPage();
  const calls = { rerender: 0, tempo: [] };
  const ctx = makeCtx({
    sheet: { rerender: () => { calls.rerender += 1; } },
    audio: {
      transposeSemitones: 0,
      chordOffset: 0,
      setRepeatBoundaries: () => {},
      initForTune: () => {},
      setupNotationClickHandler: () => {},
      updateTempoLabel: () => {},
      stepTempo: (d) => calls.tempo.push(d),
      playPause: () => {},
      stop: () => {},
      toggleMelody: () => {},
    },
    ...overrides,
  });
  initSheetControls(ctx);
  return { page, ctx, calls, cleanup: page.cleanup };
}

test("the Key stepper buttons clamp #transpose and fire an input event", () => {
  const { calls, cleanup } = setup();
  try {
    const input = document.getElementById("transpose");
    input.value = "11";
    document.getElementById("keyUpBtn").dispatchEvent(new window.Event("click"));
    assert.equal(input.value, "12");
    document.getElementById("keyUpBtn").dispatchEvent(new window.Event("click"));
    assert.equal(input.value, "12"); // clamped at max
    document.getElementById("keyDownBtn").dispatchEvent(new window.Event("click"));
    assert.equal(input.value, "11");
    assert.ok(calls.rerender >= 3); // the "input" listener re-renders each time
  } finally {
    cleanup();
  }
});

test("the Tempo buttons step the audio player by ±TEMPO_STEP", () => {
  const { calls, cleanup } = setup();
  try {
    document.getElementById("tempoUpBtn").dispatchEvent(new window.Event("click"));
    document.getElementById("tempoDownBtn").dispatchEvent(new window.Event("click"));
    assert.deepEqual(calls.tempo, [4, -4]);
  } finally {
    cleanup();
  }
});

test("the advanced toggle flips #sheetmenu, persists and re-renders", () => {
  const { calls, cleanup } = setup();
  try {
    const btn = document.getElementById("advancedToggleBtn");
    const menu = document.getElementById("sheetmenu");
    btn.dispatchEvent(new window.Event("click"));
    assert.ok(menu.classList.contains("show-advanced"));
    assert.equal(btn.getAttribute("aria-expanded"), "true");
    assert.equal(window.localStorage.getItem("rj.sheetAdvanced"), "1");
    assert.ok(calls.rerender >= 1);
  } finally {
    window.localStorage.clear();
    cleanup();
  }
});

test("the back button leaves the sheet view", () => {
  const { cleanup } = setup();
  try {
    document.body.classList.add("rj-sheet-active");
    document.getElementById("sheetBackBtn").dispatchEvent(new window.Event("click"));
    assert.equal(document.body.classList.contains("rj-sheet-active"), false);
  } finally {
    cleanup();
  }
});

test("clearBookletPrintState strips every export-* body class", () => {
  inDom((doc) => {
    doc.body.classList.add("export-booklet-mode", "export-mode-chordbook", "keep-me");
    clearBookletPrintState();
    assert.deepEqual([...doc.body.classList], ["keep-me"]);
  });
});

function inDom(fn) {
  const page = mountPage();
  try {
    return fn(page.document);
  } finally {
    page.cleanup();
  }
}

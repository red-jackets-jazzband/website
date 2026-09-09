import { test } from "node:test";
import assert from "node:assert/strict";
import { mountPage } from "../../../tests/helpers/dom.js";
import { makeCtx } from "../../../tests/helpers/ctx.js";
import { createMixer, loadMixerState } from "./mixer.js";

function setup(mixerState = {}) {
  const page = mountPage();
  const rerenders = [];
  const ctx = makeCtx({
    state: {
      compingActive: true,
      hasChords: true,
      mixer: {
        melodyVolume: 100, bassVolume: 100, chordsVolume: 100, compingVolume: 100,
        melodyMuted: false, bassMuted: false, chordsMuted: false, compingMuted: false,
        ...mixerState,
      },
    },
    sheet: { rerender: () => rerenders.push(1) },
  });
  const mixer = createMixer(ctx);
  mixer.init();
  return { page, ctx, mixer, rerenders, cleanup: page.cleanup };
}

test("init seeds all four range inputs from ctx.state.mixer", () => {
  const { cleanup } = setup({ melodyVolume: 30, bassVolume: 40, chordsVolume: 50, compingVolume: 60 });
  try {
    assert.equal(document.getElementById("mixerMelodyRange").value, "30");
    assert.equal(document.getElementById("mixerBassRange").value, "40");
    assert.equal(document.getElementById("mixerChordsRange").value, "50");
    assert.equal(document.getElementById("mixerCompingRange").value, "60");
  } finally {
    cleanup();
  }
});

test("mixer.toggle() opens and closes the panel, updating the button and aria state", () => {
  const { mixer, cleanup } = setup();
  try {
    const btn = document.getElementById("mixerBtn");
    const panel = document.getElementById("mixerPanel");
    const backdrop = document.getElementById("mixerBackdrop");
    assert.equal(panel.hidden, true);

    mixer.toggle();
    assert.equal(panel.hidden, false);
    assert.equal(backdrop.hidden, false);
    assert.equal(btn.classList.contains("active"), true);
    assert.equal(btn.getAttribute("aria-expanded"), "true");

    mixer.toggle();
    assert.equal(panel.hidden, true);
    assert.equal(btn.classList.contains("active"), false);
    assert.equal(btn.getAttribute("aria-expanded"), "false");
  } finally {
    cleanup();
  }
});

test("Escape closes an open panel; the backdrop and close button do too", () => {
  const { mixer, cleanup } = setup();
  try {
    mixer.toggle();
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(document.getElementById("mixerPanel").hidden, true);

    mixer.toggle();
    document.getElementById("mixerBackdrop").dispatchEvent(new window.Event("click"));
    assert.equal(document.getElementById("mixerPanel").hidden, true);

    mixer.toggle();
    document.getElementById("mixerCloseBtn").dispatchEvent(new window.Event("click"));
    assert.equal(document.getElementById("mixerPanel").hidden, true);
  } finally {
    cleanup();
  }
});

test("dragging a fader updates its readout live, and re-renders only once settled", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { ctx, rerenders, cleanup } = setup();
  try {
    const range = document.getElementById("mixerMelodyRange");
    range.value = "42";
    range.dispatchEvent(new window.Event("input"));

    assert.equal(ctx.state.mixer.melodyVolume, 42);
    assert.equal(document.getElementById("mixerMelodyReadout").textContent, "42%");
    assert.equal(document.getElementById("mixerMelodyFill").style.width, "42%");
    assert.equal(rerenders.length, 0); // debounced, not yet applied

    t.mock.timers.tick(300);
    assert.equal(rerenders.length, 1);
    assert.equal(window.localStorage.getItem("rj.mixerMelodyVolume"), "42");
  } finally {
    window.localStorage.clear();
    cleanup();
  }
});

test("releasing a fader (change) applies immediately without waiting for the debounce", () => {
  const { rerenders, cleanup } = setup();
  try {
    const range = document.getElementById("mixerBassRange");
    range.value = "10";
    range.dispatchEvent(new window.Event("input"));
    range.dispatchEvent(new window.Event("change"));
    assert.equal(rerenders.length, 1);
    assert.equal(window.localStorage.getItem("rj.mixerBassVolume"), "10");
  } finally {
    window.localStorage.clear();
    cleanup();
  }
});

test("the mute buttons flip state, update the button and re-render at once", () => {
  const { ctx, rerenders, cleanup } = setup();
  try {
    const btn = document.getElementById("mixerMelodyMuteBtn");
    btn.dispatchEvent(new window.Event("click"));
    assert.equal(ctx.state.mixer.melodyMuted, true);
    assert.equal(btn.classList.contains("is-muted"), true);
    assert.equal(btn.getAttribute("aria-pressed"), "true");
    assert.equal(document.getElementById("mixerMelodyReadout").textContent, "Muted");
    assert.equal(rerenders.length, 1);
    assert.equal(window.localStorage.getItem("rj.mixerMelodyMuted"), "1");

    btn.dispatchEvent(new window.Event("click"));
    assert.equal(ctx.state.mixer.melodyMuted, false);
    assert.equal(rerenders.length, 2);
  } finally {
    window.localStorage.clear();
    cleanup();
  }
});

function inactiveFlags() {
  return ["Bass", "Chords", "Comping", "Melody"].map(
    (cap) => document.getElementById(`mixerStrip${cap}`).classList.contains("is-inactive"),
  );
}

test("refresh() gates Bass/Chords on hasChords and Comping on compingActive, independently", () => {
  const { ctx, mixer, cleanup } = setup();
  try {
    ctx.state.hasChords = false;
    ctx.state.compingActive = true;
    mixer.refresh();
    // Melody has no gate — never dimmed.
    assert.deepEqual(inactiveFlags(), [true, true, false, false]);

    ctx.state.hasChords = true;
    ctx.state.compingActive = false;
    mixer.refresh();
    assert.deepEqual(inactiveFlags(), [false, false, true, false]);
  } finally {
    cleanup();
  }
});

test("loadMixerState defaults to full volume, Bass/Chords muted, Melody/Comping unmuted", () => {
  const page = mountPage();
  try {
    assert.deepEqual(loadMixerState(), {
      melodyVolume: 100, bassVolume: 100, chordsVolume: 100, compingVolume: 100,
      melodyMuted: false, bassMuted: true, chordsMuted: true, compingMuted: false,
    });
  } finally {
    page.cleanup();
  }
});

test("loadMixerState reads back persisted, clamped values", () => {
  const page = mountPage();
  try {
    window.localStorage.setItem("rj.mixerBassVolume", "150"); // clamped
    window.localStorage.setItem("rj.mixerChordsVolume", "20");
    window.localStorage.setItem("rj.mixerBassMuted", "0"); // explicit opt-in override
    assert.deepEqual(loadMixerState(), {
      melodyVolume: 100, bassVolume: 100, chordsVolume: 20, compingVolume: 100,
      melodyMuted: false, bassMuted: false, chordsMuted: true, compingMuted: false,
    });
  } finally {
    window.localStorage.clear();
    page.cleanup();
  }
});

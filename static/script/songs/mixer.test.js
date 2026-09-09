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
      mixer: {
        melodyVolume: 100, backingVolume: 100, melodyMuted: false, backingMuted: false, ...mixerState,
      },
    },
    sheet: { rerender: () => rerenders.push(1) },
  });
  const mixer = createMixer(ctx);
  mixer.init();
  return { page, ctx, mixer, rerenders, cleanup: page.cleanup };
}

test("init seeds both range inputs from ctx.state.mixer", () => {
  const { cleanup } = setup({ melodyVolume: 30, backingVolume: 70 });
  try {
    assert.equal(document.getElementById("mixerMelodyRange").value, "30");
    assert.equal(document.getElementById("mixerBackingRange").value, "70");
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
    const range = document.getElementById("mixerBackingRange");
    range.value = "10";
    range.dispatchEvent(new window.Event("input"));
    range.dispatchEvent(new window.Event("change"));
    assert.equal(rerenders.length, 1);
    assert.equal(window.localStorage.getItem("rj.mixerBackingVolume"), "10");
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

test("refresh() dims the backing-track strip when the tune has no comping", () => {
  const { ctx, mixer, cleanup } = setup();
  try {
    ctx.state.compingActive = false;
    mixer.refresh();
    assert.equal(document.getElementById("mixerBus").classList.contains("is-inactive"), true);

    ctx.state.compingActive = true;
    mixer.refresh();
    assert.equal(document.getElementById("mixerBus").classList.contains("is-inactive"), false);
  } finally {
    cleanup();
  }
});

test("loadMixerState defaults to full, unmuted volume with nothing persisted", () => {
  const page = mountPage();
  try {
    assert.deepEqual(loadMixerState(), {
      melodyVolume: 100, backingVolume: 100, melodyMuted: false, backingMuted: false,
    });
  } finally {
    page.cleanup();
  }
});

test("loadMixerState reads back persisted, clamped values", () => {
  const page = mountPage();
  try {
    window.localStorage.setItem("rj.mixerMelodyVolume", "150"); // clamped
    window.localStorage.setItem("rj.mixerBackingVolume", "20");
    window.localStorage.setItem("rj.mixerMelodyMuted", "1");
    assert.deepEqual(loadMixerState(), {
      melodyVolume: 100, backingVolume: 20, melodyMuted: true, backingMuted: false,
    });
  } finally {
    window.localStorage.clear();
    page.cleanup();
  }
});

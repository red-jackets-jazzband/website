import { test } from "node:test";
import assert from "node:assert/strict";
import { mountPage } from "../../../../tests/helpers/dom.js";
import { makeCtx } from "../../../../tests/helpers/ctx.js";
import { INSTRUMENTS } from "../../lib/music/instruments.js";
import { COMPING_PATTERNS } from "../../lib/music/comping.js";
import { SOLO_STYLES } from "../../lib/music/solo.js";
import { PRACTICE_EXERCISES, PRACTICE_RHYTHMS } from "../../lib/music/practice.js";
import {
  createInstrumentDropdown, createCompingDropdown, createPracticeDropdown, createSoloDropdown,
} from "./selects.js";

test("createInstrumentDropdown builds every instrument option into #sheetStatus", () => {
  const page = mountPage();
  try {
    const rerenders = [];
    createInstrumentDropdown(makeCtx({ sheet: { rerender: () => rerenders.push(1) } }));
    const select = document.getElementById("instrument");
    assert.ok(document.getElementById("sheetStatus").contains(select));
    assert.deepEqual(
      [...select.options].map((o) => o.value),
      INSTRUMENTS.map((i) => i.value),
    );
    assert.equal(select.getAttribute("aria-label"), "Instrument");

    select.value = "trombone";
    select.dispatchEvent(new window.Event("change"));
    assert.equal(rerenders.length, 1);
    assert.equal(window.localStorage.getItem("rj.instrument"), "trombone");
  } finally {
    page.cleanup();
  }
});

test("createInstrumentDropdown shows ctx.state.instrument and follows the store", () => {
  const page = mountPage();
  try {
    const ctx = makeCtx({ state: { instrument: "alto_saxophone" } });
    createInstrumentDropdown(ctx);
    const select = document.getElementById("instrument");
    assert.equal(select.value, "alto_saxophone");
    ctx.state.instrument = "trumpet"; // e.g. the tour restoring a snapshot
    assert.equal(select.value, "trumpet");
  } finally {
    page.cleanup();
  }
});

test("createCompingDropdown builds an OFF entry plus grouped patterns", () => {
  const page = mountPage();
  try {
    const rerenders = [];
    createCompingDropdown(makeCtx({ sheet: { rerender: () => rerenders.push(1) } }));
    const select = document.getElementById("comping");
    assert.equal(select.options[0].value, "off");
    assert.equal(
      select.querySelectorAll("optgroup").length,
      new Set(COMPING_PATTERNS.map((p) => p.group)).size,
    );
    assert.equal(
      select.querySelectorAll("option").length,
      COMPING_PATTERNS.length + 1,
    );

    select.value = COMPING_PATTERNS[0].value;
    select.dispatchEvent(new window.Event("change"));
    assert.equal(rerenders.length, 1);
    assert.equal(window.localStorage.getItem("rj.comping"), COMPING_PATTERNS[0].value);
  } finally {
    page.cleanup();
  }
});

test("createSoloDropdown builds an OFF entry plus one per style and re-renders on change", () => {
  const page = mountPage();
  try {
    const rerenders = [];
    const ctx = makeCtx({ sheet: { rerender: () => rerenders.push(1) } });
    createSoloDropdown(ctx);
    assert.equal(ctx.state.soloEnabled, true, "the picker switches Solo on");
    rerenders.length = 0;
    const select = document.getElementById("solo");
    assert.ok(document.getElementById("soloSlot").contains(select));
    assert.deepEqual(
      [...select.options].map((o) => o.value),
      ["off", ...SOLO_STYLES.map((s) => s.value)],
    );
    select.value = "armstrong";
    select.dispatchEvent(new window.Event("change"));
    assert.equal(rerenders.length, 1);
    assert.equal(window.localStorage.getItem("rj.solo"), "armstrong");
  } finally {
    page.cleanup();
  }
});

test("createPracticeDropdown builds an OFF entry plus one per exercise and re-renders on change", () => {
  const page = mountPage();
  try {
    const rerenders = [];
    const ctx = makeCtx({ sheet: { rerender: () => rerenders.push(1) } });
    createPracticeDropdown(ctx);
    const select = document.getElementById("practice");
    assert.ok(document.getElementById("practiceSlot").contains(select));
    assert.deepEqual(
      [...select.options].map((o) => o.value),
      ["off", ...PRACTICE_EXERCISES.map((e) => e.value)],
    );
    const rhythm = document.getElementById("practiceRhythm");
    const runs = document.getElementById("practiceRuns");
    const breath = document.getElementById("practiceBreath");
    const shown = (node) => !node.closest(".dropdown").hidden;
    assert.ok(!shown(rhythm) && !shown(runs) && !shown(breath), "rhythm, runs and breaths wait for an exercise");

    select.value = "enclosures";
    select.dispatchEvent(new window.Event("change"));
    assert.equal(rerenders.length, 1);
    assert.equal(window.localStorage.getItem("rj.practice"), "enclosures");
    assert.ok(shown(rhythm) && shown(runs) && shown(breath));
    assert.equal(breath.value, "4", "a breath every 4 bars by default");
    assert.deepEqual(
      [...rhythm.options].map((o) => o.value),
      ["varied", ...PRACTICE_RHYTHMS.map((r) => r.value)],
    );

    rhythm.value = "charleston";
    rhythm.dispatchEvent(new window.Event("change"));
    runs.value = "updown";
    runs.dispatchEvent(new window.Event("change"));
    assert.equal(rerenders.length, 3);
    assert.equal(window.localStorage.getItem("rj.practiceRhythm"), "charleston");
    assert.equal(window.localStorage.getItem("rj.practiceRuns"), "updown");
    breath.value = "off";
    breath.dispatchEvent(new window.Event("change"));
    assert.equal(window.localStorage.getItem("rj.practiceBreath"), "off");

    select.value = "guide";
    select.dispatchEvent(new window.Event("change"));
    assert.ok(shown(rhythm) && !shown(runs), "guide tones have no runs");
  } finally {
    page.cleanup();
  }
});

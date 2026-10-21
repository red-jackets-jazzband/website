import { test } from "node:test";
import assert from "node:assert/strict";
import { mountPage } from "../../../../tests/helpers/dom.js";
import { makeCtx } from "../../../../tests/helpers/ctx.js";
import { createSongForm } from "./song-form.js";
import { renderWordsTables } from "./form-strip.js";

const FILE = "gotta_woman.abc";
const STORE_KEY = `rj.songForm.${FILE}`;
const CLARINET = "Clarinet solo";
const DELETE_LAST = '[aria-label="Delete round 3"]';
const SONG = "X:1\nT:Woman\nK:C\nP:A\nC4|\nP:B\nD4|]";
const TABLES = [{
  header: null,
  rows: [["1", "A B", "Collective; count-off: 3 tempo ticks"], ["2", "A B A B", "Vocals"], ["3", "A B", CLARINET]],
}];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const click = (node) => node.dispatchEvent(new window.Event("click", { bubbles: true }));
const label = (selector) => $(selector).getAttribute("aria-label");
const CARD = ".songForm-card";
const leads = () => $$(".songForm .songForm-lead").map((node) => node.textContent);
const parts = (round) => $$(CARD)[round].querySelectorAll(".songForm-chip").length;

function setup({ stored } = {}) {
  const page = mountPage();
  if (stored) localStorage.setItem(STORE_KEY, stored);
  const ctx = makeCtx();
  ctx.songForm = createSongForm(ctx);
  // What a live render does: draw the band's strip, then publish the tune.
  const openSong = (file = FILE, tables = TABLES) => {
    ctx.store.set("nav", { currentSongFile: file });
    renderWordsTables(document.getElementById("chordtable"), tables);
    ctx.store.set("tune", { currentSongText: SONG, formTables: tables, songSerial: ctx.state.songSerial + 1 });
  };
  const cleanup = () => {
    localStorage.clear();
    page.cleanup();
  };
  return { ctx, openSong, leads, parts, cleanup };
}

const editButton = () => $(".songForm-tools .songForm-icon-btn");
const button = (text) => $$(".songForm-editor button").find((node) => node.textContent === text);

test("a song shows the band's strip with only a pencil under it", () => {
  const { openSong, leads, cleanup } = setup();
  try {
    openSong();
    assert.deepEqual(leads(), ["Collective", "Vocals", CLARINET]);
    assert.equal($(".songForm--mine"), null);
    assert.equal($(".songForm-switch"), null);
    assert.equal(label(".songForm-tools .songForm-icon-btn"), "Make your own version of the song form");
  } finally {
    cleanup();
  }
});

test("the pencil opens one card per round, and the strip follows every edit", () => {
  const { openSong, leads, parts, cleanup } = setup();
  try {
    openSong();
    click(editButton());
    assert.equal($$(CARD).length, 3);
    assert.equal(document.activeElement, $(CARD));

    const lead = $$(".songForm-field--lead")[2];
    lead.value = "Banjo solo";
    lead.dispatchEvent(new window.Event("input"));
    assert.deepEqual(leads(), ["Collective", "Vocals", "Banjo solo"]);
    assert.ok($(".songForm--mine"));
    assert.equal($$(".songForm-changed").length, 1);

    click($$(CARD)[0].querySelector('[aria-label="Add part A to round 1"]'));
    assert.equal(parts(0), 3);
    click($$(CARD)[0].querySelector('[aria-label="Repeat round 1 as long as it takes"]'));
    assert.equal($$(CARD)[0].querySelector(".songForm-chip--more").textContent, "…×");
    click($$(CARD)[0].querySelector(".songForm-chip"));
    assert.equal(parts(0), 3);
  } finally {
    cleanup();
  }
});

test("rounds move, duplicate and delete from their buttons", () => {
  const { openSong, leads, cleanup } = setup();
  try {
    openSong();
    click(editButton());
    click($('[aria-label="Move round 1 down"]'));
    assert.deepEqual(leads(), ["Vocals", "Collective", CLARINET]);
    assert.equal($('[aria-label="Move round 1 up"]').disabled, true);
    click($('[aria-label="Duplicate round 3"]'));
    click($('[aria-label="Delete round 1"]'));
    assert.deepEqual(leads(), ["Collective", CLARINET, CLARINET]);
    click($(".songForm-add-round"));
    assert.equal($$(CARD).length, 4);
  } finally {
    cleanup();
  }
});

test("save keeps your version, and the switch flips between it and the band's", () => {
  const { openSong, leads, cleanup } = setup();
  try {
    openSong();
    click(editButton());
    click($(DELETE_LAST));
    click(button("Save"));

    assert.equal($(".songForm-editor"), null);
    assert.deepEqual(leads(), ["Collective", "Vocals"]);
    assert.ok($(".songForm--mine"));
    const stored = JSON.parse(localStorage.getItem(STORE_KEY));
    assert.equal(stored.show, "mine");
    assert.deepEqual(stored.rows.map((row) => row[2]), ["Collective; count-off: 3 tempo ticks", "Vocals"]);

    click($('[aria-label="The band\'s form"]'));
    assert.deepEqual(leads(), ["Collective", "Vocals", CLARINET]);
    assert.equal($(".songForm--mine"), null);
    assert.equal(JSON.parse(localStorage.getItem(STORE_KEY)).show, "band");
    assert.equal(label(".songForm-tools .songForm-icon-btn"), "Edit my version of the song form");

    click($('[aria-label="My version"]'));
    assert.deepEqual(leads(), ["Collective", "Vocals"]);
    assert.equal($('[aria-label="My version"]').getAttribute("aria-pressed"), "true");
  } finally {
    cleanup();
  }
});

test("a version that matches the band's isn't kept", () => {
  const { openSong, cleanup } = setup();
  try {
    openSong();
    click(editButton());
    click($(DELETE_LAST));
    click($('[aria-label="Back to the band\'s form"]'));
    click(button("Save"));
    assert.equal(localStorage.getItem(STORE_KEY), null);
    assert.equal($(".songForm-switch"), null);
  } finally {
    cleanup();
  }
});

test("cancel leaves everything as it was", () => {
  const { openSong, leads, cleanup } = setup();
  try {
    openSong();
    click(editButton());
    click($('[aria-label="Delete round 1"]'));
    click(button("Cancel"));
    assert.deepEqual(leads(), ["Collective", "Vocals", CLARINET]);
    assert.equal(localStorage.getItem(STORE_KEY), null);
  } finally {
    cleanup();
  }
});

test("the form copies as the W: lines a song's file carries", () => {
  const { openSong, cleanup } = setup();
  try {
    openSong();
    click(editButton());
    click($('[aria-label="Copy as text"]'));
    assert.equal($(".songForm-text-area").value, [
      "W:| 1 | A B | Collective; count-off: 3 tempo ticks |",
      "W:| 2 | A B A B | Vocals |",
      "W:| 3 | A B | Clarinet solo |",
    ].join("\n"));
  } finally {
    cleanup();
  }
});

test("each song has its own version, read back when it opens again", () => {
  const stored = JSON.stringify({ show: "mine", rows: [["1", "A B ...", "Collective"]] });
  const { openSong, leads, cleanup } = setup({ stored });
  try {
    openSong();
    assert.deepEqual(leads(), ["Collective"]);
    assert.ok($(".songForm-part--more"));
    openSong("other.abc");
    assert.deepEqual(leads(), ["Collective", "Vocals", CLARINET]);
    assert.equal($(".songForm-switch"), null);
  } finally {
    cleanup();
  }
});

test("opening another song closes the editor", () => {
  const { openSong, cleanup } = setup();
  try {
    openSong();
    click(editButton());
    openSong("other.abc");
    assert.equal($(".songForm-editor"), null);
  } finally {
    cleanup();
  }
});

test("a chip's arrow keys move it within its round", () => {
  const { openSong, cleanup } = setup();
  try {
    openSong();
    click(editButton());
    const first = $$(CARD)[0].querySelector(".songForm-chip");
    first.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    const names = $$(CARD)[0].querySelectorAll(".songForm-chip");
    assert.deepEqual([...names].map((node) => node.firstChild.textContent), ["B", "A"]);
    assert.equal(document.activeElement, names[1]);
  } finally {
    cleanup();
  }
});

test("dragging a round by its grip moves it", () => {
  const { openSong, leads, cleanup } = setup();
  try {
    openSong();
    click(editButton());
    const cards = $$(CARD);
    document.elementFromPoint = () => cards[2];
    const pointer = (type, target, x) => target.dispatchEvent(new window.MouseEvent(type, { bubbles: true, clientX: x, clientY: 0, button: 0 }));
    pointer("pointerdown", cards[0].querySelector(".songForm-grip"), 0);
    pointer("pointermove", window, 50);
    assert.ok(cards[2].classList.contains("is-drop-after"));
    pointer("pointerup", window, 50);
    assert.deepEqual(leads(), ["Vocals", CLARINET, "Collective"]);
  } finally {
    cleanup();
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mountPage } from "../../../tests/helpers/dom.js";
import { makeCtx } from "../../../tests/helpers/ctx.js";
import { createAbcjsStub, withAbcjs } from "../../../tests/helpers/stubs.js";
import { createSetlistPrint } from "./setlist-print.js";

const ABC = {
  "a.abc": "X:1\nT:Song A\nQ:1/4=120\nK:Bb\nB2|",
  "b.abc": "X:1\nT:Song B\nQ:1/4=90\nK:F\nF2|",
};

function setup(instrument = "concert_pitch") {
  const page = mountPage();
  const sel = document.createElement("select");
  sel.id = "instrument";
  const o = document.createElement("option");
  o.value = instrument;
  sel.append(o);
  document.getElementById("sheetStatus").append(sel);

  const bookletRenders = [];
  const pending = [];
  const ctx = makeCtx({
    songName: (f) => f.replace(".abc", "").toUpperCase(),
    // async like the real XHR helper — the stage list is appended before these
    // callbacks fire, so per-song meta lands in cells that already exist.
    readFile: (path, onLoad) => {
      const file = path.split("/").pop();
      if (ABC[file]) pending.push(Promise.resolve().then(() => onLoad(ABC[file])));
    },
    sheet: { renderIntoBooklet: (text, targets) => bookletRenders.push(targets) },
  });
  const print = createSetlistPrint(ctx);
  const settle = () => Promise.all(pending);
  return { page, ctx, print, bookletRenders, settle, cleanup: page.cleanup };
}

const SONGS = [
  { file: "a.abc", key: "" },
  { file: "b.abc", key: "2" },
  { divider: "Set 2" },
  { file: "a.abc", key: "" },
];

test("buildBooklet lays out front matter, per-song blocks and the stage list", async () => {
  const { print, bookletRenders, settle, cleanup } = setup();
  try {
    withAbcjs(createAbcjsStub(), () => print.buildBooklet("Gig", SONGS, ""));
    await settle();
    const container = document.getElementById("setlistPrintBooklet");

    assert.equal(container.querySelector(".setlist-booklet-fm-title").textContent, "Gig");
    // one engraved block per song (3), each targeting its own ids
    assert.equal(container.querySelectorAll(".setlist-booklet-song").length, 3);
    assert.equal(bookletRenders.length, 3);
    assert.equal(bookletRenders[0].notationId, "setlistPrintNotation-1");
    assert.equal(bookletRenders[0].titlePrefix, "1. ");

    // stage list: per-set numbering, a "Set 2" row, tempo filled from Q:
    const stageRows = [...container.querySelectorAll(".setlist-stage-table tbody tr")];
    assert.deepEqual(
      stageRows.filter((r) => r.querySelector(".stage-c-num")).map((r) => r.querySelector(".stage-c-num").textContent),
      ["1.", "2.", "1."],
    );
    assert.ok(stageRows.some((r) => r.querySelector("th") && r.querySelector("th").textContent === "Set 2"));
    assert.equal(document.getElementById("setlistStageTempo-1").textContent, "120");
    assert.equal(document.getElementById("setlistStageConcert-2").textContent, "G"); // F + 2
  } finally {
    cleanup();
  }
});

test("a transposing instrument adds its own key column", async () => {
  const { print, settle, cleanup } = setup("trumpet");
  try {
    withAbcjs(createAbcjsStub(), () => print.buildBooklet("Gig", SONGS, ""));
    await settle();
    const heads = [...document.querySelectorAll(".setlist-stage-table thead th")].map((h) => h.textContent);
    assert.ok(heads.includes("Trumpet"));
    assert.equal(document.getElementById("setlistStageInstr-1").textContent, "C"); // Bb + trumpet +2
  } finally {
    cleanup();
  }
});

test("print(mode) stamps the body classes and the front-matter subtitle", async () => {
  const { print, settle, cleanup } = setup();
  try {
    window.print = () => {};
    withAbcjs(createAbcjsStub(), () => print.buildBooklet("Gig", SONGS, ""));
    await settle();
    print.print("chordbook");
    assert.ok(document.body.classList.contains("export-booklet-mode"));
    assert.ok(document.body.classList.contains("export-mode-chordbook"));
    assert.equal(document.getElementById("setlistBookletFmSub").textContent, "Chordbook");
    window.dispatchEvent(new window.Event("afterprint"));
    assert.equal(document.body.classList.contains("export-booklet-mode"), false);
  } finally {
    cleanup();
  }
});

test("a personal-setlist desc adds a cover page", async () => {
  const { print, settle, cleanup } = setup();
  try {
    withAbcjs(createAbcjsStub(), () => print.buildBooklet("Gig", SONGS, "Our summer set"));
    await settle();
    const cover = document.querySelector("#setlistPrintBooklet .setlist-cover");
    assert.ok(cover);
    assert.equal(cover.querySelector("p").textContent, "Our summer set");
  } finally {
    cleanup();
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TOUR_LANGS, parseTourMarkdown, tourStructureProblems } from "../static/script/lib/tour/tour-content.js";
import { TOUR_ACTION_NAMES } from "../static/script/songs/tour/actions.js";
import { mountPage } from "./helpers/dom.js";

/*
  The guided tour's copy is data (static/tour/tour.<lang>.md), so nothing else
  would notice a missing translation, a `setup:` typo, or a spotlight target
  that no longer exists after a markup change. These tests read the real files.
*/

const read = (relative) => readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
const tour = Object.fromEntries(TOUR_LANGS.map((lang) => [lang, parseTourMarkdown(read(`static/tour/tour.${lang}.md`))]));
const english = tour.en;
const songsPage = read("layouts/shortcodes/songs-app.html");

// Targets the tour points at that the songs-app shortcode doesn't contain: they're created at
// runtime, by the module (and string) named here.
const RUNTIME_TARGETS = {
  "#tourBtn": ["layouts/partials/intro.html", 'id="tourBtn"'],
  ".songForm": ["static/script/songs/sheet/sheet.js", 'class: "songForm"'],
  "#instrument": ["static/script/songs/sheet/selects.js", 'id: "instrument"'],
  "#iRealPro": ["static/script/songs/sheet/irealpro-link.js", 'id: "iRealPro"'],
  "#inspirationLink": ["static/script/songs/inspiration/inspiration.js", 'btn.id = "inspirationLink"'],
  "#compingSplitBtn": ["static/script/songs/sheet/selects.js", 'id: "compingSplitBtn"'],
  "#compingParts": ["static/script/songs/sheet/selects.js", 'id: "compingParts"'],
  ".rj-library-new-setlist-btn": ["static/script/songs/setlists/home.js", 'class: "rj-library-new-setlist-btn"'],
  ".rj-library-add-song-field": ["static/script/songs/setlists/add-song.js", 'class: "rj-library-add-song-field"'],
  ".rj-library-add-break": ["static/script/songs/setlists/add-song.js", 'class: "rj-library-add-break"'],
  ".setlist-divider-input": ["static/script/songs/setlists/view.js", 'class: "setlist-divider-input"'],
  ".setlist-split-btn": ["static/script/songs/setlists/view.js", 'class: "setlist-split-btn"'],
  ".setlist-set-merge": ["static/script/songs/setlists/view.js", 'class: "setlist-set-merge"'],
  '.rj-layer-row[data-layer="progressions"]': ["static/script/songs/layers/panel.js", "dataset: { layer: layer.id }"],
  '.rj-layer-row[data-layer="fingerings"]': ["static/script/songs/layers/panel.js", "dataset: { layer: layer.id }"],
  '.rj-layer-row[data-layer="scale-degrees"]': ["static/script/songs/layers/panel.js", "dataset: { layer: layer.id }"],
  ".rj-layer-degree-circle": ["static/script/songs/layers/overlays/degrees.js", "rj-layer-degree-circle"],
  ".rj-layer-prog-band": ["static/script/songs/layers/overlays/progression-bands.js", "rj-layer-prog-band"],
  ".setlist-song-note-add": ["static/script/songs/setlists/view.js", 'class: "setlist-song-note-add"'],
};

const allSteps = english.chapters.flatMap((chapter) => chapter.steps.map((step) => ({ chapter, step })));
const label = ({ chapter, step }) => `${chapter.id}/${step.id}`;

test("every language file parses to the same chapters and steps as English", () => {
  assert.ok(english.chapters.length >= 6, "English tour has its chapters");
  for (const lang of TOUR_LANGS.filter((code) => code !== "en")) {
    assert.deepEqual(tourStructureProblems(english, tour[lang]), [], `tour.${lang}.md`);
  }
});

test("every language has copy for every step, and no leftover English metadata", () => {
  for (const lang of TOUR_LANGS) {
    for (const chapter of tour[lang].chapters) {
      for (const step of chapter.steps) {
        assert.ok(step.title && step.body.length, `${lang} ${chapter.id}/${step.id}`);
        if (lang !== "en") {
          // Structure lives in English only; a copy-pasted target/setup would silently do nothing.
          assert.deepEqual(step.targets, [], `${lang} ${chapter.id}/${step.id} repeats target:`);
          assert.deepEqual(step.setup, [], `${lang} ${chapter.id}/${step.id} repeats setup:`);
        }
      }
    }
  }
});

test("English step ids are unique within their chapter and every step but the welcome has a target", () => {
  for (const chapter of english.chapters) {
    const ids = chapter.steps.map((step) => step.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate step id in ${chapter.id}`);
  }
  for (const item of allSteps) {
    // The welcome card is centred: it introduces the chapter dots in the card itself.
    if (item.chapter === english.chapters[0] && item.step.id === "welcome") continue;
    assert.ok(item.step.targets.length > 0, `${label(item)} has no target`);
  }
});

test("every setup name is a real tour action", () => {
  const known = new Set(TOUR_ACTION_NAMES);
  for (const chapter of english.chapters) {
    for (const name of chapter.setup) assert.ok(known.has(name), `${chapter.id}: unknown setup "${name}"`);
  }
  for (const item of allSteps) {
    for (const name of item.step.setup) assert.ok(known.has(name), `${label(item)}: unknown setup "${name}"`);
  }
});

test("every step that needs comping on also keeps the More-controls drawer open", () => {
  // sheet.js only renders the comping staff (and the Mixer's Comping voice)
  // while #sheetmenu has .show-advanced; the tour closes any drawer a step
  // doesn't ask for, so a comping step must ask for it.
  for (const item of allSteps) {
    const setup = [...item.chapter.setup, ...item.step.setup];
    if (setup.includes("compingOn")) assert.ok(setup.includes("openDrawer"), `${label(item)} uses compingOn without openDrawer`);
  }
});

test("every target selector is valid and points at something the page has", () => {
  const { document, cleanup } = mountPage();
  try {
    for (const item of allSteps) {
      for (const selector of item.step.targets) {
        assert.doesNotThrow(() => document.querySelector(selector), `${label(item)}: bad selector ${selector}`);
        const runtime = RUNTIME_TARGETS[selector];
        if (runtime) {
          assert.ok(read(runtime[0]).includes(runtime[1]), `${label(item)}: ${selector} no longer created in ${runtime[0]}`);
        } else {
          const name = selector.slice(1);
          const found = selector.startsWith("#")
            ? songsPage.includes(`id="${name}"`)
            : new RegExp(`class="[^"]*\\b${name}\\b`).test(songsPage);
          assert.ok(found, `${label(item)}: ${selector} isn't in layouts/shortcodes/songs-app.html`);
        }
      }
    }
  } finally {
    cleanup();
  }
});

test("the tour's UI strings cover everything songs/tour.js reads", () => {
  const needed = [
    "next", "back", "skip", "done", "progress", "chapters", "language", "close",
    "helpLabel",
  ];
  for (const lang of TOUR_LANGS) {
    for (const key of needed) assert.ok(tour[lang].ui[key], `${lang} ui.${key}`);
  }
});

test("the demo song and setlist the tour opens exist", () => {
  const songs = read("static/songs/index_of_songs.txt");
  const setlists = read("static/setlists/index_of_setlists.txt");
  assert.ok(songs.includes("bill_bailey.abc"));
  assert.ok(setlists.includes("setlist_2026.txt"));
  assert.ok(read("static/setlists/setlist_2026.txt").includes("bill_bailey.abc"));
});

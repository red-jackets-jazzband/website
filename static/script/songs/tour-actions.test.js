import { test } from "node:test";
import assert from "node:assert/strict";
import { mountPage } from "../../../tests/helpers/dom.js";
import { makeCtx } from "../../../tests/helpers/ctx.js";
import {
  DEMO_SETLIST_FILE, DEMO_SONG_FILE, TOUR_ACTION_NAMES, createTourActions, isShown, waitUntil,
} from "./tour-actions.js";

const DRAWER_CLASS = "show-advanced";

// A ctx whose collaborators just record what the actions asked of them.
function setup({ state = {}, sheetLoadMs = 10 } = {}) {
  const page = mountPage();
  const calls = [];
  const ctx = makeCtx({
    state,
    mixer: { setOpen: (open) => calls.push(`mixer:${open}`) },
    inspiration: { setOpen: (open) => calls.push(`inspiration:${open}`) },
    audio: { stop: () => calls.push("audio.stop") },
    switchTab: (tab) => {
      calls.push(`tab:${tab}`);
      ctx.state.activeTab = tab;
      ctx.state.setlistsView = "home";
    },
    openLibrarySong: (song) => {
      calls.push(`song:${song.file}`);
      ctx.state.currentSongFile = song.file;
      setTimeout(() => { ctx.state.currentSongText = `X:1 ${song.file}`; }, sheetLoadMs);
    },
  });
  ctx.setlistView = {
    openBand: (file, name, done) => {
      calls.push(`setlist:${file}`);
      ctx.state.setlistsView = "open";
      ctx.state.currentSetlistId = file.replace(/\.txt$/, "");
      ctx.state.currentSongFile = null;
      done();
    },
  };
  // The drawer button flips .show-advanced the way sheet-controls.js does.
  const sheetmenu = document.getElementById("sheetmenu");
  document.getElementById("advancedToggleBtn").addEventListener("click", () => {
    sheetmenu.classList.toggle(DRAWER_CLASS);
  });
  const select = document.createElement("select");
  select.id = "comping";
  select.innerHTML = '<option value="off">off</option><option value="on_2_and_4">on 2 and 4</option>';
  select.addEventListener("change", () => {
    calls.push(`comping:${select.value}`);
    ctx.state.compingActive = select.value !== "off";
  });
  document.getElementById("compingSlot").append(select);
  return { ctx, calls, select, sheetmenu, actions: createTourActions(ctx), cleanup: page.cleanup };
}

test("the exported action names are exactly the actions createTourActions provides", () => {
  const { actions, cleanup } = setup();
  try {
    assert.deepEqual(Object.keys(actions.actions).sort(), [...TOUR_ACTION_NAMES].sort());
  } finally {
    cleanup();
  }
});

test("waitUntil resolves true as soon as the predicate holds, false on timeout", async () => {
  const { cleanup } = setup();
  try {
    let ready = false;
    setTimeout(() => { ready = true; }, 20);
    assert.equal(await waitUntil(() => ready, { timeout: 1000, interval: 5 }), true);
    assert.equal(await waitUntil(() => false, { timeout: 30, interval: 5 }), false);
  } finally {
    cleanup();
  }
});

test("isShown is false for [hidden] and for anything under a hidden ancestor", () => {
  const { cleanup } = setup();
  try {
    const search = document.getElementById("songSearch");
    assert.equal(isShown(search), true);
    document.getElementById("librarySearchRow").hidden = true;
    assert.equal(isShown(search), false);
    assert.equal(isShown(null), false);
  } finally {
    cleanup();
  }
});

test("apply() shuts every panel the step doesn't ask for, and keeps the ones it does", async () => {
  const { actions, calls, sheetmenu, cleanup } = setup();
  try {
    sheetmenu.classList.add(DRAWER_CLASS);
    await actions.apply([]);
    assert.deepEqual(calls, ["mixer:false", "inspiration:false"]);
    assert.equal(sheetmenu.classList.contains(DRAWER_CLASS), false);

    calls.length = 0;
    await actions.apply(["openDrawer", "openMixer"]);
    assert.deepEqual(calls, ["inspiration:false", "mixer:true"]);
    assert.equal(sheetmenu.classList.contains(DRAWER_CLASS), true);
  } finally {
    cleanup();
  }
});

test("openDemoSong opens the demo once, waits for the render, then leaves it alone", async () => {
  const { actions, calls, ctx, cleanup } = setup({ state: { activeTab: "setlists" } });
  try {
    await actions.apply(["openDemoSong"]);
    assert.deepEqual(calls.filter((c) => c.startsWith("tab:") || c.startsWith("song:")), [
      "tab:library", `song:${DEMO_SONG_FILE}`,
    ]);
    assert.equal(ctx.state.currentSongText, `X:1 ${DEMO_SONG_FILE}`);

    calls.length = 0;
    await actions.apply(["openDemoSong"]);
    assert.equal(calls.some((c) => c.startsWith("song:")), false);
    // Re-applied on a phone after leaving the sheet, it brings the sheet back.
    assert.equal(document.body.classList.contains("rj-sheet-active"), true);
  } finally {
    cleanup();
  }
});

test("openDemoSong does nothing new when the demo is already the open song", async () => {
  const { actions, calls, cleanup } = setup({ state: { currentSongFile: DEMO_SONG_FILE } });
  try {
    actions.begin();
    await actions.apply(["openDemoSong"]);
    assert.equal(calls.some((c) => c.startsWith("song:")), false);
  } finally {
    cleanup();
  }
});

test("openDemoSetlist opens the band setlist from the index, once", async () => {
  const { actions, calls, ctx, cleanup } = setup({
    state: { setlistIndex: [{ file: DEMO_SETLIST_FILE, name: "Setlist 2026" }] },
  });
  try {
    await actions.apply(["openDemoSetlist"]);
    assert.deepEqual(calls.filter((c) => c.startsWith("setlist:") || c.startsWith("tab:")), [
      "tab:setlists", `setlist:${DEMO_SETLIST_FILE}`,
    ]);
    assert.equal(ctx.state.setlistsView, "open");

    calls.length = 0;
    await actions.apply(["openDemoSetlist"]);
    assert.equal(calls.some((c) => c.startsWith("setlist:")), false);
  } finally {
    cleanup();
  }
});

test("showSetlists returns to the setlist home even from an open setlist", async () => {
  const { actions, calls, ctx, cleanup } = setup({ state: { activeTab: "setlists", setlistsView: "open" } });
  try {
    await actions.apply(["showSetlists"]);
    assert.deepEqual(calls.filter((c) => c.startsWith("tab:")), ["tab:setlists"]);
    assert.equal(ctx.state.setlistsView, "home");
    calls.length = 0;
    await actions.apply(["showSetlists"]);
    assert.deepEqual(calls.filter((c) => c.startsWith("tab:")), []);
  } finally {
    cleanup();
  }
});

test("on a stacked (phone) layout, showLibrary leaves the sheet through its own back button", async () => {
  const { actions, cleanup } = setup();
  try {
    document.body.classList.add("rj-sheet-active");
    document.getElementById("sheetBackBtn").addEventListener("click", () => {
      document.body.classList.remove("rj-sheet-active");
    });
    await actions.apply(["showLibrary"]);
    assert.equal(document.body.classList.contains("rj-sheet-active"), false);
  } finally {
    cleanup();
  }
});

test("compingOn picks the demo pattern only when comping was off", async () => {
  const { actions, calls, select, cleanup } = setup();
  try {
    await actions.apply(["compingOn"]);
    assert.equal(select.value, "on_2_and_4");
    assert.deepEqual(calls.filter((c) => c.startsWith("comping:")), ["comping:on_2_and_4"]);

    calls.length = 0;
    await actions.apply(["compingOn"]);
    assert.deepEqual(calls.filter((c) => c.startsWith("comping:")), []);
  } finally {
    cleanup();
  }
});

test("compingOn keeps a pattern the visitor picked themselves rather than swapping in the demo's", async () => {
  const { actions, calls, select, cleanup } = setup();
  try {
    select.insertAdjacentHTML("beforeend", '<option value="charleston">charleston</option>');
    select.value = "charleston";
    await actions.apply(["compingOn"]);
    assert.equal(select.value, "charleston");
    assert.deepEqual(calls.filter((c) => c.startsWith("comping:")), []);
  } finally {
    cleanup();
  }
});

test("begin() silences playback; end() puts back the drawer, comping and the visitor's own song", async () => {
  const { actions, calls, ctx, select, sheetmenu, cleanup } = setup({
    state: { currentSongFile: "all_of_me.abc", activeTab: "library" },
  });
  try {
    select.value = "off";
    actions.begin();
    assert.ok(calls.includes("audio.stop"));

    await actions.apply(["openDemoSong", "openDrawer", "compingOn"]);
    assert.equal(ctx.state.currentSongFile, DEMO_SONG_FILE);
    assert.equal(select.value, "on_2_and_4");
    assert.equal(sheetmenu.classList.contains(DRAWER_CLASS), true);

    calls.length = 0;
    actions.end();
    assert.equal(select.value, "off");
    assert.equal(sheetmenu.classList.contains(DRAWER_CLASS), false);
    assert.equal(ctx.state.currentSongFile, "all_of_me.abc");
    assert.ok(calls.includes("mixer:false") && calls.includes("inspiration:false"));

    calls.length = 0;
    actions.end();
    assert.deepEqual(calls, [], "a second end() is a no-op");
  } finally {
    cleanup();
  }
});

test("end() leaves the demo open when the visitor had no song of their own", async () => {
  const { actions, calls, ctx, cleanup } = setup();
  try {
    actions.begin();
    await actions.apply(["openDemoSong"]);
    calls.length = 0;
    actions.end();
    assert.equal(ctx.state.currentSongFile, DEMO_SONG_FILE);
    assert.equal(calls.some((c) => c.startsWith("song:")), false);
  } finally {
    cleanup();
  }
});

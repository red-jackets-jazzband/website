import { test } from "node:test";
import assert from "node:assert/strict";
import { mountPage } from "../../../tests/helpers/dom.js";
import { makeCtx } from "../../../tests/helpers/ctx.js";
import { createAbcjsStub } from "../../../tests/helpers/stubs.js";
import { GM_VOICES } from "../lib/gm-voices.js";
import { createOffline } from "./offline.js";

const SONG_INDEX = "Bourbon Street Parade,bourbon_street_parade.abc\nFive Foot Two,five_foot_two.abc\n";
const SETLIST_INDEX = "Setlist 2026,setlist_2026.txt\n";
const TOUR_MD = "# ui\n";

function fakeFetch(calls, { failOn = [] } = {}) {
  return (path) => {
    calls.push(path);
    if (failOn.includes(path)) return Promise.reject(new Error("network error"));
    let body = "";
    if (path === "/songs/index_of_songs.txt") body = SONG_INDEX;
    else if (path === "/setlists/index_of_setlists.txt") body = SETLIST_INDEX;
    else if (path.startsWith("/tour/")) body = TOUR_MD;
    return Promise.resolve({ text: () => Promise.resolve(body) });
  };
}

function setup({ serviceWorkerSupported = true } = {}) {
  const page = mountPage();
  const registerCalls = [];
  if (serviceWorkerSupported) {
    navigator.serviceWorker = {
      register: (url, options) => {
        registerCalls.push({ url, options });
        return Promise.resolve({});
      },
      ready: Promise.resolve(),
    };
  } else {
    delete navigator.serviceWorker;
  }
  const ctx = makeCtx();
  const offline = createOffline(ctx);
  return {
    page, ctx, offline, registerCalls, cleanup: page.cleanup,
  };
}

// A downloadForOffline() run stays inside its own many-await async chain
// long after any synchronous wrapper (stubs.js's withAbcjs included) would
// already have torn its stub down — so, unlike every other ABCJS-stubbing
// test in this suite, this file installs the stub for the run's whole
// (awaited) duration itself rather than reaching for that helper.
async function runWithAbcjs(stub, fn) {
  globalThis.ABCJS = stub;
  try {
    return await fn();
  } finally {
    delete globalThis.ABCJS;
  }
}

test("init() hides the button and never registers when serviceWorker isn't supported", () => {
  const {
    offline, registerCalls, cleanup,
  } = setup({ serviceWorkerSupported: false });
  try {
    offline.init();
    assert.equal(document.getElementById("offlineBtn").hidden, true);
    assert.equal(registerCalls.length, 0);
  } finally {
    cleanup();
  }
});

test("init() registers the service worker at /songs/ scope and wires the button", () => {
  const { offline, registerCalls, cleanup } = setup();
  try {
    offline.init();
    assert.equal(document.getElementById("offlineBtn").hidden, false);
    assert.equal(registerCalls.length, 1);
    assert.equal(registerCalls[0].url, "/sw.js");
    assert.deepEqual(registerCalls[0].options, { scope: "/songs/", type: "module" });
  } finally {
    cleanup();
  }
});

test("downloadForOffline fetches the indexes, every song/setlist/tour file, warms every curated voice, and reports status", async () => {
  const { offline, cleanup } = setup();
  const fetchCalls = [];
  globalThis.fetch = fakeFetch(fetchCalls);
  try {
    await runWithAbcjs(createAbcjsStub(), () => offline.downloadForOffline());

    assert.ok(fetchCalls.includes("/songs/index_of_songs.txt"));
    assert.ok(fetchCalls.includes("/setlists/index_of_setlists.txt"));
    assert.ok(fetchCalls.includes("/songs/bourbon_street_parade.abc"));
    assert.ok(fetchCalls.includes("/songs/five_foot_two.abc"));
    assert.ok(fetchCalls.includes("/setlists/setlist_2026.txt"));
    for (const lang of ["en", "nl", "de", "fr"]) {
      assert.ok(fetchCalls.includes(`/tour/tour.${lang}.md`));
    }

    assert.equal(document.getElementById("offlineStatus").textContent, "Available offline.");
    assert.equal(document.getElementById("offlineStatus").hidden, false);
  } finally {
    delete globalThis.fetch;
    cleanup();
  }
});

test("downloadForOffline renders every curated GM voice through CreateSynth against the current soundfont", async () => {
  const { ctx, offline, cleanup } = setup();
  ctx.state.highQualityAudio = false;
  globalThis.fetch = fakeFetch([]);
  const stub = createAbcjsStub();
  try {
    await runWithAbcjs(stub, () => offline.downloadForOffline());
    assert.equal(stub.calls.createSynths.length, GM_VOICES.length);
    const programs = stub.calls.createSynths.map((c) => c.init.options.program).sort((a, b) => a - b);
    assert.deepEqual(programs, GM_VOICES.map((v) => v.value).sort((a, b) => a - b));
    stub.calls.createSynths.forEach((c) => {
      assert.match(c.init.options.soundFontUrl, /FatBoy/);
    });
  } finally {
    delete globalThis.fetch;
    cleanup();
  }
});

test("downloadForOffline warms the high-quality soundfont set when that's the current preference", async () => {
  const { ctx, offline, cleanup } = setup();
  ctx.state.highQualityAudio = true;
  globalThis.fetch = fakeFetch([]);
  const stub = createAbcjsStub();
  try {
    await runWithAbcjs(stub, () => offline.downloadForOffline());
    stub.calls.createSynths.forEach((c) => {
      assert.match(c.init.options.soundFontUrl, /MusyngKite/);
    });
  } finally {
    delete globalThis.fetch;
    cleanup();
  }
});

test("a failed fetch is skipped, not fatal — the run still completes", async () => {
  const { offline, cleanup } = setup();
  globalThis.fetch = fakeFetch([], { failOn: ["/songs/five_foot_two.abc"] });
  try {
    await runWithAbcjs(createAbcjsStub(), () => offline.downloadForOffline());
    assert.equal(document.getElementById("offlineStatus").textContent, "Available offline.");
  } finally {
    delete globalThis.fetch;
    cleanup();
  }
});

test("a second concurrent call is a no-op while a download is already running", async () => {
  const { offline, cleanup } = setup();
  globalThis.fetch = fakeFetch([]);
  try {
    const first = runWithAbcjs(createAbcjsStub(), () => offline.downloadForOffline());
    const second = offline.downloadForOffline(); // no-op: a run is already in flight
    await Promise.all([first, second]);
    assert.equal(document.getElementById("offlineStatus").textContent, "Available offline.");
  } finally {
    delete globalThis.fetch;
    cleanup();
  }
});

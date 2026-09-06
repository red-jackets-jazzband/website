import { test } from "node:test";
import assert from "node:assert/strict";
import { mountPage } from "./helpers/dom.js";
import { createAbcjsStub, fakeYtPlayer, withTonal } from "./helpers/stubs.js";

test("mountPage exposes the songs-page skeleton and browser globals", () => {
  const { cleanup } = mountPage();
  try {
    assert.equal(typeof document.getElementById, "function");
    assert.ok(document.getElementById("songList"));
    assert.ok(document.getElementById("setlistModal").hidden);
    assert.equal(
      document.querySelector(".rj-songs-layout").dataset.defaultTab,
      "library",
    );
    assert.equal(window.location.pathname, "/songs/");
  } finally {
    cleanup();
  }
});

test("mountPage.cleanup removes the globals it installed", () => {
  const hadDocument = "document" in globalThis;
  const { cleanup } = mountPage();
  cleanup();
  assert.equal("document" in globalThis, hadDocument);
});

test("createAbcjsStub records renderAbc calls and returns a tune", () => {
  const abcjs = createAbcjsStub();
  const objs = abcjs.renderAbc("notation", "X:1\nK:C\n", { visualTranspose: 2 });
  assert.equal(abcjs.calls.renderAbc.length, 1);
  assert.equal(abcjs.calls.renderAbc[0].params.visualTranspose, 2);
  assert.ok(objs[0].metaText);
});

test("withTonal installs and restores the Tonal global", () => {
  assert.equal("Tonal" in globalThis, false);
  withTonal(() => {
    assert.equal(globalThis.Tonal.Note.midi("C4"), 60);
  });
  assert.equal("Tonal" in globalThis, false);
});

test("fakeYtPlayer tracks seeks and playback rate", () => {
  const p = fakeYtPlayer({ duration: 120 });
  p.seekTo(30, true);
  p.setPlaybackRate(1.5);
  assert.deepEqual(p.state.seeks, [30]);
  assert.equal(p.getPlaybackRate(), 1.5);
  assert.equal(p.getDuration(), 120);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mountPage } from "../../../tests/helpers/dom.js";
import { makeCtx } from "../../../tests/helpers/ctx.js";
import { createAbcjsStub, withAbcjs } from "../../../tests/helpers/stubs.js";
import { initWavExport } from "./wav-export.js";

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });
const SPINNER_SELECTOR = ".fa-spinner";

// jsdom implements neither URL.createObjectURL/revokeObjectURL nor a real
// anchor click's navigation (see lib/dom.test.js's downloadBlob test) — both
// are stubbed here so the export's download step is observable.
function stubDownload() {
  const created = [];
  const revoked = [];
  const clicked = [];
  URL.createObjectURL = (blob) => { created.push(blob); return "blob:fake-url"; };
  URL.revokeObjectURL = (url) => revoked.push(url);
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function click() {
    clicked.push({ href: this.href, download: this.download });
  };
  return {
    created,
    revoked,
    clicked,
    restore() { HTMLAnchorElement.prototype.click = originalClick; },
  };
}

function setup(audioOverrides) {
  const page = mountPage();
  const ctx = makeCtx({
    state: { currentSongFile: "basin_street.abc" },
    audio: {
      buildExportOptions: () => ({ visualObj: { metaText: {} }, millisecondsPerMeasure: 500, options: {} }),
      ...audioOverrides,
    },
  });
  return { page, ctx, cleanup: page.cleanup };
}

// Wire the button and click it (inside the given ABCJS stub), returning it
// for the test to inspect — before or after awaiting flush(), as needed. The
// button ships `disabled` (audio-player.js only enables it once a tune's
// synth is ready), so a test simulating that state enables it first — a
// disabled button's click() is a no-op, same as in a real browser.
function clickExport(ctx, abcjs) {
  initWavExport(ctx);
  const btn = document.getElementById("exportWavBtn");
  btn.disabled = false;
  withAbcjs(abcjs, () => btn.click());
  return btn;
}

test("clicking Export WAV renders through a fresh CreateSynth and downloads a .wav named for the song file", async () => {
  const { ctx, cleanup } = setup();
  const abcjs = createAbcjsStub();
  const download = stubDownload();
  try {
    clickExport(ctx, abcjs);
    await flush();
    await flush();

    assert.equal(abcjs.calls.createSynths.length, 1);
    assert.deepEqual(abcjs.calls.createSynths[0].init, {
      visualObj: { metaText: {} }, millisecondsPerMeasure: 500, options: {},
    });
    assert.equal(download.clicked.length, 1);
    assert.equal(download.clicked[0].download, "basin_street.wav");
    assert.equal(download.created[0].type, "audio/wav");
    assert.equal(download.revoked.length, 1);
  } finally {
    download.restore();
    cleanup();
  }
});

test("Export WAV shows a busy spinner and stays disabled mid-render, then resets", async () => {
  const { ctx, cleanup } = setup();
  const abcjs = createAbcjsStub();
  const download = stubDownload();
  try {
    const btn = clickExport(ctx, abcjs);
    assert.ok(btn.querySelector(SPINNER_SELECTOR));
    assert.equal(btn.disabled, true);

    await flush();
    await flush();
    assert.equal(btn.querySelector(SPINNER_SELECTOR), null);
    assert.equal(btn.disabled, false);
  } finally {
    download.restore();
    cleanup();
  }
});

test("Export WAV is a no-op when there's no tune to render (buildExportOptions returns null)", async () => {
  const { ctx, cleanup } = setup({ buildExportOptions: () => null });
  const abcjs = createAbcjsStub();
  const download = stubDownload();
  try {
    clickExport(ctx, abcjs);
    await flush();

    assert.equal(abcjs.calls.createSynths.length, 0);
    assert.equal(download.clicked.length, 0);
  } finally {
    download.restore();
    cleanup();
  }
});

test("Export WAV recovers (button re-enabled, no download) when the render produces no audio", async () => {
  const { ctx, cleanup } = setup();
  const abcjs = createAbcjsStub({ exportAudioBuffer: null });
  const download = stubDownload();
  try {
    const btn = clickExport(ctx, abcjs);
    await flush();
    await flush();

    assert.equal(download.clicked.length, 0);
    assert.equal(btn.disabled, false);
    assert.equal(btn.querySelector(SPINNER_SELECTOR), null);
  } finally {
    download.restore();
    cleanup();
  }
});

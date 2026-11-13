import { test } from "node:test";
import assert from "node:assert/strict";
import { mountPage } from "../../../../tests/helpers/dom.js";
import { makeCtx, memoryStorage } from "../../../../tests/helpers/ctx.js";
import { fakeServer } from "../../../../tests/helpers/sync-server.js";
import { createBand } from "./band.js";
import { isShared, setShared, versionsOf } from "../../lib/sync/band-vault.js";
import { songFormPrefKey } from "../../lib/core/preferences.js";

const FILE = "a.abc";
const FORM = JSON.stringify({ show: "mine", rows: [["1", "A A B A", "", ""]] });

function build(storage) {
  const ctx = makeCtx({ storage: () => storage });
  ctx.songForm = { refresh: () => {} };
  ctx.band = createBand(ctx);
  return ctx;
}

function click(id) {
  document.getElementById(id).click();
}

function setFetch(fn) {
  window.fetch = fn;
}

const tick = () => { return new Promise((resolve) => { setTimeout(resolve, 30); }); };

test("while the band space is off nothing is requested, however much is edited or shown", async () => {
  mountPage();
  const calls = [];
  const realFetch = window.fetch;
  setFetch((...args) => { calls.push(args); return Promise.reject(new Error("no network in test")); });
  try {
    const ctx = build(memoryStorage());
    await ctx.band.init();
    window.dispatchEvent(new window.Event("online"));
    document.dispatchEvent(new window.Event("visibilitychange"));
    await tick();
    assert.deepEqual(calls, []);
    assert.equal(ctx.band.isConnected(), false);
  } finally {
    setFetch(realFetch);
  }
});

test("starting needs a name; then the dialog starts a band space and a second device joins it", async () => {
  mountPage();
  const server = fakeServer();
  const realFetch = window.fetch;
  setFetch(server.fetchFn);
  try {
    const anna = memoryStorage();
    const ctxA = build(anna);
    await ctxA.band.init();
    click("bandConnect");
    await tick();
    assert.equal(ctxA.band.isConnected(), false);
    assert.match(document.getElementById("bandStatus").textContent, /name/i);

    document.getElementById("bandName").value = "Anna";
    anna.setItem(songFormPrefKey(FILE), FORM);
    setShared(anna, FILE, true);
    click("bandConnect");
    await tick();
    assert.equal(ctxA.band.isConnected(), true);
    assert.equal(document.getElementById("bandBox").hidden, false);
    const code = document.getElementById("bandCode").textContent;
    assert.ok(code.length > 10);

    const pieter = memoryStorage();
    mountPage();
    setFetch(server.fetchFn);
    const ctxP = build(pieter);
    await ctxP.band.init();
    document.getElementById("bandName").value = "Pieter";
    document.getElementById("bandCodeInput").value = code;
    click("bandJoin");
    await tick();
    assert.equal(ctxP.band.isConnected(), true, document.getElementById("bandStatus").textContent);
    assert.equal(versionsOf(pieter, FILE)[0].name, "Anna");
    assert.equal(isShared(pieter, FILE), false);

    click("bandLeave");
    assert.equal(ctxP.band.isConnected(), false);
    assert.equal(versionsOf(pieter, FILE).length, 0);
  } finally {
    setFetch(realFetch);
  }
});

test("the dialog's tabs switch between the devices and the band space", async () => {
  mountPage();
  const ctx = build(memoryStorage());
  await ctx.band.init();
  const hidden = (id) => { return document.getElementById(id).hidden; };
  assert.equal(hidden("syncPanelBand"), true);
  click("syncTabBand");
  assert.equal(hidden("syncPanelBand"), false);
  assert.equal(hidden("syncPanelDevices"), true);
  assert.equal(document.getElementById("syncTabBand").getAttribute("aria-pressed"), "true");
  click("syncTabDevices");
  assert.equal(hidden("syncPanelDevices"), false);
  assert.equal(hidden("syncPanelBand"), true);
});

test("a band space shows a QR and shares a #band= link by mail, WhatsApp and copy", async () => {
  mountPage();
  const server = fakeServer();
  const realFetch = window.fetch;
  setFetch(server.fetchFn);
  const opened = [];
  window.open = (url) => { opened.push(url); };
  const drawn = [];
  globalThis.qrcode = () => {
    return { addData: (text) => { drawn.push(text); }, make: () => {}, getModuleCount: () => { return 2; }, isDark: (r, c) => { return r === c; } };
  };
  try {
    const ctx = build(memoryStorage());
    await ctx.band.init();
    document.getElementById("bandName").value = "Anna";
    click("bandConnect");
    await tick();
    await tick();
    assert.match(drawn[0], /#band=[A-Z0-9-]+$/);
    assert.notEqual(document.querySelector("#bandQr path"), null);
    click("bandWhatsapp");
    assert.match(decodeURIComponent(opened[0]), /^https:\/\/wa\.me\/\?text=.*#band=/);
    assert.equal(document.getElementById("bandShare").hidden, true); // jsdom has no navigator.share
  } finally {
    delete globalThis.qrcode;
    setFetch(realFetch);
  }
});

test("opening a #band= link takes the code out of the address bar and fills the join field", async () => {
  mountPage();
  window.history.replaceState(null, "", "/songs/#s=a&band=RJ7K-Q2MD");
  const ctx = build(memoryStorage());
  let opened = 0;
  ctx.sync = { open: () => { opened += 1; } };
  await ctx.band.init();
  assert.equal(document.getElementById("bandCodeInput").value, "RJ7K-Q2MD");
  assert.equal(window.location.hash, "#s=a");
  assert.equal(opened, 1);
  assert.equal(document.getElementById("syncPanelBand").hidden, false);
  assert.match(document.getElementById("bandStatus").textContent, /name/i);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mountPage } from "../../../../tests/helpers/dom.js";
import { makeCtx, memoryStorage } from "../../../../tests/helpers/ctx.js";
import { createSync } from "./sync.js";
import { createPersonalSetlist } from "../../lib/setlists/setlists-store.js";

function setFetch(fn) {
  window.fetch = fn;
}

function build(storage) {
  const ctx = makeCtx({ storage: () => storage });
  ctx.setlistHome = { render: () => {}, renderSyncStatus: () => {} };
  ctx.setlistView = { refreshOpenPersonal: () => {} };
  ctx.songForm = { refresh: () => {} };
  ctx.sync = createSync(ctx);
  return ctx;
}

test("while sync is off nothing is requested, however much is edited or shown", async () => {
  const page = mountPage();
  const calls = [];
  const realFetch = window.fetch;
  setFetch((...args) => { calls.push(args); return Promise.reject(new Error("no network in test")); });
  try {
    const storage = memoryStorage();
    const ctx = build(storage);
    await ctx.sync.init();
    createPersonalSetlist(storage, "Gig");
    window.dispatchEvent(new window.Event("online"));
    document.dispatchEvent(new window.Event("visibilitychange"));
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    assert.deepEqual(calls, []);
    assert.equal(ctx.sync.isConnected(), false);
    assert.equal(ctx.sync.statusLine(), "");
  } finally {
    setFetch(realFetch);
    page.cleanup();
  }
});

test("the dialog opens, shows the connect form while off, and a bad code is reported", async () => {
  const page = mountPage();
  try {
    const ctx = build(memoryStorage());
    await ctx.sync.init();
    ctx.sync.open();
    assert.equal(document.getElementById("syncModal").hidden, false);
    assert.equal(document.getElementById("syncSetup").hidden, false);
    assert.equal(document.getElementById("syncCodeBox").hidden, true);
    document.getElementById("syncCodeInput").value = "AAAA-AAAA";
    document.getElementById("syncJoin").click();
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    assert.match(document.getElementById("syncStatus").textContent, /isn't right/);
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    assert.equal(document.getElementById("syncModal").hidden, true);
  } finally {
    page.cleanup();
  }
});

import { byId, on } from "../../lib/core/dom.js";
import { tl } from "../../lib/core/i18n.js";
import { createSyncEngine, CODE_KEY } from "../../lib/sync/engine.js";
import { formatCode } from "../../lib/sync/crypto.js";
import { onLocalChange } from "../../lib/sync/changes.js";
import { holdLease, releaseLease } from "../../lib/sync/lease.js";
import { afterPageLoad } from "../core/after-load.js";

/*
  Device sync (docs/device-sync-plan.md): opt-in, off by default — until the
  visitor connects, this makes no request at all. Once connected it syncs when
  it matters (page load, page shown again, back online, the Setlists tab opened
  — at most every PULL_GAP_MS) and uploads once, UPLOAD_DELAY_MS after a burst
  of local edits ends. No timer polling. One tab per device runs the cycles
  (lib/sync/lease.js); the others redraw from the `storage` event.
*/
const UPLOAD_DELAY_MS = 3000;
const PULL_GAP_MS = 30000;
const LEASE_RENEW_MS = 5000;
const DIRTY_KEY = "rj.sync.dirty";
const WATCHED_KEYS = ["rj.setlists.v1", "rj.sync.meta"];

function statusText(result, time) {
  switch (result.status) {
    case "ok": return tl("sync_ok", "Synced {time}", { time });
    case "working": return tl("sync_working", "Syncing…");
    case "offline": return tl("sync_offline", "Offline — will sync when you're back online");
    case "notFound": return tl("sync_not_found", "No sync found for this code");
    case "gone": return tl("sync_gone", "This sync was stopped or replaced");
    case "tooLarge": return tl("sync_too_large", "Too much to sync — remove some setlists or song forms");
    case "limited": return tl("sync_limited", "Too many new syncs right now — try again later");
    case "newerFormat": return tl("sync_newer", "This page is out of date — reload it to sync");
    case "badCode": return tl("sync_bad_code", "That code isn't right — check it and try again");
    case "off": return tl("sync_off", "Not connected");
    default: return tl("sync_error", "Sync failed — will try again");
  }
}

function clockTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function closeDialog() {
  const overlay = byId("syncModal");
  if (overlay) overlay.hidden = true;
}

export function createSync(ctx) {
  const tabId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8); // eslint-disable-line sonarjs/pseudo-random -- a lease id, not a secret
  let engine = null;
  const flags = { busy: false, leaseTimer: null };
  let uploadTimer = null;
  let lastPull = 0;
  let lastResult = { status: "off" };

  const storage = () => { return ctx.storage(); };
  const getEngine = () => {
    if (!engine) engine = createSyncEngine({ storage: storage(), fetchFn: (...args) => { return window.fetch(...args); } });
    return engine;
  };
  const connected = () => { return Boolean(storage()) && getEngine().code() !== null; };

  function setDirty(on_) {
    try {
      if (on_) storage().setItem(DIRTY_KEY, "1");
      else storage().removeItem(DIRTY_KEY);
    } catch (_e) {
      // storage unavailable — the next page load syncs anyway.
    }
  }

  function redraw() {
    if (ctx.state.activeTab === "setlists") {
      if (ctx.state.setlistsView === "home") ctx.setlistHome.render();
      else if (ctx.state.currentPersonalId) ctx.setlistView.refreshOpenPersonal();
    }
    if (ctx.songForm) ctx.songForm.refresh();
  }

  // The lease is renewed only while connected; a never-connected page has no timer at all.
  function syncLeaseTimer(isOn) {
    if (isOn && !flags.leaseTimer) {
      flags.leaseTimer = setInterval(() => { if (!flags.busy) holdLease(storage(), tabId, Date.now()); }, LEASE_RENEW_MS);
    } else if (!isOn && flags.leaseTimer) {
      clearInterval(flags.leaseTimer);
      flags.leaseTimer = null;
    }
  }

  function render() {
    const code = connected() ? getEngine().code() : null;
    syncLeaseTimer(Boolean(code));
    const shown = lastResult;
    const line = byId("syncStatus");
    if (line) line.textContent = statusText(shown, clockTime());
    const codeBox = byId("syncCodeBox");
    if (codeBox) codeBox.hidden = !code;
    const setup = byId("syncSetup");
    if (setup) setup.hidden = Boolean(code);
    const codeEl = byId("syncCode");
    if (codeEl) codeEl.textContent = code ? formatCode(code) : "";
    if (ctx.setlistHome) ctx.setlistHome.renderSyncStatus();
  }

  function finish(result, changedBefore) {
    lastResult = result;
    if (result.status === "ok") setDirty(false);
    if (result.status === "ok" && storage().getItem(WATCHED_KEYS[0]) !== changedBefore) redraw();
    render();
    return result;
  }

  async function run() {
    if (!connected() || flags.busy || !holdLease(storage(), tabId, Date.now())) return null;
    flags.busy = true;
    lastPull = Date.now();
    const before = storage().getItem(WATCHED_KEYS[0]);
    lastResult = { status: "working" };
    render();
    return getEngine().sync().then((result) => {
      flags.busy = false;
      return finish(result, before);
    }, () => {
      flags.busy = false;
      return finish({ status: "error" }, before);
    });
  }

  // Fire-and-forget with a catch: a failing step shows as "Sync failed".
  function settle(promise) {
    promise.catch(() => { lastResult = { status: "error" }; render(); });
  }

  function scheduleUpload() {
    if (!connected()) return;
    setDirty(true);
    clearTimeout(uploadTimer);
    uploadTimer = setTimeout(() => { settle(run()); }, UPLOAD_DELAY_MS);
  }

  function pullIfStale() {
    if (connected() && Date.now() - lastPull > PULL_GAP_MS) settle(run());
  }

  async function action(work, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    const before = storage().getItem(WATCHED_KEYS[0]);
    lastResult = { status: "working" };
    render();
    const result = await work();
    lastResult = result.status === "ok" ? { status: "ok" } : result;
    if (result.status === "ok") lastPull = Date.now();
    finish(lastResult, before);
  }

  function initDialog() {
    const overlay = byId("syncModal");
    if (!overlay) return;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeDialog(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) closeDialog(); });
    on("syncClose", "click", closeDialog);
    on("syncDone", "click", closeDialog);
    on("syncConnect", "click", () => { settle(action(() => getEngine().connect())); });
    const join = () => { settle(action(() => getEngine().join(byId("syncCodeInput").value))); };
    on("syncJoin", "click", join);
    on("syncCodeInput", "keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); join(); } });
    on("syncNow", "click", () => { lastPull = 0; settle(run()); });
    on("syncDisconnect", "click", () => { getEngine().disconnect(); lastResult = { status: "off" }; render(); });
    on("syncDelete", "click", () => {
      settle(action(() => getEngine().deleteServerCopy(),
        tl("sync_delete_confirm", "Delete the server copy? Your other devices will be disconnected; the setlists on each device stay.")));
    });
    on("syncNewCode", "click", () => {
      settle(action(() => getEngine().newCode(),
        tl("sync_new_code_confirm", "Make a new code? Your other devices are disconnected until you enter it there.")));
    });
  }

  return {
    open() {
      const overlay = byId("syncModal");
      if (!overlay) return;
      render();
      overlay.hidden = false;
      const first = byId(connected() ? "syncNow" : "syncConnect");
      if (first) first.focus();
    },

    // What the Setlists tab shows next to the button: a status line when connected.
    statusLine() {
      return connected() ? statusText(lastResult, clockTime()) : "";
    },

    isConnected: connected,

    init() {
      initDialog();
      onLocalChange(scheduleUpload);
      // Another tab (or a sync in it) wrote storage: redraw from it.
      window.addEventListener("storage", (e) => {
        if (e.key === null || WATCHED_KEYS.includes(e.key) || (e.key || "").startsWith("rj.songForm.")) redraw();
        if (e.key === CODE_KEY) render();
      });
      document.addEventListener("visibilitychange", () => { if (!document.hidden) pullIfStale(); });
      window.addEventListener("online", () => { lastPull = 0; settle(run()); });
      window.addEventListener("pagehide", () => { releaseLease(storage(), tabId); });
      ctx.store.subscribe("nav", () => { if (ctx.state.activeTab === "setlists") pullIfStale(); });
      if (!connected()) return Promise.resolve();
      syncLeaseTimer(true);
      return afterPageLoad().then(() => { lastPull = 0; return run(); }).then(() => undefined);
    },
  };
}

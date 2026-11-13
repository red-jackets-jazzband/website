import { byId, on } from "../../lib/core/dom.js";
import { hashWithoutSync, syncCodeFromHash } from "../../lib/core/song-hash.js";
import { tl } from "../../lib/core/i18n.js";
import { createVaultEngine } from "../../lib/sync/engine.js";
import { BAND_CODEC, bandConnected, cleanName, forgetBand, readProfile, setDisplayName } from "../../lib/sync/band-vault.js";
import { formatCode } from "../../lib/sync/crypto.js";
import { onLocalChange } from "../../lib/sync/changes.js";
import { pairingUrl } from "../../lib/sync/qr.js";
import { afterPageLoad } from "../core/after-load.js";
import { fallbackCopy, flashShareBtn } from "../inspiration/share.js";
import { clockTime, renderQr, statusText } from "./sync.js";

/*
  The band space (docs/device-sync-plan.md, phase 2): a second, optional vault
  with its own code, holding the song-form versions a member shares under their
  name. Its section sits in the Connect devices dialog. Like the personal sync
  it makes no request until a code exists, and it syncs when it matters: page
  load, page shown again, back online, and UPLOAD_DELAY_MS after a local edit.
  (No push channel and no tab lease yet: two tabs just race, and the engine's
  conflict retry sorts that out.)
*/
const UPLOAD_DELAY_MS = 3000;
const PULL_GAP_MS = 30000;

function bandStatusText(result) {
  if (result.status === "needName") return tl("band_need_name", "Type your name first — your bandmates will see it");
  if (result.status === "pairHint") return tl("band_pair_hint", "Type your name, then press Join to enter this band space");
  if (result.status === "off") return tl("band_off", "Not in a band space");
  return statusText(result, clockTime());
}

// The dialog has two tabs: this device's own sync, and the band space.
function showPanel(band) {
  const panels = [["syncPanelDevices", "syncTabDevices", !band], ["syncPanelBand", "syncTabBand", band]];
  panels.forEach(([panel, tab, shown]) => {
    const panelEl = byId(panel);
    if (panelEl) panelEl.hidden = !shown;
    const tabEl = byId(tab);
    if (tabEl) tabEl.setAttribute("aria-pressed", String(shown));
  });
}

// Copies `url`, flashing a tick on `button`.
function copyLink(url, button) {
  const clipboard = navigator.clipboard;
  if (!clipboard || typeof clipboard.writeText !== "function") {
    fallbackCopy(url, button);
    return;
  }
  clipboard.writeText(url).then(() => { flashShareBtn(button); }, () => { fallbackCopy(url, button); });
}

export function createBand(ctx) {
  let engine = null;
  let busy = false;
  let timer = null;
  let lastPull = 0;
  let lastResult = { status: "off" };
  let qrFor = null; // the code the drawn QR belongs to
  // Read at creation, before navigation's own hash rewriting can drop it.
  const pairingCode = syncCodeFromHash(window.location.hash, "band");

  const storage = () => { return ctx.storage(); };
  const getEngine = () => {
    if (!engine) engine = createVaultEngine({ storage: storage(), fetchFn: (...args) => { return window.fetch(...args); }, codec: BAND_CODEC });
    return engine;
  };
  const connected = () => { return bandConnected(storage()); };

  const shareLink = (code) => { return pairingUrl(window.location.href, formatCode(code), "band"); };

  function sharePieces() {
    const link = shareLink(getEngine().code());
    return {
      link,
      subject: tl("band_share_subject", "Red Jackets band space"),
      text: tl("band_share_text", "Join our band space for song forms: {link}", { link }),
    };
  }

  function initShare() {
    const nativeShare = byId("bandShare");
    if (nativeShare && typeof navigator.share === "function") nativeShare.hidden = false;
    on("bandShare", "click", () => {
      const { link, subject, text } = sharePieces();
      // A dismissed share sheet rejects: nothing to report.
      navigator.share({ title: subject, text, url: link }).catch(() => undefined);
    });
    on("bandWhatsapp", "click", () => {
      window.open(`https://wa.me/?text=${encodeURIComponent(sharePieces().text)}`, "_blank", "noopener");
    });
    on("bandMail", "click", () => {
      const { subject, text } = sharePieces();
      window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    });
    on("bandCopyLink", "click", () => { copyLink(sharePieces().link, byId("bandCopyLink")); });
  }

  // A band link (#band=<code>): take the code out of the address bar and open
  // the dialog on the band tab with it filled in; joining still needs a name.
  function takePairingLink() {
    if (pairingCode === null) return;
    const rest = hashWithoutSync(window.location.hash, "band");
    window.history.replaceState(null, "", window.location.pathname + window.location.search + (rest ? `#${rest}` : ""));
    if (connected() || !storage()) return;
    const input = byId("bandCodeInput");
    if (input) input.value = pairingCode;
    showPanel(true);
    lastResult = { status: "pairHint" };
    render();
    if (ctx.sync) ctx.sync.open();
    const name = byId("bandName");
    if (name) name.focus();
  }

  function render() {
    const code = connected() ? getEngine().code() : null;
    const setup = byId("bandSetup");
    if (setup) setup.hidden = Boolean(code);
    const box = byId("bandBox");
    if (box) box.hidden = !code;
    const now = byId("bandNow");
    if (now) now.hidden = !code;
    const codeEl = byId("bandCode");
    if (codeEl) codeEl.textContent = code ? formatCode(code) : "";
    if (!code) qrFor = null;
    if (code && code !== qrFor) {
      qrFor = code;
      renderQr(byId("bandQr"), shareLink(code)).catch(() => { qrFor = null; });
    }
    const status = byId("bandStatus");
    if (status) status.textContent = bandStatusText(lastResult);
    const name = byId("bandName");
    if (name && storage() && name !== document.activeElement) name.value = readProfile(storage()).name;
  }

  function finish(result) {
    lastResult = result;
    // The engine clears the code itself when the vault is gone; tidy what came from it.
    if ((result.status === "gone" || result.status === "notFound") && !connected()) forgetBand(storage());
    if (result.changed && ctx.songForm) ctx.songForm.refresh();
    render();
    return result;
  }

  async function run() {
    if (!connected() || busy) return;
    busy = true;
    lastPull = Date.now();
    lastResult = { status: "working" };
    render();
    const result = await getEngine().sync().catch(() => { return { status: "error" }; });
    busy = false; // eslint-disable-line require-atomic-updates -- one cycle at a time (busy)
    finish(result);
  }

  // Fire-and-forget with a catch: a failing step shows as "Sync failed".
  function settle(promise) {
    promise.catch(() => { lastResult = { status: "error" }; render(); });
  }

  function uploadSoon() {
    if (!connected()) return;
    clearTimeout(timer);
    timer = setTimeout(() => { settle(run()); }, UPLOAD_DELAY_MS);
  }

  async function action(work, confirmText) {
    if (busy) return;
    if (confirmText && !window.confirm(confirmText)) return;
    busy = true;
    lastResult = { status: "working" };
    render();
    const result = await work().catch(() => { return { status: "error" }; });
    busy = false; // eslint-disable-line require-atomic-updates -- one action at a time (busy)
    if (result.status === "ok") lastPull = Date.now();
    finish(result);
  }

  function saveName() {
    const input = byId("bandName");
    if (!input || !storage()) return false;
    const name = cleanName(input.value);
    if (!name) return false;
    if (readProfile(storage()).name !== name) {
      setDisplayName(storage(), name);
      uploadSoon();
    }
    return true;
  }

  // Joining or starting needs a name first.
  function withName(work) {
    if (!saveName()) {
      lastResult = { status: "needName" };
      render();
      return;
    }
    settle(action(work));
  }

  function joinFromInput() {
    withName(() => { return getEngine().join(byId("bandCodeInput").value); });
  }

  function initDialog() {
    on("syncTabDevices", "click", () => { showPanel(false); });
    on("syncTabBand", "click", () => { showPanel(true); });
    on("bandName", "change", () => { saveName(); });
    on("bandConnect", "click", () => { withName(() => { return getEngine().connect(); }); });
    on("bandJoin", "click", () => { joinFromInput(); });
    on("bandCodeInput", "keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); joinFromInput(); } });
    on("bandNow", "click", () => { settle(run()); });
    on("bandLeave", "click", () => {
      getEngine().disconnect();
      forgetBand(storage());
      lastResult = { status: "off" };
      if (ctx.songForm) ctx.songForm.refresh();
      render();
    });
    on("bandDelete", "click", () => {
      settle(action(async () => {
        const result = await getEngine().deleteServerCopy();
        if (result.status === "ok") forgetBand(storage());
        return result;
      }, tl("band_delete_confirm", "Delete the band space's server copy? Everyone is disconnected; the song forms on each device stay.")));
    });
  }

  function pullIfStale() {
    if (connected() && Date.now() - lastPull > PULL_GAP_MS) settle(run());
  }

  return {
    isConnected: connected,

    init() {
      initDialog();
      initShare();
      render();
      takePairingLink();
      onLocalChange(uploadSoon);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) pullIfStale(); });
      window.addEventListener("online", () => { lastPull = 0; settle(run()); });
      if (!connected()) return Promise.resolve();
      return afterPageLoad().then(() => { return run(); }).then(() => undefined);
    },
  };
}

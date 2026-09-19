import { byId, on } from "../lib/dom.js";

/*
  The sheet's "full screen" toggle: #sheetFullscreenBtn (content/songs.md)
  is a small floating button hovering over .rj-sheet-paper's own top-right
  corner, styled in split.css (.rj-sheet-fullscreen-btn), rather than living
  in the #sheetmenu toolbar. Deliberately CSS-only — body.rj-sheet-fullscreen
  plus the rules in split.css pin the whole .rj-songs-layout over the
  viewport — rather than the real Fullscreen API (Element.requestFullscreen()):
  mobile browsers suspend pinch-zoom for as long as a genuine fullscreen
  element is active, which would defeat the point of a mode built for
  reading a dense chart up close on a phone. See split.css's own doc comment
  for the portrait/landscape layout split.
*/
export function createFullscreen() {
  let wakeLock = null;

  // Best-effort only: not every browser implements the Wake Lock API (and
  // Safari didn't before iOS 16.4) — without it, this mode just falls back
  // to the device's normal screen-auto-lock timeout.
  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } catch {
      // Denied (backgrounded tab, battery saver, unsupported) — harmless.
      wakeLock = null;
    }
  }

  function releaseWakeLock() {
    const lock = wakeLock;
    wakeLock = null;
    if (lock) lock.release().catch(() => {});
  }

  function apply(active) {
    document.body.classList.toggle("rj-sheet-fullscreen", active);
    const btn = byId("sheetFullscreenBtn");
    if (btn) {
      const label = active ? "Exit full screen" : "Full screen";
      btn.title = label;
      btn.setAttribute("aria-label", label);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
      btn.classList.toggle("active", active);
      const icon = btn.querySelector(".fa-solid");
      if (icon) icon.className = `fa-solid ${active ? "fa-compress" : "fa-expand"}`;
    }
    if (active) requestWakeLock();
    else releaseWakeLock();
  }

  function toggle() {
    apply(!document.body.classList.contains("rj-sheet-fullscreen"));
  }

  function init() {
    on("sheetFullscreenBtn", "click", toggle);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (document.body.classList.contains("rj-sheet-fullscreen")) apply(false);
    });
    // The Wake Lock spec releases the lock automatically the moment the tab
    // is backgrounded (or the device screen locks); re-request it once the
    // page is visible again so leaving full screen up across a phone
    // lock/unlock still keeps the screen on afterwards.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible"
        && document.body.classList.contains("rj-sheet-fullscreen")) {
        requestWakeLock();
      }
    });
  }

  return { init, toggle };
}

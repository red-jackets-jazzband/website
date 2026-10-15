/*
  Which "install this app by hand" instructions a browser needs, if any.

  Apple's browsers never fire `beforeinstallprompt`, so a web page can't open
  an install dialog there: the visitor has to do it from the browser's own
  menus. On iPhone/iPad (Safari, and since iOS 16.4 every other browser too,
  all being WebKit) that's Share → "Add to Home Screen"; on a Mac, Safari 17+
  has File → "Add to Dock". Older Mac Safari, and Chrome/Edge/Firefox on a
  Mac, get nothing here (Chromium fires `beforeinstallprompt` itself).

  `standalone` is whether the page is already running as an installed app
  (`navigator.standalone` on iOS, `display-mode: standalone` elsewhere) —
  then there's nothing left to install.
*/

const MAC_SAFARI_MIN_VERSION = 17;
const OTHER_MAC_BROWSERS = ["Chrome/", "Chromium/", "Edg/", "Firefox/", "OPR/"];

/**
 * iPadOS 13+ reports itself as a Mac ("Macintosh" UA, platform "MacIntel");
 * only its touch points give it away.
 * @param {{ userAgent: string, platform?: string, maxTouchPoints?: number }} env
 */
export function isAppleMobile({ userAgent, platform = "", maxTouchPoints = 0 }) {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return platform === "MacIntel" && maxTouchPoints > 1;
}

/** @param {string} userAgent */
function safariVersion(userAgent) {
  const match = /Version\/(\d+)/.exec(userAgent);
  return match ? Number.parseInt(match[1], 10) : 0;
}

/** @param {string} userAgent */
function isMacSafari(userAgent) {
  if (!userAgent.includes("Macintosh") || !userAgent.includes("Safari/")) return false;
  return !OTHER_MAC_BROWSERS.some((marker) => userAgent.includes(marker));
}

/**
 * @param {{ userAgent: string, platform?: string, maxTouchPoints?: number, standalone?: boolean }} env
 * @returns {"ios" | "mac" | null}
 */
export function installHintFor(env) {
  if (env.standalone) return null;
  if (isAppleMobile(env)) return "ios";
  if (isMacSafari(env.userAgent) && safariVersion(env.userAgent) >= MAC_SAFARI_MIN_VERSION) return "mac";
  return null;
}

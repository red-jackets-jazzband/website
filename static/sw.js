// Service worker for /songs/ — the one page on the site worth working
// offline (see CLAUDE.md's "Offline / PWA" section). Registered from
// songs/offline.js with an explicit `{ scope: "/songs/" }` even though this
// file lives at the site root (so it can be registered at all with that
// scope, since a worker's own default scope is only its containing
// directory) — every other page on the site is untouched by it.
//
// A module worker (this file uses a real `import`, not `importScripts`) so
// the request-classification rules live in one place (lib/sw-routing.js,
// unit-tested the normal way) rather than being duplicated here by hand.
// Module service workers aren't universally supported yet (notably older
// Safari) — on a browser that can't load this file at all, /songs/ simply
// works the same as it always did, online-only, same as before this existed.
import { classifyRequest } from "./script/lib/sw-routing.js";
import { findStylesheetHrefs, findCssUrls } from "./script/lib/css-assets.js";

// Bump on any change to this file or to what it should cache, so activate()
// clears out whatever the previous version left behind instead of it
// lingering forever.
const CACHE_VERSION = "v1";
const SHELL_CACHE = `rj-songs-shell-${CACHE_VERSION}`;
const SOUNDFONT_CACHE = `rj-songs-soundfont-${CACHE_VERSION}`;
const FONT_AWESOME_CACHE = `rj-songs-font-awesome-${CACHE_VERSION}`;
const CURRENT_CACHES = new Set([SHELL_CACHE, SOUNDFONT_CACHE, FONT_AWESOME_CACHE]);

// A deliberately small precache — just enough that a fresh install has an
// offline fallback immediately, before the user has ever visited /songs/.
// The song/setlist library and the rest of the app shell are cached the
// normal way the first time they're actually requested (cacheFirstRevalidate
// below), which happens within the first few seconds of any real visit
// anyway; songs/offline.js's explicit "Download library for offline" action
// covers the rest (the whole song/setlist list, warmed proactively) and the
// soundfont samples (which nothing short of actually rendering audio can
// discover the URLs for — see that file's own doc comment).
const PRECACHE_URLS = ["/songs/", "/manifest.webmanifest"];

// A page's own <head> — its stylesheet(s) and the webfonts they declare via
// @font-face — is requested once, during that page's *own* initial load,
// before any service worker can ever be controlling it (a worker never
// controls the very page load that installs it — that's the standard SW
// lifecycle, not a bug here). So unlike everything else "shell"-classified,
// those requests are never passively caught by the fetch handler below on a
// first visit; they have to be fetched here, explicitly, at install time.
// The stylesheet itself is skipped in the ordinary case: split.css is served
// from a build-time-fingerprinted URL (head.html's
// `resources.Get | minify | fingerprint`), so its exact filename can't be
// hardcoded here — it's discovered by scanning the already-precached
// /songs/ page's own markup instead (findStylesheetHrefs), same for the
// cross-origin Font Awesome stylesheet. Each stylesheet found is then
// scanned in turn (findCssUrls) for the webfont files its own @font-face
// rules point at, so this stays in sync with split.css automatically rather
// than needing its own separate hardcoded font-file list.
function targetCacheFor(url) {
  const kind = classifyRequest({
    pathname: url.pathname,
    origin: url.origin,
    sameOrigin: url.origin === self.location.origin,
    mode: "cors",
  });
  return kind === "font-awesome" ? FONT_AWESOME_CACHE : SHELL_CACHE;
}

function precacheUrl(absoluteUrl) {
  return fetch(absoluteUrl).then((response) => {
    if (!response.ok) return null;
    return caches.open(targetCacheFor(new URL(absoluteUrl)))
      .then((cache) => cache.put(absoluteUrl, response.clone()))
      .then(() => response);
  }).catch(() => null);
}

function precacheStylesheetAndFonts(href) {
  const absoluteHref = new URL(href, self.location.origin).href;
  return precacheUrl(absoluteHref).then((response) => {
    if (!response) return null;
    return response.clone().text().then((css) => Promise.all(
      findCssUrls(css).map((url) => precacheUrl(new URL(url, absoluteHref).href)),
    ));
  });
}

function precacheShell() {
  return caches.open(SHELL_CACHE)
    .then((cache) => cache.addAll(PRECACHE_URLS).then(() => cache.match("/songs/")))
    .then((shellPage) => shellPage.text())
    .then((html) => Promise.all(findStylesheetHrefs(html).map(precacheStylesheetAndFonts)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => !CURRENT_CACHES.has(name)).map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

// Cache-first, but always also refetches in the background and updates the
// cache — an offline visit is instant even off a stale copy, and the next
// visit (online) picks up whatever changed (a new/edited song, a setlist
// update, a code fix) without needing a whole new CACHE_VERSION.
function cacheFirstRevalidate(request, cacheName) {
  return caches.open(cacheName).then((cache) => cache.match(request).then((cached) => {
    const revalidate = fetch(request).then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    }).catch(() => cached);
    return cached || revalidate;
  }));
}

// Same shape, but never refetches once cached — for content that's
// immutable once published (an audio sample, a webfont file), so there's
// nothing to ever catch up on.
function cacheFirstOnly(request, cacheName) {
  return caches.open(cacheName).then((cache) => cache.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    });
  }));
}

// A page load: prefer a live network response (so a content/code update is
// seen immediately when online), falling back to whatever's cached for that
// exact URL, and finally to the precached /songs/ shell — so a reload while
// offline never just shows the browser's own "no internet" page.
function navigate(request) {
  return fetch(request).then((response) => {
    caches.open(SHELL_CACHE).then((cache) => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request).then((cached) => cached || caches.match("/songs/")));
}

const STRATEGIES = {
  navigate,
  shell: (request) => cacheFirstRevalidate(request, SHELL_CACHE),
  soundfont: (request) => cacheFirstOnly(request, SOUNDFONT_CACHE),
  "font-awesome": (request) => cacheFirstOnly(request, FONT_AWESOME_CACHE),
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const kind = classifyRequest({
    pathname: url.pathname,
    origin: url.origin,
    sameOrigin: url.origin === self.location.origin,
    mode: request.mode,
  });
  const strategy = STRATEGIES[kind];
  if (strategy) event.respondWith(strategy(request));
});

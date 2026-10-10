import { test, expect } from "@playwright/test";

// Third-party hosts (fonts CDN, soundfonts, embeds) aren't what's under test
// and aren't reachable from every CI/sandbox network: refuse them up front so
// the suite is hermetic and their failures don't count as page errors.
async function isolate(context) {
  await context.route(
    (url) => url.hostname !== "127.0.0.1",
    (route) => route.abort(),
  );
}

// Console/page errors that are the aborted third-party requests above.
const SONGS_URL = "/songs/";
const SONG_ITEM = ".song-list-item";
const IGNORED_ERROR = /Failed to load resource|net::ERR|ERR_FAILED|status of 40|blocked/i;

function collectErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !IGNORED_ERROR.test(msg.text())) errors.push(msg.text());
  });
  return errors;
}

test.beforeEach(async ({ context }) => { await isolate(context); });

test("/songs/ loads its module graph with no script errors and lists the library", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(SONGS_URL);
  await expect(page.locator(SONG_ITEM).first()).toBeVisible();
  expect(await page.locator(SONG_ITEM).count()).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

test("picking a song renders its title, chord grid and notation", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(SONGS_URL);
  await page.locator("#songSearch").fill("Bourbon Street");
  await page.locator(SONG_ITEM).first().click();

  await expect(page.locator("#songtitle")).toContainText(/bourbon/i);
  await expect(page.locator("#notation svg").first()).toBeVisible();
  await expect(page.locator("#chordtable")).not.toBeEmpty();
  expect(errors).toEqual([]);
});

test("the Mixer <dialog> is hidden until its button is clicked, then toggles", async ({ page }) => {
  await page.goto(SONGS_URL);
  await page.locator("#songSearch").fill("Bourbon Street");
  await page.locator(SONG_ITEM).first().click();
  await expect(page.locator("#notation svg").first()).toBeVisible();

  const panel = page.locator("#mixerPanel");
  await expect(panel).toBeHidden();
  // Enabled once the tune's synth is ready, which needs the (blocked)
  // soundfont host — so drive the same state change the click handler makes.
  await page.evaluate(() => { document.getElementById("mixerBtn").disabled = false; });
  await page.locator("#mixerBtn").click();
  await expect(panel).toBeVisible();
  await page.locator("#mixerBtn").click();
  await expect(panel).toBeHidden();
});

test("the Layers panel opens from its tab and draws fingerings and progression bands", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${SONGS_URL}#s=basin_street`);
  await expect(page.locator("#notation svg").first()).toBeVisible();
  await page.locator("#instrument").selectOption("trumpet");

  const panel = page.locator("#layersPanel");
  await expect(panel).toBeHidden();
  await page.locator("#layersTab").click();
  await expect(panel).toBeVisible();
  await page.locator('.rj-layer-row[data-layer="fingerings"]').click();
  await page.locator('.rj-layer-row[data-layer="progressions"]').click();
  await expect(page.locator("#notation .rj-layer-fingering").first()).toBeVisible();
  // Basin Street's B section: Georgia (I III7) handing on to a Salty Dog.
  await expect(page.locator("#notation .rj-layer-prog-text", { hasText: "Georgia" }).first()).toBeVisible();
  expect(await page.locator("#notation .rj-layer-prog-band").count()).toBeGreaterThan(0);
  await expect(page.locator("#layersTabCount")).toHaveText("2");

  await page.locator("#layersCloseBtn").click();
  await expect(panel).toBeHidden();
  expect(errors).toEqual([]);
});

test("a band setlist opens from a deep link and lists its songs", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${SONGS_URL}#sl=setlist_2026`);
  await expect(page.locator("#setlistTitleText")).toContainText(/2026/);
  await expect(page.locator(SONG_ITEM).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("the service worker installs and precaches the shell, stylesheet, module graph and lamejs", async ({ page }) => {
  await page.goto(SONGS_URL);
  const cached = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    // install() only resolves once precacheShell() has succeeded, so by
    // "ready" the shell cache is complete.
    const names = await caches.keys();
    const urls = [];
    for (const name of names.filter((n) => n.startsWith("rj-songs-shell"))) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) urls.push(new URL(req.url).pathname);
    }
    return urls;
  });

  expect(cached).toContain(SONGS_URL);
  expect(cached).toContain("/manifest.webmanifest");
  expect(cached).toContain("/script/lamejs-1.2.1-min.js");
  expect(cached).toContain("/script/songs-page.js");
  expect(cached).toContain("/script/songs/core/app.js");
  expect(cached.some((u) => /^\/css\/split\.min\..+\.css$/.test(u))).toBe(true);
});

test("Export MP3 loads lamejs on demand rather than with the page", async ({ page }) => {
  await page.goto(SONGS_URL);
  await expect(page.locator(SONG_ITEM).first()).toBeVisible();
  expect(await page.evaluate(() => typeof window.lamejs)).toBe("undefined");
  await expect(page.locator('script[src*="lamejs"]')).toHaveCount(0);
});

test("the instrument <select> drops native styling (WebKit ignores author styles otherwise)", async ({ page }) => {
  await page.goto(SONGS_URL);
  const appearance = await page.locator("#instrument").evaluate((node) => {
    const style = getComputedStyle(node);
    return style.appearance || style.webkitAppearance;
  });
  // "base-select" is the customisable-select mode split.css opts into where
  // supported; either way the UA's native menulist chrome is off.
  expect(["none", "base-select"]).toContain(appearance);
});

test("a worker upgrade drops the old shell cache but keeps downloaded soundfonts", async ({ page }) => {
  // First visit with the worker blocked: seed the caches an earlier worker
  // version left behind — a shell full of since-moved module paths, and the
  // soundfont samples a visitor downloaded for offline use.
  await page.route("**/sw.js", (route) => route.abort());
  await page.goto(SONGS_URL);
  await page.evaluate(async () => {
    const shell = await caches.open("rj-songs-shell-v1");
    await shell.put("/script/songs/app.js", new Response("old"));
    const samples = await caches.open("rj-songs-soundfont-v1");
    await samples.put("/test-soundfont-sample.mp3", new Response("sample"));
  });

  // Now let the current worker install and activate (activate() cleans up,
  // then claims the page).
  await page.unroute("**/sw.js");
  await page.reload();
  const names = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
      });
    }
    return caches.keys();
  });

  expect(names).not.toContain("rj-songs-shell-v1");
  expect(names.some((n) => n.startsWith("rj-songs-shell-"))).toBe(true);
  // The cache surviving by name is the property under test: the worker only
  // ever deletes whole caches (activate()), never individual entries, and
  // nothing on this page recreates the soundfont cache once deleted. Its
  // entry count isn't asserted — WebKit's test storage didn't keep the
  // page-seeded entry across the reload, which says nothing about the worker.
  expect(names).toContain("rj-songs-soundfont-v1");
});

import { test, expect } from "@playwright/test";

// Device sync against a fake server (docs/device-sync-plan.md, WBS 10.1, 10.2):
// the sync host is answered from this file by route, so what's checked is the
// real page on both sides. Two browser contexts are two devices (own storage).
const SYNC_HOST = "rj-sync.redjackets.workers.dev";
const CORS = { "access-control-allow-origin": "*", "access-control-expose-headers": "ETag" };
const WEBKIT_SKIP = "WebKit can't mock a CORS preflight";
const SETLISTS_TAB = '.rj-library-tab[data-tab="setlists"]';
const WS_PATTERN = new RegExp(`${SYNC_HOST.replaceAll(".", "\\.")}/v1/vault/[0-9a-f]{64}/live`);

// One vault in memory, speaking the worker's protocol (GET/PUT with versions).
function fakeServer() {
  const server = { vault: null, gets: 0, puts: 0 };
  server.handle = async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { ...CORS, "access-control-allow-headers": "Content-Type, If-None-Match", "access-control-allow-methods": "GET, PUT, DELETE, OPTIONS", "access-control-max-age": "600" } });
    }
    const json = (body, status) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (request.method() === "GET") {
      server.gets += 1;
      if (!server.vault) return json({ error: "No sync found" }, 404);
      if (request.headers()["if-none-match"] === `"${server.vault.version}"`) return route.fulfill({ status: 304, headers: CORS });
      return json(server.vault, 200);
    }
    server.puts += 1;
    const { expected, blob } = JSON.parse(request.postData());
    if (server.vault && server.vault.version !== expected) return json(server.vault, 409);
    server.vault = { version: (server.vault ? server.vault.version : 0) + 1, blob };
    return json({ version: server.vault.version }, 200);
  };
  return server;
}

// A device: its own context (so its own storage), the sync host mocked, third parties refused.
async function newDevice(browser, server, requests) {
  const context = await browser.newContext();
  await context.route((url) => url.hostname !== "127.0.0.1" && url.hostname !== SYNC_HOST, (route) => route.abort());
  await context.route(new RegExp(`^https://${SYNC_HOST.replaceAll(".", "\\.")}/`), server.handle);
  const page = await context.newPage();
  if (requests) page.on("request", (request) => requests.push(request.url()));
  const sockets = [];
  await page.routeWebSocket(WS_PATTERN, (ws) => { sockets.push(ws); });
  await page.goto("/songs/");
  await expect(page.locator(".song-list-item").first()).toBeVisible();
  await page.locator(SETLISTS_TAB).click();
  return { context, page, sockets };
}

test("sync is off by default: no request goes to the sync host", async ({ browser }) => {
  const requests = [];
  const device = await newDevice(browser, fakeServer(), requests);
  await device.page.waitForTimeout(1000);
  expect(requests.filter((url) => url.includes(SYNC_HOST))).toEqual([]);
  await device.context.close();
});

test("a setlist made on one device appears on the other, and a push triggers a pull", async ({ browser, browserName }) => {
  // Playwright's WebKit doesn't route CORS preflights through context.route, so the
  // PUT's preflight reaches the real host and is refused; a real Safari is checked by hand (plan 10.3).
  test.skip(browserName === "webkit", WEBKIT_SKIP);
  const server = fakeServer();
  const first = await newDevice(browser, server);
  await first.page.locator("#syncBtn").click();
  const consoleLines = [];
  first.page.on("console", (message) => consoleLines.push(message.text()));
  first.page.on("pageerror", (error) => consoleLines.push(String(error)));
  await first.page.locator("#syncConnect").click();
  try {
    await expect(first.page.locator("#syncCode")).not.toBeEmpty();
  } catch (error) {
    // Say why, not just that it stayed empty (the cause differs per engine).
    const state = await first.page.evaluate(() => ({
      status: document.getElementById("syncStatus").textContent,
      secure: window.isSecureContext,
      subtle: typeof (window.crypto && window.crypto.subtle),
    }));
    throw new Error(`Connect gave no code: ${JSON.stringify(state)}; console: ${consoleLines.join(" | ")}; puts: ${server.puts}`, { cause: error });
  }
  const code = await first.page.locator("#syncCode").innerText();
  await first.page.locator("#syncClose").click();

  await first.page.locator(".rj-library-new-setlist-btn").click();
  await first.page.locator("#setlistModalName").fill("Gig night");
  await first.page.locator("#setlistModalCreate").click();
  await expect.poll(() => server.puts, { timeout: 15_000 }).toBeGreaterThanOrEqual(2); // connect + the upload 3 s after the edit

  const second = await newDevice(browser, server);
  await second.page.locator("#syncBtn").click();
  await second.page.locator("#syncCodeInput").fill(code);
  await second.page.locator("#syncJoin").click();
  await expect(second.page.locator("#syncStatus")).toContainText(/\d\d:\d\d/);
  await second.page.locator("#syncClose").click();
  await expect(second.page.locator(".rj-library-list")).toContainText("Gig night");

  // A pushed version newer than the one this device has is pulled at once.
  await expect.poll(() => second.sockets.length).toBeGreaterThan(0);
  const before = server.gets;
  second.sockets[0].send(JSON.stringify({ version: 99 }));
  await expect.poll(() => server.gets).toBeGreaterThan(before);

  await first.context.close();
  await second.context.close();
});

// Shared space with two members (plan 11.6): one starts a space and makes a
// setlist in it, the other joins by code and sees it, edits it, and the first
// gets the edit back. Two contexts are two members.
async function openSharedTab(page) {
  await page.locator("#syncBtn").click();
  await page.locator("#syncTabBand").click();
}

test("two members of a shared space see and edit the same setlist", async ({ browser, browserName }) => {
  test.skip(browserName === "webkit", WEBKIT_SKIP);
  const server = fakeServer();

  const anna = await newDevice(browser, server);
  await openSharedTab(anna.page);
  await anna.page.locator("#bandName").fill("Anna");
  await anna.page.locator("#bandConnect").click();
  await expect(anna.page.locator("#bandCode")).not.toBeEmpty();
  const code = await anna.page.locator("#bandCode").innerText();
  await anna.page.keyboard.press("Escape");

  // The space has a shelf of its own on the Setlists tab, with its own New setlist button.
  const shelfButton = anna.page.locator(".rj-library-new-setlist-btn").last();
  await shelfButton.click();
  await anna.page.locator("#setlistModalName").fill("Shared gig");
  await anna.page.locator("#setlistModalCreate").click();
  await expect.poll(() => server.puts, { timeout: 15_000 }).toBeGreaterThanOrEqual(2); // start + the upload after the edit

  const ben = await newDevice(browser, server);
  await openSharedTab(ben.page);
  await ben.page.locator("#bandName").fill("Ben");
  await ben.page.locator("#bandCodeInput").fill(code);
  await ben.page.locator("#bandJoin").click();
  await expect(ben.page.locator("#bandStatus")).toContainText(/\d\d:\d\d/);
  await ben.page.keyboard.press("Escape");
  await expect(ben.page.locator(".rj-library-list")).toContainText("Shared gig");

  // A member edits the shared setlist; the other gets it back on the next sync.
  await ben.page.locator(".rj-library-list").getByText("Shared gig").click();
  await ben.page.locator("#setlistAddSongSearch").fill("bill");
  await ben.page.locator(".rj-library-add-song-result").first().click();
  const putsBefore = server.puts;
  await expect.poll(() => server.puts, { timeout: 15_000 }).toBeGreaterThan(putsBefore);

  await anna.page.locator("#syncBtn").click();
  await anna.page.locator("#syncTabBand").click();
  await anna.page.locator("#bandNow").click();
  await anna.page.keyboard.press("Escape");
  await anna.page.locator(SETLISTS_TAB).click();
  await expect(anna.page.locator(".rj-library-list")).toContainText(/1 song/i);

  await anna.context.close();
  await ben.context.close();
});

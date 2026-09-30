// Real-browser smoke tests against the built site (run `hugo` first).
// Catches what the jsdom suite structurally can't: CSS/layout, <dialog>
// behaviour, and service-worker install. See tests/e2e/.
//
// Chromium always runs. WebKit (the engine behind every Safari-specific
// regression recorded in CLAUDE.md's "Browser support") runs when E2E_WEBKIT=1
// — CI sets it after `playwright install webkit`. E2E_CHROMIUM_PATH points at a
// preinstalled Chromium instead of the one Playwright downloads.

import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const chromiumPath = process.env.E2E_CHROMIUM_PATH;

const projects = [{
  name: "chromium",
  use: {
    ...devices["Desktop Chrome"],
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },
}];
if (process.env.E2E_WEBKIT === "1") {
  projects.push({ name: "webkit", use: { ...devices["Desktop Safari"] } });
}

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    command: "node scripts/serve-public.js",
    url: `http://127.0.0.1:${PORT}/songs/`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
  },
  projects,
});

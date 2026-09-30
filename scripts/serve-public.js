// Minimal static file server for the built site (public/), used by the
// Playwright smoke tests (playwright.config.js). Plain node:http so the e2e
// suite adds no server dependency; GitHub Pages semantics are enough here:
// a directory serves its index.html, and unknown paths are a 404.
// Bound to loopback only.

import { createServer } from "node:http";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "public");
const PORT = Number(process.env.PORT) || 4173;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".abc": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

// Every servable file, indexed once at startup: URL path -> absolute file path.
// A request only ever *looks up* its path in this map — request data never
// reaches the filesystem, so there is no path to traverse.
async function indexFiles(dir, urlPrefix, files) {
  const entries = await readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries.map((entry) => {
      const url = `${urlPrefix}${entry.name}`;
      if (entry.isDirectory()) return indexFiles(join(dir, entry.name), `${url}/`, files);
      files.set(url, join(dir, entry.name));
      return undefined;
    }),
  );
  return files;
}

// GitHub Pages semantics: "/dir/" serves "/dir/index.html"; "/dir" and "/"
// resolve the same way.
function lookup(files, pathname) {
  const path = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  return files.get(path) || files.get(`${path}/index.html`);
}

const files = await indexFiles(ROOT, "/", new Map());

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  const file = lookup(files, pathname);
  if (!file) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
  res.end(await readFile(file));
}).listen(PORT, "127.0.0.1", () => console.error(`serving public/ on http://localhost:${PORT}`));

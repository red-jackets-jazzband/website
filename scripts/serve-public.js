// Minimal static file server for the built site (public/), used by the
// Playwright smoke tests (playwright.config.js). Plain node:http so the e2e
// suite adds no server dependency; GitHub Pages semantics are enough here:
// a directory serves its index.html, and unknown paths are a 404.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";

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

async function resolveFile(pathname) {
  const target = normalize(join(ROOT, decodeURIComponent(pathname)));
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;
  try {
    const info = await stat(target);
    return info.isDirectory() ? join(target, "index.html") : target;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  const file = await resolveFile(pathname);
  try {
    const body = file && await readFile(file);
    if (!body) throw new Error("not found");
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}).listen(PORT, () => console.error(`serving public/ on http://localhost:${PORT}`));

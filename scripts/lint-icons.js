#!/usr/bin/env node
// Keeps the site's Font Awesome subset (assets/css/icons.css, built by
// scripts/build-icons.js) complete: every Font Awesome icon the templates,
// content, scripts, tour copy or stylesheet name must have its rule in it.
// An icon missing from the subset would otherwise just render as nothing.
// Fix a failure with `npm run build:icons`.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SCAN_DIRS = ["layouts", "content", "themes/split/layouts", "static/script", "static/tour", "i18n"];
const SCAN_FILES = ["assets/css/split.css", "config.toml"];
const SCAN_EXTENSIONS = new Set([".html", ".md", ".js", ".toml", ".css"]);
// Vendored bundles and tests aren't the site's own markup.
const SKIP_FILE = /(?:\.test\.js|min\.js|^abcjs.*|^tonal.*)$/;
const FA_CSS = join(ROOT, "node_modules", "@fortawesome", "fontawesome-free", "css", "all.css");
const SUBSET_CSS = join(ROOT, "assets", "css", "icons.css");
const TOKEN = /\bfa-[a-z0-9-]+/g;

function extensionOf(file) {
  const dot = file.lastIndexOf(".");
  return dot === -1 ? "" : file.slice(dot);
}

function listFiles(dir) {
  const abs = join(ROOT, dir);
  return readdirSync(abs).flatMap((name) => {
    const path = join(abs, name);
    if (statSync(path).isDirectory()) return listFiles(relative(ROOT, path));
    return SCAN_EXTENSIONS.has(extensionOf(name)) && !SKIP_FILE.test(name) ? [path] : [];
  });
}

// Every class name `.fa-<name>` a stylesheet defines, as a selector on its own.
function definedClasses(css) {
  const names = new Set();
  let at = css.indexOf(".fa-");
  while (at !== -1) {
    let end = at + 1;
    while (end < css.length && /[a-z0-9-]/.test(css[end])) end += 1;
    names.add(css.slice(at + 1, end));
    at = css.indexOf(".fa-", end);
  }
  return names;
}

// The fa-* tokens the site's own files use that Font Awesome defines.
export function scanIconNames() {
  const defined = definedClasses(readFileSync(FA_CSS, "utf8"));
  const files = [...SCAN_DIRS.flatMap(listFiles), ...SCAN_FILES.map((file) => join(ROOT, file))];
  const used = new Set();
  files.forEach((file) => {
    const text = readFileSync(file, "utf8");
    TOKEN.lastIndex = 0;
    let match = TOKEN.exec(text);
    while (match) {
      if (defined.has(match[0])) used.add(match[0]);
      match = TOKEN.exec(text);
    }
  });
  return used;
}

function main() {
  const subset = definedClasses(readFileSync(SUBSET_CSS, "utf8"));
  const missing = [...scanIconNames()].filter((name) => !subset.has(name)).sort();
  if (missing.length > 0) {
    console.error(`Icons used but missing from assets/css/icons.css: ${missing.join(", ")}`);
    console.error("Run `npm run build:icons` to rebuild the Font Awesome subset.");
    process.exitCode = 1;
    return;
  }
  process.stdout.write("icon lint passed: every Font Awesome icon used is in the subset.\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

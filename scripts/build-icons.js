#!/usr/bin/env node
// Builds the site's own Font Awesome subset: assets/css/icons.css plus
// static/fonts/fa-*.subset.woff2, holding only the icons the site uses.
// Both are generated, never committed (.gitignore): CI runs this right
// before the Hugo build, so the subset always matches the source — a new
// icon in a template or script, or a Font Awesome update from Dependabot,
// needs no manual step. Locally, `npm run dev` / `npm run build` run it
// first; a bare `hugo serve` without it falls back to the full kit from
// cdnjs (layouts/partials/head.html).
//
// Why a subset: Font Awesome used to come from cdnjs as the whole kit, a
// render-blocking stylesheet on another origin (one more DNS + TLS handshake
// before first paint) and up to ~350 KB of CSS and fonts for the ~40 icons
// used here. This keeps the same classes and the same glyphs (`<span
// class="fa-solid fa-play">` renders exactly as before), served same-origin
// inside the one site stylesheet (head.html concatenates icons.css after
// split.css). Pure Node: postcss for the CSS, subset-font (HarfBuzz, as
// WebAssembly) for the fonts.
//
// Which icons are used: every `fa-<name>` token in the templates, content,
// scripts, tour copy and stylesheet that Font Awesome defines as a class. An
// icon name assembled at runtime from pieces (`"fa-" + name`) can't be seen —
// write icon class names out in full.

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import subsetFont from "subset-font";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FA_DIR = join(ROOT, "node_modules", "@fortawesome", "fontawesome-free");
const FA_CSS = join(FA_DIR, "css", "all.css");
const FA_MAJOR = JSON.parse(readFileSync(join(FA_DIR, "package.json"), "utf8")).version.split(".")[0];
const OUT_CSS = join(ROOT, "assets", "css", "icons.css");
const FONT_URL_DIR = "/fonts";
const FONT_OUT_DIR = join(ROOT, "static", "fonts");

const SCAN_DIRS = ["layouts", "content", "themes/split/layouts", "static/script", "static/tour", "i18n"];
const SCAN_FILES = ["assets/css/split.css", "config.toml"];
const SCAN_EXTENSIONS = new Set([".html", ".md", ".js", ".toml", ".css"]);
// Vendored bundles and tests aren't the site's own markup.
const SKIP_FILE = /(?:\.test\.js|min\.js|^abcjs.*|^tonal.*)$/;
const TOKEN = /\bfa-[a-z0-9-]+/g;

// The three Font Awesome faces, by the style class that selects each, and the
// webfont behind it. A face is only kept if its style class is used.
const FACES = [
  { styleClasses: ["fa-solid", "fas"], file: "fa-solid-900" },
  { styleClasses: ["fa-regular", "far"], file: "fa-regular-400" },
  { styleClasses: ["fa-brands", "fab"], file: "fa-brands-400" },
];

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

// Every class name `.fa-<name>` a stylesheet defines.
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
function scanIconNames(faCss) {
  const defined = definedClasses(faCss);
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

// `.fa-play{--fa:"\f04b"}` (plus the duotone `--fa--fa` twin some icons
// carry): a rule that only names one icon's glyph. Not a style rule like
// Font Awesome 7's `.fa-solid{--fa-style:900}`, which sets other --fa-* props.
const GLYPH_PROPS = new Set(["--fa", "--fa--fa"]);
function iconRuleName(rule) {
  const decls = rule.nodes.filter((node) => node.type === "decl");
  if (!decls.some((decl) => decl.prop === "--fa")) return null;
  if (!decls.every((decl) => GLYPH_PROPS.has(decl.prop))) return null;
  const selectors = rule.selectors.map((sel) => sel.trim());
  if (!selectors.every((sel) => /^\.fa-[a-z0-9-]+$/.test(sel))) return null;
  return selectors.map((sel) => sel.slice(1));
}

function codepointOf(rule) {
  const decl = rule.nodes.find((node) => node.type === "decl" && node.prop === "--fa");
  const hex = /^"\\([0-9a-f]+)"$/i.exec(decl.value.trim());
  if (hex) return Number.parseInt(hex[1], 16);
  const literal = /^"(.)"$/u.exec(decl.value.trim());
  return literal ? literal[1].codePointAt(0) : null;
}

function faceFile(atRule) {
  let file = null;
  atRule.walkDecls("src", (decl) => {
    const match = /webfonts\/([a-z0-9-]+)\.woff2/.exec(decl.value);
    if (match) file = match[1];
  });
  return file;
}

function familyOf(atRule) {
  let family = "";
  atRule.walkDecls("font-family", (decl) => {
    family = decl.value;
  });
  return family;
}

// Keep only the used faces, pointed at their subset files. Only the current
// major version's families: the "FontAwesome" / older-major compatibility
// faces serve older versions' class names, used nowhere here.
function pruneFaces(root, keptFiles) {
  root.walkAtRules("font-face", (atRule) => {
    const file = faceFile(atRule);
    if (!file || !keptFiles.has(file) || !familyOf(atRule).includes(`Font Awesome ${FA_MAJOR}`)) {
      atRule.remove();
      return;
    }
    atRule.walkDecls("src", (decl) => {
      decl.value = `url("${FONT_URL_DIR}/${file}.subset.woff2") format("woff2")`;
    });
  });
}

// Drop every icon rule the site doesn't use; returns the kept icons' names and
// glyph codepoints.
function pruneIcons(root, used) {
  const names = new Set();
  const codepoints = new Set();
  root.walkRules((rule) => {
    const ruleNames = iconRuleName(rule);
    if (!ruleNames) return;
    if (!ruleNames.some((name) => used.has(name))) {
      rule.remove();
      return;
    }
    ruleNames.filter((name) => used.has(name)).forEach((name) => names.add(name));
    const cp = codepointOf(rule);
    if (cp !== null) codepoints.add(cp);
  });
  return { names, codepoints };
}

async function main() {
  const faCss = readFileSync(FA_CSS, "utf8");
  const used = scanIconNames(faCss);
  const keptFaces = FACES.filter((face) => face.styleClasses.some((cls) => used.has(cls)));
  const keptFiles = new Set(keptFaces.map((face) => face.file));
  const root = postcss.parse(faCss);

  // Every comment but Font Awesome's own `/*! ... */` licence banner, which
  // the minifier keeps too.
  root.walkComments((comment) => {
    if (!comment.text.startsWith("!")) comment.remove();
  });
  pruneFaces(root, keptFiles);
  const { names, codepoints } = pruneIcons(root, used);

  const header = `/* GENERATED by scripts/build-icons.js (npm run build:icons) - do not edit, not committed.\n * Icons: ${[...names].sort((a, b) => a.localeCompare(b)).join(" ")} */\n`;
  mkdirSync(dirname(OUT_CSS), { recursive: true });
  writeFileSync(OUT_CSS, header + root.toString().replace(/\n{2,}/g, "\n").trim() + "\n");

  const glyphs = String.fromCodePoint(...codepoints);
  mkdirSync(FONT_OUT_DIR, { recursive: true });
  await Promise.all(keptFaces.map(async (face) => {
    const font = readFileSync(join(FA_DIR, "webfonts", `${face.file}.woff2`));
    const subset = await subsetFont(font, glyphs, { targetFormat: "woff2" });
    writeFileSync(join(FONT_OUT_DIR, `${face.file}.subset.woff2`), subset);
  }));
  process.stdout.write(`icons: ${names.size} icons, faces: ${[...keptFiles].join(", ")}\n`);
}

await main();

#!/usr/bin/env node
// Builds the site's own Font Awesome subset: assets/css/icons.css plus
// static/fonts/fa-*.subset.woff2, holding only the icons the site uses.
//
// Font Awesome used to come from cdnjs as the whole kit: a render-blocking
// stylesheet on another origin (one more DNS + TLS handshake before first
// paint) and up to ~350 KB of CSS and fonts for the ~40 icons used here. This
// keeps the same classes and the same glyphs (`<span class="fa-solid
// fa-play">` renders exactly as before), served same-origin, as part of the
// one site stylesheet (layouts/partials/head.html concatenates icons.css with
// split.css).
//
// Run `npm run build:icons` after using an icon the site hasn't used before;
// `npm run lint:icons` (scripts/lint-icons.js) fails until you do. Needs
// fonttools' `pyftsubset` with brotli (`pip install fonttools brotli`) for the
// fonts; the CSS side is plain Node + postcss.
//
// Which icons are used: every `fa-<name>` token in the templates, content,
// scripts, tour copy and stylesheet that Font Awesome defines as an icon
// (scanIconNames in lint-icons.js — the same scan the lint runs).

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postcss from "postcss";
import { ROOT, scanIconNames } from "./lint-icons.js";

const FA_DIR = join(ROOT, "node_modules", "@fortawesome", "fontawesome-free");
const FA_CSS = join(FA_DIR, "css", "all.css");
const OUT_CSS = join(ROOT, "assets", "css", "icons.css");
const FONT_URL_DIR = "/fonts";
const FONT_OUT_DIR = join(ROOT, "static", "fonts");

// The three Font Awesome faces, by the style class that selects each, and the
// webfont behind it. A face is only kept if its style class is used.
const FACES = [
  { styleClasses: ["fa-solid", "fas"], file: "fa-solid-900" },
  { styleClasses: ["fa-regular", "far"], file: "fa-regular-400" },
  { styleClasses: ["fa-brands", "fab"], file: "fa-brands-400" },
];

// `.fa-play{--fa:"\f04b"}` (plus the duotone `--fa--fa` twin some icons
// carry): a rule that only names one icon's glyph.
function iconRuleName(rule) {
  const decls = rule.nodes.filter((node) => node.type === "decl");
  if (decls.length === 0 || !decls.every((decl) => decl.prop.startsWith("--fa"))) return null;
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

function subsetFont(file, codepoints, workDir) {
  const unicodes = [...codepoints].map((cp) => `U+${cp.toString(16)}`).join(",");
  const out = join(workDir, `${file}.woff2`);
  // A dev tool run by hand (`npm run build:icons`), never in CI or on the
  // site: pyftsubset is wherever the developer's Python put it.
  // eslint-disable-next-line sonarjs/no-os-command-from-path
  execFileSync("pyftsubset", [ // NOSONAR
    join(FA_DIR, "webfonts", `${file}.ttf`),
    `--unicodes=${unicodes}`,
    "--flavor=woff2",
    "--layout-features=*",
    "--no-hinting",
    `--output-file=${out}`,
  ]);
  writeFileSync(join(FONT_OUT_DIR, `${file}.subset.woff2`), readFileSync(out));
}

function main() {
  const used = scanIconNames();
  const root = postcss.parse(readFileSync(FA_CSS, "utf8"));
  const keptFaces = FACES.filter((face) => face.styleClasses.some((cls) => used.has(cls)));
  const keptFiles = new Set(keptFaces.map((face) => face.file));
  const codepoints = new Set();
  const kept = [];

  root.walk((node) => {
    if (node.type === "comment") node.remove();
  });
  root.walkAtRules("font-face", (atRule) => {
    const file = faceFile(atRule);
    // Only the Font Awesome 6 families: the "FontAwesome" / "Font Awesome 5"
    // compatibility faces serve older versions' class names, used nowhere here.
    let family = "";
    atRule.walkDecls("font-family", (decl) => {
      family = decl.value;
    });
    if (!file || !keptFiles.has(file) || !family.includes("Font Awesome 6")) {
      atRule.remove();
      return;
    }
    atRule.walkDecls("src", (decl) => {
      decl.value = `url("${FONT_URL_DIR}/${file}.subset.woff2") format("woff2")`;
    });
  });
  root.walkRules((rule) => {
    const names = iconRuleName(rule);
    if (!names) return;
    if (!names.some((name) => used.has(name))) {
      rule.remove();
      return;
    }
    kept.push(...names.filter((name) => used.has(name)));
    const cp = codepointOf(rule);
    if (cp !== null) codepoints.add(cp);
  });

  const header = [
    "/* Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com",
    " * License - https://fontawesome.com/license/free (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT License)",
    " * Copyright 2024 Fonticons, Inc.",
    " *",
    " * GENERATED by scripts/build-icons.js (npm run build:icons) - do not edit.",
    ` * Icons: ${[...new Set(kept)].sort().join(" ")}`,
    " */",
    "",
  ].join("\n");
  writeFileSync(OUT_CSS, header + root.toString().replace(/\n{2,}/g, "\n").trim() + "\n");

  const workDir = mkdtempSync(join(tmpdir(), "rj-icons-"));
  try {
    keptFaces.forEach((face) => subsetFont(face.file, codepoints, workDir));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
  process.stdout.write(`icons: ${new Set(kept).size} icons, faces: ${[...keptFiles].join(", ")}\n`);
}

main();

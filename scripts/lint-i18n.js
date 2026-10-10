// Keeps the /songs/ page's translations honest. Two kinds of string reach the
// screen: markup, which layouts/shortcodes/songs-app.html (and the nav
// partial) fill in with Hugo's `{{ i18n "key" }}`, and strings the page's own
// JavaScript builds, written `tl("key", "English text", params)` (see
// static/script/lib/core/i18n.js). Both live in i18n/<lang>.toml — JS keys
// carry a `js_` prefix there — with English as the source of truth. This
// script fails when:
//   - a key a template or a `tl()` call uses is missing from i18n/en.toml,
//     or a `tl()` call's English text differs from en.toml's;
//   - en.toml carries a key nothing uses;
//   - nl/de/fr don't have exactly en.toml's keys, or a translation lacks (or
//     adds) a `{placeholder}` its English text has.
// Scanning is by plain indexOf walks, not delimiter-spanning regexes.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const LANGS = ["nl", "de", "fr"];
const TEMPLATE_FILES = [
  "layouts/shortcodes/songs-app.html",
  "layouts/partials/intro.html",
  "layouts/partials/head.html",
];

function readText(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

// `key = "value"` lines of a flat TOML file → Map. A basic TOML string and a
// JSON string escape the quote and the backslash the same way.
function parseToml(path) {
  const entries = new Map();
  readText(path).split("\n").forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf(" = ");
    if (eq < 0) throw new Error(`${path}:${index + 1}: not a "key = value" line`);
    entries.set(trimmed.slice(0, eq), JSON.parse(trimmed.slice(eq + 3)));
  });
  return entries;
}

// The end index (exclusive) of the double-quoted literal starting at `start`.
function literalEnd(source, start) {
  let i = start + 1;
  while (i < source.length && source[i] !== '"') i += source[i] === "\\" ? 2 : 1;
  return i + 1;
}

// Every tl("key", "English"…) call in a source file; `english` is null when no
// double-quoted English literal follows the key on the same line.
function scanCalls(source) {
  const calls = [];
  const marker = 'tl("';
  let at = source.indexOf(marker);
  while (at >= 0) {
    const keyStart = at + marker.length - 1;
    const keyEnd = literalEnd(source, keyStart);
    const key = source.slice(keyStart + 1, keyEnd - 1);
    if (source.startsWith(', "', keyEnd)) {
      const textStart = keyEnd + 2;
      calls.push({ key, english: JSON.parse(source.slice(textStart, literalEnd(source, textStart))) });
    } else {
      calls.push({ key, english: null });
    }
    at = source.indexOf(marker, keyEnd);
  }
  return calls;
}

// Every `i18n "key"` in a Hugo template.
function scanTemplateKeys(source) {
  const keys = [];
  const marker = 'i18n "';
  let at = source.indexOf(marker);
  while (at >= 0) {
    const end = source.indexOf('"', at + marker.length);
    if (end < 0) break;
    keys.push(source.slice(at + marker.length, end));
    at = source.indexOf(marker, end);
  }
  return keys;
}

function sourceFiles(dir) {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(ROOT, path)).isDirectory()) return sourceFiles(path);
    return name.endsWith(".js") && !name.endsWith(".test.js") ? [path] : [];
  });
}

function placeholders(text) {
  const found = [];
  let at = text.indexOf("{");
  while (at >= 0) {
    const end = text.indexOf("}", at);
    if (end < 0) break;
    found.push(text.slice(at, end + 1));
    at = text.indexOf("{", end);
  }
  return found.toSorted((a, b) => a.localeCompare(b)).join(" ");
}

function checkUsage(english, problems) {
  const used = new Set();
  sourceFiles("static/script").forEach((path) => {
    scanCalls(readText(path)).forEach(({ key, english: text }) => {
      const full = `js_${key}`;
      used.add(full);
      if (text === null) {
        problems.push(`${path}: tl("${key}") must pass a double-quoted English literal as its second argument, on the same line`);
      } else if (!english.has(full)) {
        problems.push(`${path}: tl("${key}") has no ${full} in i18n/en.toml`);
      } else if (english.get(full) !== text) {
        problems.push(`${path}: tl("${key}") says ${JSON.stringify(text)}, i18n/en.toml says ${JSON.stringify(english.get(full))}`);
      }
    });
  });
  TEMPLATE_FILES.forEach((path) => {
    scanTemplateKeys(readText(path)).forEach((key) => {
      used.add(key);
      if (!english.has(key)) problems.push(`${path}: i18n "${key}" is not in i18n/en.toml`);
    });
  });
  english.forEach((_text, key) => {
    // Keys with a prefix other than songs_/js_ belong to other pages.
    if ((key.startsWith("songs_") || key.startsWith("js_")) && !used.has(key)) {
      problems.push(`i18n/en.toml: ${key} is not used anywhere`);
    }
  });
}

function checkTranslation(lang, english, problems) {
  const path = `i18n/${lang}.toml`;
  const table = parseToml(path);
  english.forEach((text, key) => {
    if (!table.has(key)) {
      problems.push(`${path}: missing ${key}`);
    } else if (placeholders(table.get(key)) !== placeholders(text)) {
      problems.push(`${path}: ${key} has placeholders "${placeholders(table.get(key))}", English has "${placeholders(text)}"`);
    }
  });
  table.forEach((_text, key) => {
    if (!english.has(key)) problems.push(`${path}: ${key} is not in i18n/en.toml`);
  });
}

const english = parseToml("i18n/en.toml");
const problems = [];
checkUsage(english, problems);
LANGS.forEach((lang) => checkTranslation(lang, english, problems));

if (problems.length > 0) {
  problems.forEach((problem) => console.error(`  ${problem}`));
  console.error(`\ni18n lint failed: ${problems.length} problem(s) (see ${relative(ROOT, join(ROOT, "scripts/lint-i18n.js"))}).`);
  process.exit(1);
}

console.error(`i18n lint passed: ${english.size} strings × ${LANGS.length + 1} languages.`);

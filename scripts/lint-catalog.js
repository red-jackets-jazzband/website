// Cross-checks the song catalog's manifests against the files they name, so a
// rename or deletion can't leave a dead link that only surfaces as a 404 on
// the live /songs/ page:
//   - every song in index_of_songs.txt exists in static/songs/
//   - every setlist in index_of_setlists.txt exists in static/setlists/
//   - every song a setlist links to exists in static/songs/
//   - every F: (inspiration) field in a tune is an absolute http(s) URL
// A .abc file that no index entry points at is only reported, not failed:
// keeping a tune out of the public list on purpose is legitimate.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSetlistFile } from "../static/script/lib/setlist-format.js";

const ROOT = join(import.meta.dirname, "..", "static");
const SONGS_DIR = join(ROOT, "songs");
const SETLISTS_DIR = join(ROOT, "setlists");
const problems = [];

// "Display name,file.abc" — the file is whatever follows the last comma, since
// a display name may itself contain one.
function manifestEntries(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => ({ line, file: line.slice(line.lastIndexOf(",") + 1).trim() }));
}

const songFiles = new Set(readdirSync(SONGS_DIR).filter((f) => f.endsWith(".abc")));
const indexed = new Set();

for (const { line, file } of manifestEntries(join(SONGS_DIR, "index_of_songs.txt"))) {
  indexed.add(file);
  if (!songFiles.has(file)) problems.push(`index_of_songs.txt: "${line}" -> missing ${file}`);
}

for (const { line, file } of manifestEntries(join(SETLISTS_DIR, "index_of_setlists.txt"))) {
  const path = join(SETLISTS_DIR, file);
  if (!existsSync(path)) {
    problems.push(`index_of_setlists.txt: "${line}" -> missing ${file}`);
    continue;
  }
  for (const song of parseSetlistFile(readFileSync(path, "utf8")).songs) {
    if (song.file && !songFiles.has(song.file)) problems.push(`${file}: links to missing song ${song.file}`);
  }
}

function isHttpUrl(value) {
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

for (const file of songFiles) {
  const lines = readFileSync(join(SONGS_DIR, file), "utf8").split(/\r?\n/);
  for (const [i, text] of lines.entries()) {
    if (text.startsWith("F:") && !isHttpUrl(text.slice(2).trim())) {
      problems.push(`${file}:${i + 1}: F: field is not an http(s) URL: ${text}`);
    }
  }
}

const unindexed = [...songFiles].filter((f) => !indexed.has(f)).sort((a, b) => a.localeCompare(b));
if (unindexed.length > 0) {
  console.error(`note: ${unindexed.length} .abc file(s) not in index_of_songs.txt: ${unindexed.join(", ")}`);
}

if (problems.length > 0) {
  console.error(`\n${problems.join("\n")}\n\ncatalog lint failed: ${problems.length} problem(s) above.`);
  process.exit(1);
}
console.error(`catalog lint passed: ${songFiles.size} songs, no dead links.`);

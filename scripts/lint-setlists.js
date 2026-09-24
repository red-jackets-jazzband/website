// Lints every band setlist file in static/setlists/ with the real
// parseSetlistFile parser (the same one the /songs/ page uses) and fails CI
// on any line it couldn't make sense of, instead of that content silently
// vanishing (or, before a fix to the parser itself, silently turning into a
// bogus song entry) and only showing up when someone notices a setlist looks
// wrong on the site. There's nothing to check about a personal setlist here
// — those live in a visitor's own browser, never in this repo.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSetlistFile } from "../static/script/lib/setlist-format.js";

const SETLISTS_DIR = join(import.meta.dirname, "..", "static", "setlists");
const INDEX_FILE = "index_of_setlists.txt";

const files = readdirSync(SETLISTS_DIR)
  .filter((file) => file.endsWith(".txt") && file !== INDEX_FILE)
  .sort();
let hasIssues = false;

for (const file of files) {
  const content = readFileSync(join(SETLISTS_DIR, file), "utf8");
  const { warnings } = parseSetlistFile(content);
  if (warnings.length > 0) {
    hasIssues = true;
    console.error(`\n${file}`);
    for (const warning of warnings) {
      console.error(`  ${warning}`);
    }
  }
}

if (hasIssues) {
  console.error("\nsetlist lint failed: issues found in the files above.");
  process.exit(1);
}

console.error(`setlist lint passed: ${files.length} files, no issues.`);

// Markdown-style pipe tables inside W: (words) lines.
//
// abcjs prints W: lines as plain proportional-font text, so a table written
// there would show its literal `|` characters. A run of consecutive W: lines
// that each start with `|` is therefore pulled out of the ABC handed to the
// renderer and returned as rows of cells, for the sheet to draw as a real
// <table>. Every W: line that isn't part of such a run is left alone.

const WORDS_PREFIX = "W:";

// "| a | b |" -> ["a", "b"]; null when the line isn't a table row.
function splitRow(line) {
  if (!line.startsWith(WORDS_PREFIX)) return null;
  const body = line.slice(WORDS_PREFIX.length).trim();
  if (!body.startsWith("|")) return null;
  const inner = body.endsWith("|") && body.length > 1 ? body.slice(1, -1) : body.slice(1);
  return inner.split("|").map((cell) => cell.trim());
}

// The `|---|---|` separator row under a header.
function isSeparator(cells) {
  return cells.length > 0 && cells.every((cell) => cell.length > 0 && cell.replace(/[-:]/g, "") === "");
}

// Reads every table out of `abcText`. Returns the text with the table lines
// removed and the tables found: `{ header: string[] | null, rows: string[][] }`.
// A table has a header only when its second row is a `---` separator.
export function extractWordsTables(abcText) {
  const kept = [];
  const tables = [];
  let current = null;
  for (const line of abcText.split("\n")) {
    const cells = splitRow(line.trimEnd());
    if (cells === null) {
      current = null;
      kept.push(line);
    } else {
      if (current === null) {
        current = { header: null, rows: [] };
        tables.push(current);
      }
      if (isSeparator(cells) && current.rows.length === 1 && current.header === null) {
        current.header = current.rows.pop();
      } else if (!isSeparator(cells)) {
        current.rows.push(cells);
      }
    }
  }
  return { abcText: kept.join("\n"), tables };
}

// Turns a table on its side: each original column becomes a row, so the
// steps of a form read left to right. A header column becomes the row labels.
// Returns `{ labels: string[] | null, rows: string[][] }`.
export function transposeTable({ header, rows }) {
  const all = header ? [header, ...rows] : rows;
  const width = all.reduce((max, row) => Math.max(max, row.length), 0);
  const columns = [];
  for (let c = 0; c < width; c++) {
    columns.push(all.map((row) => (c < row.length ? row[c] : "")));
  }
  if (!header) return { labels: null, rows: columns };
  return { labels: columns.map((column) => column[0]), rows: columns.map((column) => column.slice(1)) };
}

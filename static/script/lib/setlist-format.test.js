import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSetlistFile, serializeSetlistFile } from "./setlist-format.js";

const BASIN_STREET = "basin_street.abc";

test("parseSetlistFile reads a '# title', free-text desc, and songs with optional key overrides", () => {
  const text = [
    "# Zeeland Jazz 2026",
    "",
    "Our main summer set.",
    "",
    `${BASIN_STREET},C`,
    "auld_lang_syne.abc,",
    "aint_my_fault.abc,Am",
  ].join("\n");

  const setlist = parseSetlistFile(text);
  assert.equal(setlist.name, "Zeeland Jazz 2026");
  assert.equal(setlist.desc, "Our main summer set.");
  assert.deepEqual(setlist.songs, [
    { file: BASIN_STREET, key: "C" },
    { file: "auld_lang_syne.abc", key: "" },
    { file: "aint_my_fault.abc", key: "Am" },
  ]);
});

test("parseSetlistFile keeps blank-line-separated desc paragraphs apart", () => {
  const text = [
    "# Festival night",
    "",
    "First paragraph.",
    "Still the first paragraph.",
    "",
    "Second paragraph.",
    "",
    `${BASIN_STREET},`,
  ].join("\n");

  const setlist = parseSetlistFile(text);
  assert.equal(setlist.desc, "First paragraph.\nStill the first paragraph.\n\nSecond paragraph.");
});

test("parseSetlistFile works with no name/desc at all", () => {
  const setlist = parseSetlistFile(`${BASIN_STREET},\n`);
  assert.equal(setlist.name, null);
  assert.equal(setlist.desc, null);
  assert.deepEqual(setlist.songs, [{ file: BASIN_STREET, key: "" }]);
});

test("parseSetlistFile skips blank lines", () => {
  const text = `\n${BASIN_STREET},\n\n`;
  const setlist = parseSetlistFile(text);
  assert.deepEqual(setlist.songs, [{ file: BASIN_STREET, key: "" }]);
});

test("parseSetlistFile splits the list into sets on '##' headings", () => {
  const text = [
    "# Festival night",
    `${BASIN_STREET},C`,
    "##",
    "tiger_rag.abc,",
    "## Encores",
    "indiana.abc,",
  ].join("\n");

  const setlist = parseSetlistFile(text);
  assert.deepEqual(setlist.songs, [
    { file: BASIN_STREET, key: "C" },
    { divider: "" },
    { file: "tiger_rag.abc", key: "" },
    { divider: "Encores" },
    { file: "indiana.abc", key: "" },
  ]);
});

test("parseSetlistFile attaches '> ' lines right after a song as its multi-line note", () => {
  const text = [
    "# Festival night",
    `${BASIN_STREET},C`,
    "> Ben solos 2nd chorus.",
    "> Watch the key change into the outro.",
    "tiger_rag.abc,",
  ].join("\n");

  const setlist = parseSetlistFile(text);
  assert.deepEqual(setlist.songs, [
    { file: BASIN_STREET, key: "C", note: "Ben solos 2nd chorus.\nWatch the key change into the outro." },
    { file: "tiger_rag.abc", key: "" },
  ]);
});

test("parseSetlistFile treats a bare '>' inside a note as a blank line", () => {
  const text = [`${BASIN_STREET},`, "> First part.", ">", "> Second part."].join("\n");
  const setlist = parseSetlistFile(text);
  assert.equal(setlist.songs[0].note, "First part.\n\nSecond part.");
});

test("parseSetlistFile drops a '> ' line with nothing to attach to", () => {
  const text = ["# Title", "> stray, before any song", `${BASIN_STREET},`, "## Set 2", "> also stray"].join("\n");
  const setlist = parseSetlistFile(text);
  assert.deepEqual(setlist.songs, [{ file: BASIN_STREET, key: "" }, { divider: "Set 2" }]);
});

test("serializeSetlistFile writes set dividers as '##' headings and round-trips", () => {
  const original = {
    name: "Three sets",
    desc: "",
    songs: [
      { file: "a.abc", key: "" },
      { divider: "" },
      { file: "b.abc", key: "Bb" },
      { divider: "Last set" },
      { file: "c.abc", key: "" },
    ],
  };
  const text = serializeSetlistFile(original);
  assert.match(text, /\n##\n/);
  assert.match(text, /\n## Last set\n/);
  assert.deepEqual(parseSetlistFile(text).songs, original.songs);
});

test("serializeSetlistFile round-trips a multi-line desc and a multi-line note", () => {
  const original = {
    name: "Rehearsal Tuesday",
    desc: "Line one.\n\nLine two after a blank line.",
    songs: [
      { file: BASIN_STREET, key: "Bb", note: "Ben solos.\nWatch the turnaround." },
      { file: "tiger_rag.abc", key: "" },
    ],
  };
  const text = serializeSetlistFile(original);
  const parsed = parseSetlistFile(text);
  assert.equal(parsed.name, original.name);
  assert.equal(parsed.desc, original.desc);
  assert.deepEqual(parsed.songs, original.songs);
});

test("serializeSetlistFile omits an empty name/desc/note the same as before", () => {
  const text = serializeSetlistFile({ name: "", desc: "", songs: [{ file: "a.abc", key: "" }] });
  assert.equal(text, "a.abc,\n");
});

// Files exported before this markdown-flavored format existed must still
// import cleanly — the parser reads the old comment syntax too, it just
// never writes it back out.
test("parseSetlistFile still reads the old '# name,'/'# desc,'/'# break' comment syntax", () => {
  const text = [
    "# name,Zeeland Jazz 2026",
    "# desc,Our main summer set.",
    `${BASIN_STREET},C`,
    "# break",
    "tiger_rag.abc,",
    "# break,Encores",
    "indiana.abc,",
  ].join("\n");

  const setlist = parseSetlistFile(text);
  assert.equal(setlist.name, "Zeeland Jazz 2026");
  assert.equal(setlist.desc, "Our main summer set.");
  assert.deepEqual(setlist.songs, [
    { file: BASIN_STREET, key: "C" },
    { divider: "" },
    { file: "tiger_rag.abc", key: "" },
    { divider: "Encores" },
    { file: "indiana.abc", key: "" },
  ]);
});

test("a re-export of an old-format file switches it over to the new syntax", () => {
  const oldText = ["# name,Old Export", "# desc,Some notes", `${BASIN_STREET},`].join("\n");
  const newText = serializeSetlistFile(parseSetlistFile(oldText));
  assert.match(newText, /^# Old Export\n/);
  assert.equal(newText.includes("# name,"), false);
  assert.equal(newText.includes("# desc,"), false);
});

// Dump an ABC file's real note stream as JSON, using the repo's own abcjs (the
// same parser/flattener the site plays). Used by check_abc.py.
//
//   node abc_notes.mjs song.abc
//
// -> { warnings, tracks: [[{start, dur, pitch, startChar}]], lyricLines: [...] }
// start/dur are in whole notes; pitch is a MIDI number; tied notes come out merged.
// Run from anywhere inside the repo (abcjs resolves from the repo's node_modules).
import { readFileSync } from "node:fs";
import ABCJS from "abcjs";

const text = readFileSync(process.argv[2], "utf8");
const tune = ABCJS.parseOnly(text)[0];

const audio = tune.setUpAudio({});
const tracks = audio.tracks.map((t) =>
  t
    .filter((e) => e.cmd === "note")
    .map((e) => ({ start: e.start, dur: e.duration, pitch: e.pitch, startChar: e.startChar })),
);

const lyricLines = [];
for (const line of tune.lines) {
  if (!line.staff) continue;
  const voice = line.staff[0].voices[0];
  const notes = voice.filter((e) => e.el_type === "note" && !e.rest);
  lyricLines.push({
    notes: notes.length,
    withLyric: notes.filter((e) => e.lyric).length,
    firstChar: notes.length ? notes[0].startChar : null,
  });
}

console.log(JSON.stringify({ warnings: tune.warnings ?? [], tracks, lyricLines }));

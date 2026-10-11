// Shared fixture for the generated bar-for-bar staves (lib/music/solo.js's
// Solo, lib/music/practice.js's Practice): a four-bar tune in F, the parse
// shape they read, and helpers that read their appended staff back.
import { readFileSync } from "node:fs";
import { runInThisContext } from "node:vm";
import { BREAK_CHORD } from "../../static/script/lib/music/chords.js";

export const ABC = [
  "X:1", "T:Test", "M:4/4", "L:1/8", "K:F",
  "\"F\"FGAB c2 c2|\"C7\"cBAG F4|\"F\"A2 c2 f4|\"F\"c8|]", "",
].join("\n");

export const SONG = {
  lines: [{
    staff: [{
      key: { root: "F", acc: "", mode: "", accidentals: [{ acc: "flat", note: "B" }] },
      voices: [[{ el_type: "note", duration: [0.25], pitches: [{ pitch: 3 }] }, { el_type: "note", duration: [0.5], pitches: [{ pitch: 7 }] }]],
    }],
  }],
};

export const chordsOf = (...bars) => bars.map((text) => ({ text }));
export const CHORDS = chordsOf(["F"], ["C7"], ["F", "F7"], [BREAK_CHORD]);

// The appended staff's bars: everything after the "V:2" body line.
export function voiceBars(abc) {
  return abc.split("\nV:2\n")[1].trim().replace(/\|\]$/, "").split("|");
}

// Length of a bar in eighth slots, read back from the ABC (L:1/8).
export function barSlots(bar) {
  let total = 0;
  for (const token of bar.match(/[_^=]?[A-Ga-gz][,']?\d?/g)) {
    const digits = token.replace(/\D/g, "");
    total += digits ? Number(digits) : 1;
  }
  return total;
}

/*
  Run `fn` with the real vendored Tonal bundle (the one the page loads) as
  `globalThis.Tonal`, then restore whatever was there. For checks the stub's
  loose spelling can't make, like a key signature's flats.
*/
let realTonal = null;
export function withRealTonal(fn) {
  const before = globalThis.Tonal;
  if (realTonal === null) {
    const url = new URL("../../static/script/tonal.4.6.9-min.js", import.meta.url);
    // The bundle is a classic script defining a global (no module export),
    // and a checked-in vendored file, not outside input.
    // eslint-disable-next-line sonarjs/code-eval
    runInThisContext(readFileSync(url, "utf8")); // NOSONAR
    realTonal = globalThis.Tonal;
  }
  globalThis.Tonal = realTonal;
  try {
    return fn();
  } finally {
    globalThis.Tonal = before;
  }
}

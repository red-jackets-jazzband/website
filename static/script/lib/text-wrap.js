// Trivial greedy word-wrap for the practice-note SVG bubbles (songs/
// practice-notes.js) — SVG <text> has no native wrapping. Takes a
// `measureWidth` callback rather than assuming any particular font metric,
// so this stays a pure, DOM-agnostic module: the caller measures real glyph
// widths (SVG getComputedTextLength, once the handwriting font has loaded),
// a test passes a trivial character-count stand-in.

/*
  Wrap `text` into lines no wider than `maxWidth` (as reported by
  `measureWidth`), breaking only at whitespace. A single word wider than
  `maxWidth` on its own is still placed on its own line rather than
  hard-broken mid-word — there's no hyphenation here, just word-wrap.
  Blank/whitespace-only input yields [].
*/
export function wrapTextLines(text, maxWidth, measureWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const candidate = `${current} ${word}`;
    if (measureWidth(candidate) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

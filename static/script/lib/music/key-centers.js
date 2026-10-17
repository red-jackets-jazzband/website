/*
  The "Key centres" layer's music: which key the tune is in, stretch by
  stretch, read off its first voice.

    keyCenters(song) -> [{ name, root, minor, tonicized, startNote, endNote, startChar }]
    keyCenterText(stretch) / parseKeyCenterText(text)
                       the stretch's label as the annotation the layer
                       writes ("F minor", behind an invisible marker), and
                       back (null for any other annotation)
    keyCenterShades(stretches)
                       one shade index per stretch: per key, in order of
                       first appearance

  One entry per stretch, in tune order, covering every note of the first
  voice: `startNote`/`endNote` are indices into its notes (rests included,
  as abcjs lists them; `startChar` the first one's source offset), `root` the tonic (0-11), `name` its spelling
  ("B♭", "F♯") and `minor` whether it is a minor key.

  A stretch starts at a key signature (the header's K:, or one mid-tune: a
  part in the parallel or relative minor) and at a ii–V–I that resolves
  somewhere other than the key in force — the way a lead sheet marks a
  tonicized key centre (Am7 D7 Gmaj7 in a tune in A♭ is a stretch of G). A
  tonicization is only a ii–V–I, never a lone V–I: trad jazz is full of
  secondary dominants (a Salty Dog's VI7 II7 V7 I) that don't move the key.
  It then runs on as long as the chords that follow stay in the new key,
  and ends at the first one that doesn't, at the home key's own tonic
  chord, at the next ii–V–I or at a key signature. A bare
  dominant chord or a modal key (Dorian, Mixolydian...) counts as major for
  this: the layer names a tonic, not a mode.
*/
import { chordName, keyRoot, parseChordSymbol } from "./chord-symbol.js";
import { chordPitchClasses } from "./diatonic.js";
import { walkMelody } from "./melody-walk.js";
import { tl } from "../core/i18n.js";

const MINOR_MODES = new Set(["m", "min", "minor", "aeo", "aeolian"]);
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
// Natural minor plus the raised seventh, as diatonic.js's keyScale has it.
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10, 11];
const ACCIDENT_GLYPH = { "#": "♯", b: "♭", sharp: "♯", flat: "♭" };

function mod12(n) {
  return ((n % 12) + 12) % 12;
}

function spell(letter, acc) {
  return letter + (ACCIDENT_GLYPH[acc] || "");
}

function signatureKey(key) {
  const root = keyRoot(key);
  if (root === null) return null;
  return { root, minor: MINOR_MODES.has(String(key.mode || "").toLowerCase()), name: spell(key.root, key.acc) };
}

// A chord symbol's root as written ("Bb7" -> "B\u266D"; "Bb5" is a B power chord).
function rootSpelling(name) {
  const acc = name[1];
  if (acc === "#" || acc === "\u266F") return spell(name[0], "#");
  if ((acc === "b" || acc === "\u266D") && !name.startsWith("b5", 1)) return spell(name[0], "b");
  return name[0];
}

function sameKey(a, b) {
  return a !== null && b !== null && a.root === b.root && a.minor === b.minor;
}

// The first voice as notes (with the key signature in force) and chord changes.
function readTune(song) {
  const notes = [];
  const chords = [];
  walkMelody(song, (el, state) => {
    if (el.el_type !== "note") return;
    const name = chordName(el);
    const symbol = name === null ? null : parseChordSymbol(name);
    if (symbol) chords.push({ note: notes.length, name, ...symbol });
    notes.push({ key: signatureKey(state.key), startChar: el.startChar });
  });
  return { notes, chords };
}

// The key a ii–V–I starting at chords[i] resolves to, or null.
function twoFiveOne(chords, i) {
  const [two, five, one] = [chords[i], chords[i + 1], chords[i + 2]];
  if (!one || (two.quality !== "min" && two.quality !== "hdim") || five.quality !== "dom") return null;
  if (mod12(five.root - two.root) !== 5 || mod12(one.root - five.root) !== 5) return null;
  if (one.quality !== "maj" && one.quality !== "min") return null;
  return { root: one.root, minor: one.quality === "min", name: rootSpelling(one.name) };
}

function fitsKey(chord, key) {
  const tones = chordPitchClasses(chord.name);
  if (tones === null) return true;
  const scale = new Set((key.minor ? MINOR_SCALE : MAJOR_SCALE).map((step) => mod12(key.root + step)));
  return [...tones].every((pc) => scale.has(pc));
}

// The signature key's own tonic chord: the tune is home again.
function isHome(chord, signature) {
  return chord.root === signature.root && chord.quality === (signature.minor ? "min" : "maj");
}

// chords[i] carries a tonicized stretch in `key` on: same signature, in the
// new key, neither back on the home chord nor the start of another ii–V–I.
function staysIn(chords, i, key, here, signature) {
  return sameKey(here, signature) && fitsKey(chords[i], key)
    && !isHome(chords[i], signature) && twoFiveOne(chords, i) === null;
}

/*
  Tonicized stretches as { key, from, to } (chord indices, `to` exclusive):
  from the ii of a ii–V–I that resolves away from the signature's key, on
  over the chords that stay in the new key, up to a key signature change.
*/
function tonicizations(notes, chords) {
  const found = [];
  let i = 0;
  while (i < chords.length - 2) {
    const key = twoFiveOne(chords, i);
    const signature = notes[chords[i].note].key;
    if (key === null || sameKey(key, signature)) {
      i += 1;
      continue;
    }
    let to = i + 3;
    while (to < chords.length && staysIn(chords, to, key, notes[chords[to].note].key, signature)) to += 1;
    found.push({ key, from: i, to });
    i = to;
  }
  return found;
}

// Every note's key: its signature's, unless a tonicization covers it.
function keyPerNote(notes, chords) {
  const keys = notes.map((note) => ({ ...note.key, tonicized: false }));
  tonicizations(notes, chords).forEach(({ key, from, to }) => {
    const end = to < chords.length ? chords[to].note : notes.length;
    for (let n = chords[from].note; n < end; n += 1) {
      if (sameKey(notes[n].key, notes[chords[from].note].key)) keys[n] = { ...key, tonicized: true };
    }
  });
  return keys;
}

export function keyCenters(song) {
  const { notes, chords } = readTune(song);
  const keys = keyPerNote(notes, chords);
  const stretches = [];
  keys.forEach((key, n) => {
    if (key.root === undefined) return;
    const last = stretches[stretches.length - 1];
    if (last && last.endNote === n - 1 && sameKey(last, key) && last.tonicized === key.tonicized) {
      last.endNote = n;
      return;
    }
    stretches.push({
      name: key.name, root: key.root, minor: key.minor, tonicized: key.tonicized,
      startNote: n, endNote: n, startChar: notes[n].startChar,
    });
  });
  return stretches;
}

// U+2060 WORD JOINER: invisible if nothing restyles it, and tells the
// overlay this label from a chart's own annotation.
const MARK = "\u2060";

export function keyCenterLabel(stretch) {
  return stretch.minor
    ? tl("layer_key_centers_minor", "{key} minor", { key: stretch.name })
    : tl("layer_key_centers_major", "{key} major", { key: stretch.name });
}

export function keyCenterText(stretch) {
  return MARK + keyCenterLabel(stretch);
}

export function parseKeyCenterText(text) {
  return text.startsWith(MARK) ? text.slice(MARK.length) : null;
}

export const KEY_SHADES = 5;

export function keyCenterShades(stretches) {
  const keys = [];
  return stretches.map((stretch) => {
    const id = `${stretch.root}${stretch.minor ? "m" : ""}`;
    if (!keys.includes(id)) keys.push(id);
    return keys.indexOf(id) % KEY_SHADES;
  });
}

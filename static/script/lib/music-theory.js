"use strict";

/* global Tonal */

// Pitch class (0-11) of a note name. Prefers Tonal.js (loaded as a global
// classic script alongside this module in the browser) for full enharmonic
// handling, falling back to a small manual table so this still works in
// Node (unit tests) or if Tonal fails to load.
export function noteChroma(noteName) {
  var normalized = noteName.replace(/♭/g, "b").replace(/♯/g, "#");
  if (typeof Tonal !== "undefined" && Tonal.Note) {
    try {
      var n = Tonal.Note.get(normalized);
      // Tonal represents an unparseable note (e.g. "Am" — a chord, not a
      // plain note name — passed in when a setlist key override carries a
      // mode suffix) as chroma: NaN, not undefined. typeof NaN is still
      // "number", so this must be excluded explicitly or it gets returned
      // as-is instead of falling through to the manual table below.
      if (typeof n.chroma === "number" && !Number.isNaN(n.chroma)) return n.chroma;
    } catch (_e) {
      // fall through to the manual table below
    }
  }
  var CHROMAS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var letter = normalized[0].toUpperCase();
  var rest = normalized.slice(1);
  var c = CHROMAS[letter] !== undefined ? CHROMAS[letter] : 0;
  for (var i = 0; i < rest.length; i++) {
    if (rest[i] === "b") c--;
    else if (rest[i] === "#") c++;
  }
  return ((c % 12) + 12) % 12;
}

export function chordToRomanNumeral(chordStr, keyRoot, keyMode) {
  if (!chordStr || chordStr === " % ") return chordStr;

  var match = chordStr.match(/^([A-G][♭♯b#]?)(.*)/);
  if (!match) return chordStr;
  var chordRoot = match[1];
  var suffix = match[2] || "";

  var interval = (noteChroma(chordRoot) - noteChroma(keyRoot) + 12) % 12;
  var isMinorKey = keyMode && keyMode !== "" && keyMode !== "major" && keyMode !== "maj";

  var MAJOR_MAP = {
    0: [0, ""], 1: [1, "♭"], 2: [1, ""], 3: [2, "♭"], 4: [2, ""], 5: [3, ""],
    6: [3, "♯"], 7: [4, ""], 8: [5, "♭"], 9: [5, ""], 10: [6, "♭"], 11: [6, ""],
  };
  var MINOR_MAP = {
    0: [0, ""], 1: [1, "♭"], 2: [1, ""], 3: [2, ""], 4: [2, "♯"], 5: [3, ""],
    6: [4, "♭"], 7: [4, ""], 8: [5, ""], 9: [5, "♯"], 10: [6, ""], 11: [6, "♯"],
  };

  var entry = (isMinorKey ? MINOR_MAP : MAJOR_MAP)[interval] || [0, ""];
  var ROMANS = ["I", "II", "III", "IV", "V", "VI", "VII"];
  var romanBase = ROMANS[entry[0]];
  var accidental = entry[1];

  var isMinorChord = /^(m|min|-)(?!aj)/i.test(suffix);
  var isHalfDim = /^(Ø|ø|m7[b♭]5)/i.test(suffix);
  var isDim = /^(°|dim)/i.test(suffix);
  var isAug = /^(\+|aug)/i.test(suffix);
  var isMaj7 = /maj7|Δ/.test(suffix);
  var numExt = (suffix.match(/\d+/) || [])[0] || "";

  var roman;
  if (isHalfDim) roman = romanBase.toLowerCase() + "ø7";
  else if (isDim) roman = romanBase.toLowerCase() + "°";
  else if (isMinorChord) roman = romanBase.toLowerCase() + numExt;
  else if (isAug) roman = romanBase + "+";
  else if (isMaj7) roman = romanBase + "maj7";
  else roman = romanBase + numExt;

  return accidental + roman;
}

export function convertChordsToRoman(chords, song) {
  if (!chords || !chords.length || !song.lines || !song.lines[0]) return chords;

  // Build a per-line key map so key changes mid-song are handled
  var lineKeys = song.lines.map(function(line) {
    return (line.staff && line.staff[0] && line.staff[0].key) || null;
  });

  // Walk lines again to propagate: each line inherits the last known key
  var resolvedKeys = [];
  var lastKey = lineKeys[0] || { root: "C", acc: "", mode: "" };
  for (var i = 0; i < lineKeys.length; i++) {
    if (lineKeys[i] && lineKeys[i].root) lastKey = lineKeys[i];
    resolvedKeys.push(lastKey);
  }

  // Count measures per line so we can map measure index → key
  var measureKeyMap = [];
  for (var li = 0; li < song.lines.length; li++) {
    var line = song.lines[li];
    if (!line.staff || !line.staff[0] || !line.staff[0].voices) continue;
    var voice = line.staff[0].voices[0] || [];
    var lineKey = resolvedKeys[li];
    var currentKey = lineKey;
    for (var j = 0; j < voice.length; j++) {
      var el = voice[j];
      if (el.el_type === "keySignature" && el.key && el.key.root) currentKey = el.key;
      if (el.el_type === "bar") measureKeyMap.push(currentKey);
    }
  }

  return chords.map(function(measure, idx) {
    var key = measureKeyMap[idx] || resolvedKeys[0] || { root: "C", acc: "", mode: "" };
    var keyRoot = key.root + (key.acc || "");
    var keyMode = key.mode || "";
    var romanText = measure.text.map(function(chordStr) {
      return chordToRomanNumeral(chordStr, keyRoot, keyMode);
    });
    return Object.assign({}, measure, { text: romanText });
  });
}

// Reads the tonic (letter + optional single accidental) off an ABC file's
// K: line, ignoring any mode word that follows (maj/min/m/dor/...) so
// "K:Bbmaj" doesn't get misread as "Bbm". Returns null if there's no K:
// line to read (e.g. malformed input).
export function extractKeyFromAbc(text) {
  var match = text.match(/^K:\s*([A-Ga-g])([#b]?)/m);
  return match ? match[1] + match[2] : null;
}

// Shortest signed semitone distance to transpose `fromKeyStr` to
// `toKeyStr` (range roughly -6..+6, rather than always 0..11) — e.g. going
// from Bb to Ab is -2, not +10. Mode suffixes (m, maj, min, ...) on either
// string are ignored; only the tonic pitch class matters for transposition.
export function semitonesBetweenKeys(fromKeyStr, toKeyStr) {
  if (!fromKeyStr || !toKeyStr) return 0;
  var diff = (noteChroma(toKeyStr) - noteChroma(fromKeyStr) + 12) % 12;
  if (diff > 6) diff -= 12;
  return diff;
}

// True when a setlist key-override column holds a bare signed integer
// (a semitone offset) rather than a target key name.
function isSemitoneOffset(raw) {
  return /^[+-]?\d+$/.test(String(raw == null ? "" : raw).trim());
}

/*
   A setlist song's optional override column resolves to a signed semitone
   transposition. Personal setlists now store that column as a literal
   semitone offset ("2", "-3"); band setlists (and older exports) store a
   target key name ("Bb"), diffed against the tune's own native key. Returns
   0 for a blank/zero override.
*/
export function setlistTransposeSteps(rawOverride, nativeKey) {
  var trimmed = String(rawOverride == null ? "" : rawOverride).trim();
  if (!trimmed) return 0;
  if (isSemitoneOffset(trimmed)) {
    var n = parseInt(trimmed, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return semitonesBetweenKeys(nativeKey || "C", trimmed);
}

// Human-readable badge for a setlist override column: a signed "+2" / "−3"
// for a semitone offset (real minus sign), the key name as-is otherwise,
// and "" for a blank or zero override (nothing to show).
export function formatSetlistKeyLabel(rawOverride) {
  var trimmed = String(rawOverride == null ? "" : rawOverride).trim();
  if (!trimmed) return "";
  if (isSemitoneOffset(trimmed)) {
    var n = parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n === 0) return "";
    return (n > 0 ? "+" : "−") + Math.abs(n);
  }
  return trimmed;
}

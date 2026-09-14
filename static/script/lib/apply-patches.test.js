import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scanBarTokens, stepPitchSemitone, applyPatchesToAbc, resolveFlatToken,
} from "./apply-patches.js";

// ---------------------------------------------------------------------------
// scanBarTokens — real bar fragments pulled from actual songs in this corpus
// ---------------------------------------------------------------------------

test("scanBarTokens: a plain chorded bar with a chord symbol (basin_street.abc)", () => {
  const { tokens, annotations } = scanBarTokens('"Bb" DD E2 =EF-F2 ');
  assert.equal(tokens.length, 6);
  assert.deepEqual(tokens.map((t) => t.rest), [false, false, false, false, false, false]);
  assert.equal(annotations.length, 1);
  assert.equal(annotations[0].noteIndex, 0);
});

test("scanBarTokens: tie flag lands on the tied note, not the one after it", () => {
  const { tokens } = scanBarTokens("=EF-F2");
  assert.equal(tokens.length, 3);
  assert.equal(tokens[0].tie, false); // =E
  assert.equal(tokens[1].tie, true); // F-
  assert.equal(tokens[2].tie, false); // F2
});

test("scanBarTokens: chord brackets with inner accidentals/octave marks count as one token (dippermouth_blues.abc)", () => {
  const { tokens } = scanBarTokens('"Eb7" [EG_d]2 [EG_d]2 [B,FB]3 z2');
  assert.equal(tokens.length, 4);
  assert.deepEqual(tokens.map((t) => t.chord), [true, true, true, false]);
  assert.equal(tokens[3].rest, true);
});

test("scanBarTokens: a fractional pickup bar (basin_street.abc's F/2=E/2_E/2D/2)", () => {
  const { tokens } = scanBarTokens("F/2=E/2_E/2D/2");
  assert.equal(tokens.length, 4);
  assert.equal(tokens.every((t) => !t.chord && !t.rest), true);
});

test("scanBarTokens: skips !decorations!, {grace notes} and inline [K:...] fields without indexing them", () => {
  const { tokens } = scanBarTokens("!f!{ag}[K:C]F2 z2");
  assert.equal(tokens.length, 2);
  assert.equal(tokens[0].pitchStart, "!f!{ag}[K:C]".length);
});

test("scanBarTokens: a trailing chord symbol with no following note is bar-anchored (noteIndex: null)", () => {
  const { tokens, annotations } = scanBarTokens('F2"Bb"');
  assert.equal(tokens.length, 1);
  assert.equal(annotations.length, 1);
  assert.equal(annotations[0].noteIndex, null);
});

// ---------------------------------------------------------------------------
// stepPitchSemitone
// ---------------------------------------------------------------------------

test("stepPitchSemitone: simple up/down nudges", () => {
  assert.equal(stepPitchSemitone("C", 1), "^C");
  assert.equal(stepPitchSemitone("C", -1), "B,");
  assert.equal(stepPitchSemitone("^F", 1), "G");
});

test("stepPitchSemitone: crosses the octave boundary and flips letter case", () => {
  assert.equal(stepPitchSemitone("B", 1), "c"); // up into the next octave
  assert.equal(stepPitchSemitone("c", -1), "B"); // back down
});

test("stepPitchSemitone: returns null for a rest or a chord bracket", () => {
  assert.equal(stepPitchSemitone("z", 1), null);
  assert.equal(stepPitchSemitone("[BF]", 1), null);
});

// ---------------------------------------------------------------------------
// applyPatchesToAbc — full-tune round trips
// ---------------------------------------------------------------------------

const SIMPLE_BAR = '"C" C2 D2 |]';

function tune(bodyLine, lden = 8) {
  return ["X:1", "T:Test Tune", "M:4/4", `L:1/${lden}`, "K:C", bodyLine].join("\n");
}

test("applyPatchesToAbc: no patches, no K: line -> returns the text unchanged", () => {
  const text = tune(SIMPLE_BAR);
  assert.equal(applyPatchesToAbc(text, []), text);
  assert.equal(applyPatchesToAbc("no K line here", [{ note: 0, action: "pitch", value: "C" }]), "no K line here");
});

test("applyPatchesToAbc: pitch patch replaces just the pitch spelling", () => {
  const text = tune(SIMPLE_BAR);
  const patched = applyPatchesToAbc(text, [
    { note: 0, action: "pitch", value: "^C" },
  ]);
  assert.ok(patched.includes('"C" ^C2 D2 |]'), patched);
});

test("applyPatchesToAbc: rest patch replaces the pitch with z, duration untouched", () => {
  const text = tune(SIMPLE_BAR);
  const patched = applyPatchesToAbc(text, [
    { note: 1, action: "rest" },
  ]);
  assert.ok(patched.includes('"C" C2 z2 |]'), patched);
});

test("applyPatchesToAbc: pitch/rest patches skip a chord-bracket token", () => {
  const text = tune("[CE]2 D2 |]");
  const patched = applyPatchesToAbc(text, [
    { note: 0, action: "pitch", value: "^C" },
  ]);
  assert.equal(patched, text);
});

test("applyPatchesToAbc: chord patch replaces an existing chord symbol in place", () => {
  const text = tune(SIMPLE_BAR);
  const patched = applyPatchesToAbc(text, [
    { note: 0, action: "chord", value: "G7" },
  ]);
  assert.ok(patched.includes('"G7" C2 D2 |]'), patched);
});

test("applyPatchesToAbc: chord patch with value: null removes an existing chord symbol", () => {
  const text = tune(SIMPLE_BAR);
  const patched = applyPatchesToAbc(text, [
    { note: 0, action: "chord", value: null },
  ]);
  assert.ok(patched.includes(" C2 D2 |]"), patched);
  assert.ok(!patched.includes('"C"'), patched);
});

test("applyPatchesToAbc: chord patch adds a new symbol before a note with none yet", () => {
  const text = tune(SIMPLE_BAR);
  const patched = applyPatchesToAbc(text, [
    { note: 1, action: "chord", value: "F7" },
  ]);
  assert.ok(patched.includes('"C" C2 "F7" D2 |]'), patched);
});

test("applyPatchesToAbc: insert patch adds a fixed eighth-note before the target note", () => {
  const text = tune(SIMPLE_BAR);
  const patched = applyPatchesToAbc(text, [
    { note: 1, action: "insert", value: "E" },
  ]);
  assert.ok(patched.includes('"C" C2 E D2 |]'), patched);
});

test("applyPatchesToAbc: insert patch with note omitted appends at the end of the tune", () => {
  const text = tune(SIMPLE_BAR);
  const patched = applyPatchesToAbc(text, [
    { action: "insert", value: "E" },
  ]);
  assert.ok(patched.includes('"C" C2 D2 E |]'), patched);
});

test("applyPatchesToAbc: an inserted note's duration scales to the tune's own L: unit", () => {
  const text = tune('"C" C D |]', 4); // L:1/4 — a bare note is a quarter note
  const patched = applyPatchesToAbc(text, [
    { note: 1, action: "insert", value: "E" },
  ]);
  // formatDuration(1 eighth-slot, L:1/4) is an explicit half-unit "/2"
  assert.ok(patched.includes('"C" C E/2 D |]'), patched);
});

test("applyPatchesToAbc: several patches across different bars all apply, addressed by flat position", () => {
  const text = tune('"C" C2 D2 | "F" E2 F2 |]');
  // Flat order: C(0) D(1) | E(2) F(3)
  const patched = applyPatchesToAbc(text, [
    { note: 0, action: "pitch", value: stepPitchSemitone("C", 1) },
    { note: 3, action: "rest" },
  ]);
  assert.ok(patched.includes('"C" ^C2 D2'), patched);
  assert.ok(patched.includes('"F" E2 z2'), patched);
});

test("applyPatchesToAbc: patches targeting an out-of-range flat index are silently skipped", () => {
  const text = tune(SIMPLE_BAR);
  const patched = applyPatchesToAbc(text, [
    { note: 99, action: "pitch", value: "^C" },
  ]);
  assert.equal(patched, text);
});

test("applyPatchesToAbc: an interleaved multi-voice body is left unpatched", () => {
  const text = [
    "X:1", "T:Multi", "M:4/4", "L:1/8", "K:C",
    "V:1", "C2 D2 |]",
    "V:2", "E2 F2 |]",
  ].join("\n");
  const patched = applyPatchesToAbc(text, [
    { note: 0, action: "pitch", value: "^C" },
  ]);
  assert.equal(patched, text);
});

// ---------------------------------------------------------------------------
// resolveFlatToken
// ---------------------------------------------------------------------------

test("resolveFlatToken returns the owning bar's raw, unpatched text and the token at that flat position", () => {
  const text = tune('"C" C2 D2 | "F" E2 F2 |]');
  // Flat order: C(0) D(1) | E(2) F(3)
  const first = resolveFlatToken(text, 0);
  assert.equal(first.barText, '"C" C2 D2 ');
  assert.equal(first.barText.slice(first.token.pitchStart, first.token.pitchEnd), "C");

  const third = resolveFlatToken(text, 2);
  assert.equal(third.barText, ' "F" E2 F2 ');
  assert.equal(third.barText.slice(third.token.pitchStart, third.token.pitchEnd), "E");
});

test("resolveFlatToken returns null past the tune's last note, or with no K: line", () => {
  const text = tune(SIMPLE_BAR);
  assert.equal(resolveFlatToken(text, 99), null);
  assert.equal(resolveFlatToken("no K line here", 0), null);
});

test("resolveFlatToken returns null for an interleaved multi-voice body, same scope limit as applyPatchesToAbc", () => {
  const text = [
    "X:1", "T:Multi", "M:4/4", "L:1/8", "K:C",
    "V:1", "C2 D2 |]",
    "V:2", "E2 F2 |]",
  ].join("\n");
  assert.equal(resolveFlatToken(text, 0), null);
});

// ---------------------------------------------------------------------------
// Interleaved w:/P:/... lines (gloryland.abc, glory_halleluja.abc): a real
// bar's text can carry a whole lyric/directive line inside it (the tune
// keeps writing bars on the next music line, after the w: line ends), and a
// w: line can carry its own "|" characters to align syllables with
// barlines. Both trip up a naive scan of the whole body the same way a
// stray F: URL link once did in lib/comping.js's own ALWAYS_STRIP — see
// that file's doc comment. Neither corrupts the *flat* position of any real
// note, which is exactly why patches/notes are addressed by that instead of
// abcjs's own {measure, note} pair — see apply-patches.js's own doc comment.
// ---------------------------------------------------------------------------

test("scanBarTokens (via resolveFlatToken): a w: line between two melody lines doesn't feed lyric letters in as fake notes", () => {
  // gloryland.abc's own shape: "...z2 |" ends a bar, a w: line follows, then
  // "EFAB |" starts the next bar on the next melody line.
  const text = tune(
    '"Ab" E2 z2 |\nw:If you get there some-day be-fore I do.\n"Ab" EFAB | c2 A2 |]',
  );
  // Flat order: E(0) z(1) | E(2) F(3) A(4) B(5) | c(6) A(7)
  const resolved = resolveFlatToken(text, 2);
  assert.equal(resolved.barText.slice(resolved.token.pitchStart, resolved.token.pitchEnd), "E");
  assert.equal(resolveFlatToken(text, 5).token.rest, false);
  assert.equal(resolveFlatToken(text, 8), null); // only 8 real notes total (0-7)
});

test("resolveFlatToken: a w: line's own alignment pipes don't shift later notes' flat position", () => {
  // gloryland.abc's own shape: the w: line here carries two "|" characters
  // of its own, aligning syllables to the three bars above it. If those
  // were mistaken for real barlines, the "EFAB" bar's own notes would land
  // at the wrong flat position (or inside the lyric text entirely).
  const text = tune(
    '"Ab" A2 A2 | AA2 F | "Db" A2 F2 |\nw: tell my | Sa-vior That  | comin.\n"Ab" EFAB |]',
  );
  // Flat order: A(0) A(1) | A(2) A(3) F(4) | A(5) F(6) | E(7) F(8) A(9) B(10)
  const e = resolveFlatToken(text, 7);
  assert.equal(e.barText.slice(e.token.pitchStart, e.token.pitchEnd), "E");
  assert.equal(resolveFlatToken(text, 11), null); // 11 real notes total (0-10), no phantom extras
});

test("resolveFlatToken: a tune with no pickup, opening straight on a barline, doesn't get a phantom empty first bar", () => {
  // glory_halleluja.abc's own shape: the body starts with "|:" and no
  // pickup notes before it.
  const text = tune('|: "Bb"F6 E2 | D2 F2 B2 c2 |]');
  const first = resolveFlatToken(text, 0);
  assert.equal(first.barText, ' "Bb"F6 E2 ');
  assert.equal(first.barText.slice(first.token.pitchStart, first.token.pitchEnd), "F");

  const third = resolveFlatToken(text, 2);
  assert.equal(third.barText, " D2 F2 B2 c2 ");
  assert.equal(third.barText.slice(third.token.pitchStart, third.token.pitchEnd), "D");
});

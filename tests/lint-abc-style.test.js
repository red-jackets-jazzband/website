import assert from "node:assert/strict";
import test from "node:test";
import ABCJS from "abcjs";
import { findStyleFindings, findStyleIssues } from "../scripts/lint-abc-style.js";

const HEADER = "X:1\nT:Test\nM:4/4\nL:1/4\n";

function findings(body, key = "K:C") {
  const [tune] = ABCJS.parseOnly(`${HEADER}${key}\n${body}\n`);
  return findStyleFindings(tune).map((f) => f.type);
}

test("a clean tune has no findings", () => {
  assert.deepEqual(findings('"C"CDEF | G4 | "G7"GABc ||\nP:B\n"C"c4 |'), []);
});

test("a melody-only tune is not checked", () => {
  assert.deepEqual(findings("CDEF | G4 ||\nP:B\nc4 |"), []);
});

test("a part change after a plain bar line is flagged, after a double bar it is not", () => {
  assert.deepEqual(findings('P:A\n"C"CDEF |\nP:B\n"C"c4 |'), ["plain-bar-before-part"]);
  assert.deepEqual(findings('P:A\n"C"CDEF ||\nP:B\n"C"c4 |'), []);
  assert.deepEqual(findings('P:A\n"C"CDEF |]\nP:B\n"C"c4 |'), []);
  assert.deepEqual(findings('P:A\n"C"CDEF :|\nP:B\n"C"c4 |'), []);
});

test("the first bar of a part needs a chord even when it repeats the previous one", () => {
  assert.deepEqual(findings('P:A\n"C"CDEF ||\nP:B\nc4 |'), ["missing-chord"]);
});

test("the first bar of a line of music needs a chord", () => {
  assert.deepEqual(findings('"C"CDEF | G4 |\nc4 | G4 |'), ["missing-chord"]);
});

test("the missing-chord finding carries the chord to restate", () => {
  const [tune] = ABCJS.parseOnly(`${HEADER}K:C\n"Am7"CDEF |\nc4 |\n`);
  const [finding] = findStyleFindings(tune);
  assert.equal(finding.inEffect.name, "Am7");
});

test("nothing is required before the tune's first chord", () => {
  assert.deepEqual(findings('P:Intro\nCDEF |\nGABc ||\nP:A\n"C"c4 |'), []);
});

test("a pickup may hand the first chord to the next bar", () => {
  assert.deepEqual(findings('G ||\n"C"c4 | "F"c4 |'), []);
});

test("a chord identical to the one already in effect is flagged", () => {
  assert.deepEqual(findings('"C"CDEF | "C"G4 | "F"c4 |'), ["repeated-chord"]);
  assert.deepEqual(findings('"C"CD"C"EF | G4 |'), ["repeated-chord"]);
});

test("a changed chord, or a restated one at a line or part start, is not flagged", () => {
  assert.deepEqual(findings('"C"CDEF | "F"G4 |\n"F"c4 | G4 ||\nP:B\n"F"c4 |'), []);
});

test("a chord restated right after a repeat sign or an ending is not flagged", () => {
  assert.deepEqual(findings('|:"C"CDEF | G4 :|"C"c4 |'), []);
  assert.deepEqual(findings('|:"C"CDEF |1 G4 :|2 "C"c4 |]'), []);
});

test("annotations and chords on spacer rests are not chords in effect", () => {
  assert.deepEqual(findings('"C"CDEF | "^Break"G4 |'), []);
  assert.deepEqual(findings('"C"C4- "F"y3 |\n"F"c4 |'), []);
});

test("a full first bar that starts with rests and ends on a double bar is a pickup written with rests", () => {
  assert.deepEqual(findings('z2 GA ||\n"C"c4 |'), ["pickup-rests"]);
  assert.deepEqual(findings('z2 GA |:\n"C"c4 |'), ["pickup-rests"]);
});

test("a real short pickup, an all-rest bar, or a plain first bar is fine", () => {
  assert.deepEqual(findings('GA ||\n"C"c4 |'), []);
  assert.deepEqual(findings('z4 ||\n"C"c4 |'), []);
  assert.deepEqual(findings('"C"z2 GA |\n"C"c4 |'), []);
});

test("a chordless full first bar that starts with rests and closes on a plain bar is also a pickup", () => {
  assert.deepEqual(findings('z2 GA |\n"C"c4 |'), ["pickup-rests"]);
});

test("messages carry the location and the rule", () => {
  const [tune] = ABCJS.parseOnly(`${HEADER}K:C\n"C"CDEF | "C"G4 |\n`);
  const issues = findStyleIssues(tune, (index) => `i${index}`);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /^Music Line:i\d+: Chord "C" repeats the chord already in effect/);
});

import assert from "node:assert/strict";
import test from "node:test";
import ABCJS from "abcjs";
import { findStyleFindings, findStyleIssues } from "../scripts/lint-abc-style.js";

const HEADER = "X:1\nT:Test\nM:4/4\nL:1/4\n";
const REPEATED = "repeated-chord";
const DOWNBEAT = "missing-downbeat-chord";

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
  assert.deepEqual(findings('"C"CDEF | "C"G4 | "F"c4 |'), [REPEATED]);
  assert.deepEqual(findings('"C"CD"C"EF | G4 |'), [REPEATED]);
});

test("a split bar may restate the chord held on its downbeat", () => {
  const held = '"C"CDEF | ';
  assert.deepEqual(findings(`${held}"C"G2 "F"G2 | c4 |`), []);
  // ...but only on the downbeat, and only when the bar really changes chord.
  assert.deepEqual(findings(`${held}G"C"G "F"G2 | c4 |`), [DOWNBEAT, REPEATED]);
  assert.deepEqual(findings(`${held}"C"G4 | c4 |`), [REPEATED]);
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

test("a pickup is closed by a double bar, not a plain one", () => {
  assert.deepEqual(findings('GA |"C"c4 | G4 |'), ["pickup-plain-bar"]);
  assert.deepEqual(findings('GA ||"C"c4 | G4 |'), []);
  assert.deepEqual(findings('GA |:"C"c4 | G4 :|'), []);
  // A pickup that opens a repeat is played again on every pass.
  assert.deepEqual(findings('|: GA |"C"c4 | G4 :|'), []);
  // A full first bar is no pickup.
  assert.deepEqual(findings('"C"GABc | G4 |'), []);
});

test("the pickup finding points at the bar line to double", () => {
  const text = `${HEADER}K:C\nGA |"C"c4 |\n`;
  const [finding] = findStyleFindings(ABCJS.parseOnly(text)[0]);
  assert.equal(text[finding.at], "|");
  assert.equal(text.slice(finding.at - 3, finding.at), "GA ");
});

test("a bar that changes chord partway through restates the held chord on its downbeat", () => {
  assert.deepEqual(findings('"C"CDEF | G2 "F"G2 | c4 |'), [DOWNBEAT]);
  assert.deepEqual(findings('"C"CDEF | z2 "F"G2 | c4 |'), [DOWNBEAT]);
  assert.deepEqual(findings('"C"CDEF- | F2 "F"G2 | c4 |'), [DOWNBEAT]);
  assert.deepEqual(findings('"C"CDEF | "C"G2 "F"G2 | c4 |'), []);
});

test("the missing-downbeat-chord finding carries the chord to restate", () => {
  const [tune] = ABCJS.parseOnly(`${HEADER}K:C\n"Am7"CD"D7"EF | G2 "G7"G2 |\n`);
  const [finding] = findStyleFindings(tune);
  assert.equal(finding.type, DOWNBEAT);
  assert.equal(finding.inEffect.name, "D7");
});

test("a mid-bar chord with nothing in effect before it needs no downbeat chord", () => {
  assert.deepEqual(findings('z2 "C"G2 | c4 |'), []);
  assert.deepEqual(findings('GA ||z2 "C"G2 | c4 |'), []);
});

test("messages carry the location and the rule", () => {
  const [tune] = ABCJS.parseOnly(`${HEADER}K:C\n"C"CDEF | "C"G4 |\n`);
  const issues = findStyleIssues(tune, (index) => `i${index}`);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /^Music Line:i\d+: Chord "C" repeats the chord already in effect/);
});

function bars(chord, n) {
  return Array.from({ length: n }, (_, i) => (i === 0 ? `"${chord}"C4` : "C4")).join(" | ");
}

test("a chord may be restated where a long scheme's 8-column chord table starts a row", () => {
  const restated = `${bars("C", 8)} | "C"C4 | ${bars("F", 15)} |`;
  assert.deepEqual(findings(restated), []);
  assert.deepEqual(findings(`${bars("C", 8)} | C4 | "C"C4 | ${bars("F", 14)} |`), [REPEATED]);
});

test("augmented and diminished chords are spelled out, not written with + or °", () => {
  assert.deepEqual(findings('"G+"G4 | "Cm"c4 |'), ["chord-symbol-spelling"]);
  assert.deepEqual(findings('"F+7"F4 | "Bb"B4 |'), ["chord-symbol-spelling"]);
  assert.deepEqual(findings('"B°"B4 | "C"c4 |'), ["chord-symbol-spelling"]);
  assert.deepEqual(findings('"Gaug"G4 | "Faug7"F4 | "Bdim"B4 | "C7#5"c4 |'), []);
});

function issues(body) {
  const [tune] = ABCJS.parseOnly(`${HEADER}K:C\n${body}\n`);
  return findStyleIssues(tune, () => "1:1");
}

test("a + after an extension is spelled #5, not aug", () => {
  assert.match(issues('"C7+5"c4 | "F"F4 |')[0], /write "#5" instead/);
  assert.match(issues('"C9+"c4 | "F"F4 |')[0], /write "#5" instead/);
  assert.match(issues('"F+7"F4 | "Bb"B4 |')[0], /write "aug" instead/);
});

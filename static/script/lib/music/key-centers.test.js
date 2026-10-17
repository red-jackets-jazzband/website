import { test } from "node:test";
import assert from "node:assert/strict";
import ABCJS from "abcjs";
import { keyCenterShades, keyCenterText, keyCenters, parseKeyCenterText } from "./key-centers.js";

const parse = (body, key = "C") => ABCJS.parseOnly(`X:1\nM:4/4\nL:1/4\nK:${key}\n${body}\n`)[0];
const summary = (song) => keyCenters(song).map((s) => `${s.name}${s.minor ? "m" : ""}${s.tonicized ? "*" : ""} ${s.startNote}-${s.endNote}`);

test("one key signature is one stretch over every note", () => {
  assert.deepEqual(summary(parse('"C" C D E F | "G7" G A B c |')), ["C 0-7"]);
});

test("a part in the parallel minor is its own stretch, named from the signature", () => {
  assert.deepEqual(summary(parse('"Fm" F G A B |\nK:F\n"F" F G A B |', "Fm")), ["Fm 0-3", "F 4-7"]);
  assert.deepEqual(summary(parse('"Bb" B4 |', "Bb")), ["B♭ 0-0"]);
});

test("a ii–V–I away from the key is a tonicized stretch, running on while the chords fit", () => {
  const song = parse('"C" C4 | "Am7" A2 "D7" D2 | "G" G4 | "Em" E4 | "Ab7" A4 | "C" C4 |');
  assert.deepEqual(summary(song), ["C 0-0", "G* 1-4", "C 5-6"]);
});

test("ii–V–i in minor names a minor key; one into the home key is not a new stretch", () => {
  assert.deepEqual(summary(parse('"C" C4 | "Bm7b5" B2 "E7" E2 | "Am" A4 | "F" F4 | "C" C4 |')), ["C 0-0", "Am* 1-4", "C 5-5"]);
  assert.deepEqual(summary(parse('"Dm7" D2 "G7" G2 | "C" C4 |')), ["C 0-2"]);
});

test("a lone secondary dominant doesn't move the key", () => {
  assert.deepEqual(summary(parse('"C" C4 | "A7" A4 | "D7" D4 | "G7" G4 | "C" C4 |')), ["C 0-4"]);
});

test("a tonicization stops at a key signature", () => {
  assert.deepEqual(summary(parse('"Am7" A2 "D7" D2 | "G" G4 |\nK:F\n"G" G4 |')), ["G* 0-2", "F 3-3"]);
});

test("the label carries an invisible marker the overlay finds again", () => {
  const [stretch] = keyCenters(parse("C |", "Fm"));
  const text = keyCenterText(stretch);
  assert.equal(parseKeyCenterText(text), "F minor");
  assert.equal(parseKeyCenterText("F minor"), null);
});

test("shades go per key, in order of first appearance", () => {
  const stretches = [{ root: 5, minor: true }, { root: 5, minor: false }, { root: 5, minor: true }];
  assert.deepEqual(keyCenterShades(stretches), [0, 1, 0]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import ABCJS from "abcjs";
import { barRhythms, describeBar, fingerprintArcs, meterPulse, ringLevel } from "./pulse.js";

function bars(body, { meter = "C", length = "1/8", key = "F" } = {}) {
  return barRhythms(ABCJS.parseOnly(`X:1\nM:${meter}\nL:${length}\nK:${key}\n${body}\n`)[0]);
}

test("meterPulse counts quarters in simple meters and dotted quarters in compound ones", () => {
  assert.deepEqual(meterPulse({ type: "common_time" }), { barLength: 1, beats: 4, beatLength: 0.25 });
  assert.deepEqual(meterPulse({ type: "cut_time" }), { barLength: 1, beats: 4, beatLength: 0.25 });
  assert.deepEqual(meterPulse({ type: "specified", value: [{ num: "3", den: "4" }] }), { barLength: 0.75, beats: 3, beatLength: 0.25 });
  assert.deepEqual(meterPulse({ type: "specified", value: [{ num: "2", den: "2" }] }), { barLength: 1, beats: 4, beatLength: 0.25 });
  assert.deepEqual(meterPulse({ type: "specified", value: [{ num: "6", den: "8" }] }), { barLength: 0.75, beats: 2, beatLength: 0.375 });
  assert.equal(meterPulse({ type: "specified", value: [{ num: "2+3", den: "8" }] }), null);
  assert.equal(meterPulse(undefined), null);
});

test("ringLevel puts long notes inside and short ones outside", () => {
  assert.equal(ringLevel(1 / 2, 1 / 4), 0);
  assert.equal(ringLevel(3 / 8, 1 / 4), 1);
  assert.equal(ringLevel(1 / 4, 1 / 4), 1);
  assert.equal(ringLevel(1 / 8, 1 / 4), 2);
  assert.equal(ringLevel(1 / 12, 1 / 4), 2); // a triplet eighth
  assert.equal(ringLevel(1 / 16, 1 / 4), 3);
});

test("quarters on every beat land on the backbeat", () => {
  const [bar] = bars("F2 A2 c2 A2 |");
  assert.equal(bar.kind, "backbeat");
  assert.deepEqual(bar.onBeats, [1, 2, 3, 4]);
  assert.deepEqual(bar.backbeats, [2, 4]);
  assert.equal(bar.number, 1);
});

test("a note on the 'and' held over the beat is syncopated, also when tied", () => {
  assert.equal(bars("F A3 c4 |")[0].kind, "syncopated");
  assert.equal(bars("F A- A2 c4 |")[0].kind, "syncopated");
});

test("an anticipation tied over the bar line is syncopated", () => {
  const [first, second] = bars("F2 A2 c3 f- | f8 |");
  assert.equal(first.kind, "syncopated");
  assert.equal(second.kind, "steady");
  assert.deepEqual(second.onBeats, []);
  assert.equal(second.events[0].tied, true);
});

test("a bar of long notes is steady, a bar of rests is a rest", () => {
  assert.equal(bars("F4 A4 |")[0].kind, "steady");
  assert.equal(bars("z8 |")[0].kind, "rest");
});

test("a pickup is bar 0 and right-aligned on the clock", () => {
  const [pickup, first] = bars("FG | A2 c2 A2 c2 |");
  assert.equal(pickup.number, 0);
  assert.equal(first.number, 1);
  assert.equal(pickup.events[0].start, 0.75);
  assert.deepEqual(pickup.onBeats, [4]);
});

test("identical rhythms point back to the first bar that had them, whatever the pitches", () => {
  const list = bars("F2 A2 c2 A2 | G2 B2 d2 B2 | F4 A4 |");
  assert.equal(list[0].sameAs, null);
  assert.equal(list[1].sameAs, 0);
  assert.equal(list[2].sameAs, null);
});

test("transposing doesn't change a fingerprint", () => {
  const body = "F A3 c2 (3fga | z2 c6 |";
  const plain = barRhythms(ABCJS.parseOnly(`X:1\nM:C\nL:1/8\nK:F\n${body}\n`)[0]);
  const moved = barRhythms(ABCJS.parseOnly(`X:1\nM:C\nL:1/8\nK:F\n${body}\n`, { visualTranspose: 5 })[0]);
  assert.deepEqual(plain.map(fingerprintArcs), moved.map(fingerprintArcs));
});

test("triplets are timed by their multiplier", () => {
  const [bar] = bars("(3FAc f2 c4 |");
  const arcs = fingerprintArcs(bar);
  assert.equal(arcs.length, 5);
  assert.ok(Math.abs(arcs[2].to - 0.25) < 1e-9);
  assert.equal(arcs[0].ring, 2);
  assert.equal(arcs[4].ring, 0);
});

test("fingerprintArcs marks notes starting on 2 and 4, rests and tied continuations", () => {
  const [bar] = bars("z2 A2 c2- c B |");
  const arcs = fingerprintArcs(bar);
  assert.deepEqual(arcs.map((a) => a.type), ["rest", "note", "note", "tie", "note"]);
  assert.deepEqual(arcs.map((a) => a.backbeat), [false, true, false, false, false]);
  assert.deepEqual(arcs.map((a) => a.from), [0, 0.25, 0.5, 0.75, 0.875]);
});

test("a voice overlay doesn't add time to the bar", () => {
  const [bar] = bars("F2 A2 c2 A2 & C8 |");
  assert.equal(bar.events.length, 4);
  assert.equal(bar.kind, "backbeat");
});

test("waltz time stresses beat 2 only", () => {
  const [bar] = bars("F2 A2 c2 |", { meter: "3/4" });
  assert.deepEqual(bar.backbeats, [2]);
  assert.equal(bar.kind, "backbeat");
});

test("describeBar names the beats, the kind and a repeated rhythm", () => {
  const list = bars("F2 A2 c2 A2 | G2 B2 d2 B2 | F A3 c4 |");
  assert.equal(describeBar(list[0], list), "Bar 1: notes on beat 1, 2, 3 and 4. Lands on the 2 & 4 backbeat.");
  assert.match(describeBar(list[1], list), /Same rhythm as bar 1\.$/);
  assert.match(describeBar(list[2], list), /^Bar 3: notes on beat 1 and 3\. Syncopated/);
});

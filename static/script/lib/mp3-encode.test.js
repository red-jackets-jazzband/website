import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeMp3, repeatAudioBuffer } from "./mp3-encode.js";
import { createLamejsStub, withLamejs } from "../../../tests/helpers/stubs.js";

function fakeAudioBuffer({ sampleRate = 44100, channels }) {
  return {
    numberOfChannels: channels.length,
    sampleRate,
    length: channels[0].length,
    getChannelData: (c) => Float32Array.from(channels[c]),
  };
}

test("encodeMp3 always builds a fixed 44.1kHz/192kbps stereo encoder", () => {
  const stub = createLamejsStub();
  const buffer = fakeAudioBuffer({ channels: [[0, 1, -1, 2, -2]] });
  withLamejs(stub, () => encodeMp3(buffer));

  assert.deepEqual(stub.calls.constructed, [{ channels: 2, sampleRate: 44100, kbps: 192 }]);
});

test("encodeMp3 duplicates a mono source across both channels and converts float samples to clamped 16-bit PCM", () => {
  const stub = createLamejsStub();
  const buffer = fakeAudioBuffer({ channels: [[0, 1, -1, 2, -2]] });
  withLamejs(stub, () => encodeMp3(buffer));

  assert.equal(stub.calls.encodeBuffer.length, 1);
  const expected = [0, 0x7fff, -0x8000, 0x7fff, -0x8000];
  assert.deepEqual(Array.from(stub.calls.encodeBuffer[0].left), expected);
  assert.deepEqual(Array.from(stub.calls.encodeBuffer[0].right), expected);
});

test("encodeMp3 keeps a stereo source's two channels distinct", () => {
  const stub = createLamejsStub();
  const buffer = fakeAudioBuffer({ channels: [[1, -1], [-1, 1]] });
  withLamejs(stub, () => encodeMp3(buffer));

  assert.deepEqual(Array.from(stub.calls.encodeBuffer[0].left), [0x7fff, -0x8000]);
  assert.deepEqual(Array.from(stub.calls.encodeBuffer[0].right), [-0x8000, 0x7fff]);
});

test("encodeMp3 resamples a source rendered at a different sample rate up to 44.1kHz", () => {
  const stub = createLamejsStub();
  // Exactly half of TARGET_SAMPLE_RATE, so the linearly-interpolated result
  // is easy to hand-verify: [0, 1] at 22050Hz -> [0, 0.5, 1, 1] at 44100Hz.
  const buffer = fakeAudioBuffer({ sampleRate: 22050, channels: [[0, 1]] });
  withLamejs(stub, () => encodeMp3(buffer));

  assert.deepEqual(Array.from(stub.calls.encodeBuffer[0].left), [0, 16383, 0x7fff, 0x7fff]);
});

test("encodeMp3 chunks a long buffer into multiple encodeBuffer calls and concatenates the output with the flush tail", () => {
  const stub = createLamejsStub();
  const buffer = fakeAudioBuffer({ channels: [new Array(1152 + 10).fill(0)] });
  const result = withLamejs(stub, () => encodeMp3(buffer));

  assert.equal(stub.calls.encodeBuffer.length, 2);
  assert.equal(stub.calls.encodeBuffer[0].left.length, 1152);
  assert.equal(stub.calls.encodeBuffer[1].left.length, 10);
  // The stub hands back one byte per encodeBuffer call ([1], [2]) plus the
  // flush's own [0xff] tail — encodeMp3 must keep that order when concatenating.
  assert.deepEqual(Array.from(new Uint8Array(result)), [1, 2, 0xff]);
});

test("encodeMp3 skips a call whose encoder output was empty", () => {
  const stub = createLamejsStub();
  stub.Mp3Encoder = function Mp3Encoder(channels, sampleRate, kbps) {
    stub.calls.constructed.push({ channels, sampleRate, kbps });
    this.encodeBuffer = () => Int8Array.from([]);
    this.flush = () => Int8Array.from([7]);
  };
  const buffer = fakeAudioBuffer({ channels: [[0, 0]] });
  const result = withLamejs(stub, () => encodeMp3(buffer));

  assert.deepEqual(Array.from(new Uint8Array(result)), [7]);
});

test("repeatAudioBuffer returns the buffer unchanged for 1 (or fewer) playthroughs", () => {
  const buffer = fakeAudioBuffer({ channels: [[1, 2, 3]] });
  assert.equal(repeatAudioBuffer(buffer, 1), buffer);
  assert.equal(repeatAudioBuffer(buffer, 0), buffer);
  assert.equal(repeatAudioBuffer(buffer, undefined), buffer);
});

test("repeatAudioBuffer concatenates full playthroughs when restartFraction is 0 (no pickup)", () => {
  const buffer = fakeAudioBuffer({ channels: [[1, 2, 3], [4, 5, 6]] });
  const result = repeatAudioBuffer(buffer, 3, 0);

  assert.equal(result.numberOfChannels, 2);
  assert.equal(result.sampleRate, 44100);
  assert.equal(result.length, 9); // 3 full playthroughs of a 3-sample buffer
  assert.deepEqual(Array.from(result.getChannelData(0)), [1, 2, 3, 1, 2, 3, 1, 2, 3]);
  assert.deepEqual(Array.from(result.getChannelData(1)), [4, 5, 6, 4, 5, 6, 4, 5, 6]);
});

test("repeatAudioBuffer plays the first pass in full but skips the pickup on every later pass", () => {
  // A 10-sample buffer with a 2-sample pickup -> restartFraction 0.2.
  const buffer = fakeAudioBuffer({ channels: [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]] });
  const result = repeatAudioBuffer(buffer, 3, 0.2);

  // playthrough 1 (all 10) + 2x the post-pickup tail (samples 2..9, 8 each)
  assert.equal(result.length, 10 + 8 + 8);
  assert.deepEqual(Array.from(result.getChannelData(0)), [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, // full first playthrough, pickup included
    2, 3, 4, 5, 6, 7, 8, 9, // 2nd playthrough, pickup skipped
    2, 3, 4, 5, 6, 7, 8, 9, // 3rd playthrough, pickup skipped
  ]);
});

test("repeatAudioBuffer clamps an out-of-range restartFraction instead of producing garbage", () => {
  const buffer = fakeAudioBuffer({ channels: [[1, 2, 3, 4]] });
  assert.deepEqual(
    Array.from(repeatAudioBuffer(buffer, 2, -1).getChannelData(0)),
    [1, 2, 3, 4, 1, 2, 3, 4], // negative fraction clamps to 0 (no skip)
  );
  assert.deepEqual(
    Array.from(repeatAudioBuffer(buffer, 2, 1.5).getChannelData(0)),
    [1, 2, 3, 4], // fraction > 1 clamps to 1 (repeat pass contributes nothing)
  );
});

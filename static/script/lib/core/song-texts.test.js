import { test } from "node:test";
import assert from "node:assert/strict";
import { createSongTexts } from "./song-texts.js";

// A reader that records each request and lets the test answer it.
function fakeReader() {
  const requests = [];
  const read = (path, onLoad, onError) => requests.push({ path, onLoad, onError });
  return { read, requests };
}

const PANAMA = "panama.abc";
const tick = () => new Promise((resolve) => { setTimeout(resolve, 0); });

test("everyone asking for a file while it's in flight shares one request", () => {
  const { read, requests } = fakeReader();
  const songs = createSongTexts(read);
  const got = [];
  songs.get(PANAMA, (text) => got.push(`keys:${text}`));
  songs.get(PANAMA, (text) => got.push(`print:${text}`));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, "/songs/panama.abc");
  requests[0].onLoad("X:1");
  assert.deepEqual(got, ["keys:X:1", "print:X:1"]);
});

test("a file already read is answered without a request, asynchronously", async () => {
  const { read, requests } = fakeReader();
  const songs = createSongTexts(read);
  songs.get(PANAMA, () => {});
  requests[0].onLoad("X:1");
  let got = null;
  songs.get(PANAMA, (text) => { got = text; });
  assert.equal(got, null, "not synchronously");
  await tick();
  assert.equal(got, "X:1");
  assert.equal(requests.length, 1);
});

test("a failed read reaches every waiter and isn't kept", () => {
  const { read, requests } = fakeReader();
  const songs = createSongTexts(read);
  const failed = [];
  songs.get("gone.abc", () => {}, (status) => failed.push(status));
  songs.get("gone.abc", () => {}, (status) => failed.push(status));
  songs.get("gone.abc", () => {}); // no error handler: fine
  requests[0].onError(404);
  assert.deepEqual(failed, [404, 404]);
  songs.get("gone.abc", () => {});
  assert.equal(requests.length, 2, "the next ask tries again");
});

test("clear() forgets every text, so the next ask fetches again", () => {
  const { read, requests } = fakeReader();
  const songs = createSongTexts(read);
  songs.get(PANAMA, () => {});
  requests[0].onLoad("X:1");
  songs.clear();
  songs.get(PANAMA, () => {});
  assert.equal(requests.length, 2);
});

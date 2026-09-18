import { test } from "node:test";
import assert from "node:assert/strict";
import { lookupYoutubeArtists, getCachedYoutubeArtist } from "./youtube-artist-lookup.js";

function idsFromUrl(url) {
  return new URL(url).searchParams.get("id").split(",");
}

function throwingFetch() {
  throw new Error("should not be called");
}

function fakeFetch(itemsById, { fails = false, notOk = false } = {}) {
  const calls = [];
  const impl = (url) => {
    calls.push(url);
    if (fails) return Promise.reject(new Error("network down"));
    if (notOk) return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
    const ids = idsFromUrl(url);
    const items = ids.filter((id) => itemsById[id]).map((id) => ({
      id, snippet: { channelTitle: itemsById[id] },
    }));
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ items }) });
  };
  impl.calls = calls;
  return impl;
}

test("lookupYoutubeArtists caches each id's channelTitle from a successful response", async () => {
  const fetchImpl = fakeFetch({ "id-t1-a": "Louis Armstrong - Topic", "id-t1-b": "Some Channel" });
  await lookupYoutubeArtists(["id-t1-a", "id-t1-b"], "KEY", fetchImpl);
  assert.equal(getCachedYoutubeArtist("id-t1-a"), "Louis Armstrong - Topic");
  assert.equal(getCachedYoutubeArtist("id-t1-b"), "Some Channel");
});

test("lookupYoutubeArtists caches null for an id missing from the response", async () => {
  const fetchImpl = fakeFetch({ "id-t2-a": "Channel A" });
  await lookupYoutubeArtists(["id-t2-a", "id-t2-missing"], "KEY", fetchImpl);
  assert.equal(getCachedYoutubeArtist("id-t2-a"), "Channel A");
  assert.equal(getCachedYoutubeArtist("id-t2-missing"), null);
});

test("lookupYoutubeArtists caches null for every id when the fetch rejects", async () => {
  const fetchImpl = fakeFetch({}, { fails: true });
  await lookupYoutubeArtists(["id-t3-a", "id-t3-b"], "KEY", fetchImpl);
  assert.equal(getCachedYoutubeArtist("id-t3-a"), null);
  assert.equal(getCachedYoutubeArtist("id-t3-b"), null);
});

test("lookupYoutubeArtists caches null for every id when the response isn't ok", async () => {
  const fetchImpl = fakeFetch({}, { notOk: true });
  await lookupYoutubeArtists(["id-t4-a"], "KEY", fetchImpl);
  assert.equal(getCachedYoutubeArtist("id-t4-a"), null);
});

test("lookupYoutubeArtists never calls fetch without an apiKey", async () => {
  await lookupYoutubeArtists(["id-t5-a"], "", throwingFetch);
  assert.equal(getCachedYoutubeArtist("id-t5-a"), undefined);
});

test("lookupYoutubeArtists skips ids already cached, and dedupes/drops falsy ones before fetching", async () => {
  const first = fakeFetch({ "id-t6-a": "Channel A" });
  await lookupYoutubeArtists(["id-t6-a"], "KEY", first);
  assert.equal(first.calls.length, 1);

  const second = fakeFetch({ "id-t6-b": "Channel B" });
  await lookupYoutubeArtists(["id-t6-a", "id-t6-a", null, "", "id-t6-b"], "KEY", second);
  assert.equal(second.calls.length, 1);
  assert.deepEqual(idsFromUrl(second.calls[0]), ["id-t6-b"]);
  assert.equal(getCachedYoutubeArtist("id-t6-b"), "Channel B");
});

test("lookupYoutubeArtists splits more than 50 ids across chunked requests", async () => {
  const ids = Array.from({ length: 51 }, (_, i) => `id-t7-${i}`);
  const itemsById = Object.fromEntries(ids.map((id) => [id, `channel-${id}`]));
  const fetchImpl = fakeFetch(itemsById);
  await lookupYoutubeArtists(ids, "KEY", fetchImpl);
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(idsFromUrl(fetchImpl.calls[0]).length, 50);
  assert.equal(idsFromUrl(fetchImpl.calls[1]).length, 1);
  assert.equal(getCachedYoutubeArtist("id-t7-0"), "channel-id-t7-0");
  assert.equal(getCachedYoutubeArtist("id-t7-50"), "channel-id-t7-50");
});

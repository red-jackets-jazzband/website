// Looks up the channel name (a proxy for "performing artist") of a setlist
// song's linked YouTube video, via the YouTube Data API v3 — the plain,
// no-key oembed endpoint has no CORS header and can't be called from a
// browser at all (unlike the Data API, which does support CORS). Used by
// setlist-view.js's Spotify button to send TuneMyMusic "Artist - Title"
// lines instead of bare titles, for a better match rate.
import { youtubeVideosApiUrl, parseChannelTitles } from "../lib/youtube.js";

// In-memory only: a fresh page load re-looks-up. Cheap (one videos.list call
// per up to 50 unique ids) and sidesteps any staleness question from caching
// a channel rename across visits.
const cache = new Map();

const IDS_PER_REQUEST = 50; // videos.list's own per-request id cap

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

// The channel name for a YouTube video id, once its lookup has landed —
// undefined before that (never requested, or still in flight), null if the
// lookup ran and came back with nothing (deleted video, request failed, no
// apiKey configured, ...).
export function getCachedYoutubeArtist(id) {
  return cache.get(id);
}

function fetchChunk(idsChunk, apiKey, fetchImpl) {
  return fetchImpl(youtubeVideosApiUrl(idsChunk, apiKey))
    .then((res) => (res.ok ? res.json() : null))
    .then((json) => {
      const titles = json ? parseChannelTitles(json) : {};
      idsChunk.forEach((id) => cache.set(id, titles[id] || null));
    })
    .catch(() => idsChunk.forEach((id) => cache.set(id, null)));
}

// Fire-and-forget: looks up whichever of `ids` (typically a setlist's own
// per-song YouTube ids, straight off setlistPrint.getYoutubeIds() —
// duplicates and blanks included) aren't cached yet, so a later synchronous
// getCachedYoutubeArtist() read already has the answer. That synchronous read
// is what setlist-view.js's Spotify button needs: its click handler has no
// room for an extra network round trip without breaking the clipboard-focus/
// popup-blocking ordering it otherwise relies on (see initSpotifyPlaylist).
// No-ops without an apiKey — this whole feature is a progressive
// enhancement, never a hard dependency.
export function lookupYoutubeArtists(ids, apiKey, fetchImpl = fetch) {
  if (!apiKey) return Promise.resolve();
  const toFetch = [...new Set((ids || []).filter((id) => id && !cache.has(id)))];
  if (toFetch.length === 0) return Promise.resolve();

  return Promise.all(
    chunk(toFetch, IDS_PER_REQUEST).map((idsChunk) => fetchChunk(idsChunk, apiKey, fetchImpl)),
  ).then(() => {});
}

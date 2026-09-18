// Hostnames we treat as YouTube. Anything else — including a lookalike like
// `notyoutube.com` or `youtube.com.evil.example` — is rejected outright so a
// stray F: field can't point the Inspiration player at an arbitrary site.
export const YOUTUBE_HOSTS = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com",
  "youtube-nocookie.com", "www.youtube-nocookie.com",
  "youtu.be", "www.youtu.be",
]);

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

// Pulls the 11-character video id out of the handful of YouTube URL shapes
// that show up in songs' ABC F: fields (watch?v=, youtu.be/, /embed/, /shorts/,
// with trailing &list=/&t= params attached). Returns null for anything else.
export function extractYouTubeId(url) {
  if (typeof url !== "string") return null;
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  const id = host === "youtu.be" || host === "www.youtu.be"
    ? parsed.pathname.slice(1)
    : parsed.searchParams.get("v")
      || (parsed.pathname.match(/^\/(?:embed|v|shorts)\/([^/?#]+)/) || [])[1]
      || "";
  return VIDEO_ID.test(id) ? id : null;
}

// Builds a privacy-enhanced (youtube-nocookie.com) embed URL for the
// Inspiration picture-in-picture player, or null if the url isn't a
// recognizable YouTube link.
//
// `options` is an object { autoplay, jsApi, origin }; a bare `true` is also
// accepted as shorthand for { autoplay: true }. `jsApi` adds enablejsapi=1 (+
// playsinline=1, + origin=... when given) so the LoopTube toolbar can attach a
// YT.Player to the iframe and drive seek / playback-rate. It also sets
// controls=0: every jsApi embed is the Inspiration panel, whose own LoopTube
// toolbar already reimplements the native control bar's seek (the timeline),
// play/pause (the play button) and speed (the +/- stepper) — the native bar
// would just be a redundant, unstyled duplicate under the video.
export function youtubeEmbedUrl(url, options) {
  const id = extractYouTubeId(url);
  if (!id) return null;
  const opts = options === true ? { autoplay: true } : (options || {});
  const params = ["rel=0"];
  if (opts.autoplay) params.push("autoplay=1");
  if (opts.jsApi) {
    params.push("enablejsapi=1", "playsinline=1", "controls=0");
    if (opts.origin) params.push("origin=" + encodeURIComponent(opts.origin));
  }
  return "https://www.youtube-nocookie.com/embed/" + id + "?" + params.join("&");
}

const VIDEOS_API_BASE = "https://www.googleapis.com/youtube/v3/videos";

// Builds a batched YouTube Data API v3 videos.list URL for up to 50 ids at
// once (the API's own per-request cap) — used by
// songs/youtube-artist-lookup.js to look up each linked video's channel name
// for the Setlists tab's Spotify export (see setlist-view.js). Unlike the
// plain oembed endpoint, the Data API supports CORS, so this can be called
// straight from the browser with a referrer-restricted API key — but it
// still needs that key, so this returns null without one: the feature is a
// progressive enhancement, never a hard dependency.
export function youtubeVideosApiUrl(ids, apiKey) {
  if (!apiKey || !ids || ids.length === 0) return null;
  const params = new URLSearchParams({ part: "snippet", id: ids.join(","), key: apiKey });
  return `${VIDEOS_API_BASE}?${params.toString()}`;
}

// Extracts { [videoId]: channelTitle } from a videos.list response. A video
// id absent from `items` (deleted, private, or simply not returned) just
// doesn't get an entry — callers treat a missing key as "no artist found".
export function parseChannelTitles(json) {
  const result = {};
  const items = (json && Array.isArray(json.items)) ? json.items : [];
  for (const item of items) {
    if (item && item.id && item.snippet && item.snippet.channelTitle) {
      result[item.id] = item.snippet.channelTitle;
    }
  }
  return result;
}

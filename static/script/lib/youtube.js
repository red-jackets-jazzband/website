"use strict";

// Pulls the 11-character video id out of the handful of YouTube URL shapes
// that show up in songs' ABC F: fields (watch?v=, youtu.be/, with trailing
// &list=/&t= params attached). Returns null for anything else.
export function extractYouTubeId(url) {
  if (typeof url !== "string") return null;
  var match = url.trim().match(
    /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/))([A-Za-z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

// Builds a privacy-enhanced (youtube-nocookie.com) embed URL for the
// Inspiration picture-in-picture player, or null if the url isn't a
// recognizable YouTube link.
//
// `options` is an object { autoplay, jsApi, origin }; a bare `true` is also
// accepted as shorthand for { autoplay: true }. `jsApi` adds enablejsapi=1 (+
// playsinline=1, + origin=... when given) so the LoopTube toolbar can attach a
// YT.Player to the iframe and drive seek / playback-rate.
export function youtubeEmbedUrl(url, options) {
  var id = extractYouTubeId(url);
  if (!id) return null;
  var opts = options === true ? { autoplay: true } : (options || {});
  var params = ["rel=0"];
  if (opts.autoplay) params.push("autoplay=1");
  if (opts.jsApi) {
    params.push("enablejsapi=1");
    params.push("playsinline=1");
    if (opts.origin) params.push("origin=" + encodeURIComponent(opts.origin));
  }
  return "https://www.youtube-nocookie.com/embed/" + id + "?" + params.join("&");
}

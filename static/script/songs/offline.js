import { byId, on } from "../lib/dom.js";
import { GM_VOICES } from "../lib/gm-voices.js";
import { parseSongIndex } from "../lib/song-index.js";
import { STANDARD_SOUNDFONT_URL, HIGH_QUALITY_SOUNDFONT_URL } from "./audio-player.js";

const SW_URL = "/sw.js";
const SW_SCOPE = "/songs/";
const TOUR_LANGS = ["en", "nl", "de", "fr"];

// A single wide chromatic run (~5.5 octaves, C,, to c''') covering the full
// practical range any curated GM instrument (lib/gm-voices.js) could ever be
// asked to play. There's no API that enumerates a soundfont's own sample
// files — ABCJS's synth just XHRs whichever exact note it's told to play,
// from static/script/abcjs_midi_6.7.0-min.js's own per-instrument loader —
// so rendering this once per instrument through the real synth, letting the
// service worker cache every request as it flies by (see sw.js's "soundfont"
// strategy), is the only way to warm the full set ahead of time rather than
// only after a song that happens to use that exact note has been played.
const WIDE_RANGE_ABC = [
  "X:1", "T:", "M:4/4", "L:1", "K:C",
  "C,,4 D,,4 E,,4 F,,4 G,,4 A,,4 B,,4 |",
  "C,4 D,4 E,4 F,4 G,4 A,4 B,4 |",
  "C4 D4 E4 F4 G4 A4 B4 |",
  "c4 d4 e4 f4 g4 a4 b4 |",
  "c'4 d'4 e'4 f'4 g'4 a'4 b'4 |",
  "c''4 d''4 e''4 f''4 g''4 a''4 b''4 |",
  "c'''4 |]",
].join("\n");

function setStatus(text) {
  const node = byId("offlineStatus");
  if (!node) return;
  node.textContent = text;
  node.hidden = !text;
}

function serviceWorkerSupported() {
  return "serviceWorker" in navigator;
}

function registerServiceWorker() {
  if (!serviceWorkerSupported()) return Promise.resolve(false);
  return navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE, type: "module" })
    .then(() => true)
    .catch(() => false);
}

// Fetches every path in turn (not in parallel — a rehearsal-room connection
// is exactly the kind that chokes on a hundred-odd concurrent requests),
// reporting (done, total) after each one lands or fails. A missing/flaky
// individual file is skipped, not fatal — anyone downloading over a spotty
// connection gets everything that *did* land, not nothing.
async function fetchAll(paths, onProgress) {
  for (let i = 0; i < paths.length; i += 1) {
    try {
      await fetch(paths[i]);
    } catch {
      // Skipped — see this function's own doc comment above.
    }
    onProgress(i + 1, paths.length);
  }
}

function warmInstrument(program, soundFontUrl) {
  const visualObj = ABCJS.renderAbc("*", WIDE_RANGE_ABC, { visualTranspose: 0 })[0];
  const synth = new ABCJS.synth.CreateSynth();
  return synth.init({ visualObj, options: { soundFontUrl, program } })
    .then(() => synth.prime())
    .catch(() => {}); // one missing sample shouldn't abort the whole run
}

async function warmSoundfont(highQualityAudio, onProgress) {
  const soundFontUrl = highQualityAudio ? HIGH_QUALITY_SOUNDFONT_URL : STANDARD_SOUNDFONT_URL;
  for (let i = 0; i < GM_VOICES.length; i += 1) {
    await warmInstrument(GM_VOICES[i].value, soundFontUrl);
    onProgress(i + 1, GM_VOICES.length);
  }
}

async function fetchIndex(path) {
  const response = await fetch(path);
  return parseSongIndex(await response.text());
}

async function runDownload(ctx) {
  setStatus("Getting ready…");
  const registered = await registerServiceWorker();
  if (!registered) {
    setStatus("Offline mode isn't supported in this browser.");
    return;
  }
  await navigator.serviceWorker.ready;

  const [songs, setlists] = await Promise.all([
    fetchIndex("/songs/index_of_songs.txt"),
    fetchIndex("/setlists/index_of_setlists.txt"),
  ]);

  await fetchAll(
    songs.map((s) => `/songs/${s.file}`),
    (done, total) => setStatus(`Songs: ${done} of ${total}`),
  );
  await fetchAll(
    setlists.map((s) => `/setlists/${s.file}`),
    (done, total) => setStatus(`Setlists: ${done} of ${total}`),
  );
  await fetchAll(TOUR_LANGS.map((lang) => `/tour/tour.${lang}.md`), () => {});

  await warmSoundfont(ctx.state.highQualityAudio, (done, total) => setStatus(`Sounds: ${done} of ${total}`));

  setStatus("Available offline.");
}

/*
  "Download for offline" (#offlineBtn, songs.md): registers the service
  worker (see sw.js), then works through the whole library in three passes —
  every song/setlist/tour-copy file, then a full-range render of every
  curated Mixer instrument (lib/gm-voices.js's GM_VOICES) against the
  currently-selected soundfont set — reporting progress into #offlineStatus
  as it goes.

  Feature-detected: on a browser with no serviceWorker support (or none for
  module workers specifically — sw.js is a real ES module), #offlineBtn
  simply doesn't do anything meaningful to warm, and says so, rather than
  pretending it worked.
*/
export function createOffline(ctx) {
  let downloading = false;

  function downloadForOffline() {
    if (downloading) return Promise.resolve();
    downloading = true;
    return runDownload(ctx).finally(() => { downloading = false; });
  }

  function init() {
    const btn = byId("offlineBtn");
    if (!btn) return;
    if (!serviceWorkerSupported()) {
      btn.hidden = true;
      return;
    }
    on("offlineBtn", "click", downloadForOffline);
    registerServiceWorker();
  }

  return { init, downloadForOffline };
}

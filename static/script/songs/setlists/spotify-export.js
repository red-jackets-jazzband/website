import { byId, clear, el } from "../../lib/core/dom.js";
import {
  buildSoundiizPayload, soundiizShareUrl, SOUNDIIZ_ENDPOINT,
} from "../../lib/setlists/setlist-listen.js";

/*
  The Listen group's "Spotify" button: saves the open setlist as a playlist
  on the visitor's own Spotify account, through Soundiiz's public Playlist
  Import API (see lib/setlists/setlist-listen.js). The click POSTs the
  tracklist — each song pinned to its own Spotify track, else YouTube video,
  else SoundCloud track, else just its title — and sends the visitor to the
  temporary import page Soundiiz answers with, where they sign in and save it.

  The new tab is opened synchronously inside the click, *before* the request,
  and only pointed at Soundiiz once the reply lands: a window.open() made
  after an await is no longer a user gesture, and popup blockers (Safari's
  above all) would swallow it.
*/

const BUSY_TEXT = "Sending the setlist to Soundiiz…";
const FAIL_TEXT = "Couldn’t reach Soundiiz — try again in a moment.";

function setStatus(children) {
  const node = byId("listenStatus");
  if (!node) return;
  clear(node);
  if (!children) {
    node.hidden = true;
    return;
  }
  node.append(...[].concat(children));
  node.hidden = false;
}

function requestShareUrl(payload) {
  return fetch(SOUNDIIZ_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  })
    .then((response) => response.json())
    .then((reply) => {
      const url = soundiizShareUrl(reply);
      if (!url) throw new Error("Soundiiz did not return an import link");
      return url;
    });
}

// A blank tab to steer once the reply lands, cut loose from this page
// (window.open's "noopener" feature would hand back null, leaving nothing to
// steer). Null when a popup blocker refused it.
function openPendingTab() {
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  return tab;
}

// Called with print.js's listen-change payload; enabled once there's at
// least one song to send (every song counts — one with no link still goes
// over by title).
export function updateSpotifyButton(songs) {
  const btn = byId("listenSpotifyBtn");
  if (!btn) return;
  const ready = songs.some((song) => song && song.title);
  btn.disabled = !ready;
  btn.title = ready ? "Save this setlist as a Spotify playlist (via Soundiiz)" : "No songs in this setlist";
  setStatus(null);
}

export function createSpotifyExport(ctx) {
  let busy = false;

  function payload() {
    const print = ctx.setlistPrint;
    return buildSoundiizPayload(print.getListenTitle(), print.getListenSongs(), "spotify");
  }

  function send() {
    const body = payload();
    if (busy || !body) return;
    busy = true;
    const tab = openPendingTab();
    setStatus(BUSY_TEXT);
    requestShareUrl(body).then((url) => {
      if (tab) {
        tab.location.replace(url);
        setStatus(null);
      } else {
        setStatus(el("a", { href: url, target: "_blank", rel: "noopener", text: "Open the playlist on Soundiiz" }));
      }
    }, (err) => {
      console.warn("Soundiiz import failed:", err);
      if (tab) tab.close();
      setStatus(FAIL_TEXT);
    }).then(() => { busy = false; });
  }

  function init() {
    const btn = byId("listenSpotifyBtn");
    if (btn) btn.addEventListener("click", send);
  }

  return { init, update: updateSpotifyButton, send };
}

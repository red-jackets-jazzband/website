import { byId, on } from "../lib/dom.js";
import { youtubeEmbedUrl, extractYouTubeId } from "../lib/youtube.js";
import {
  formatClock, timeToFraction, fractionToTime, normalizeLoop,
  clampHandleDrag, stepPlaybackRate, loopLeadSeconds, shouldLoopSeek,
} from "../lib/looptube.js";

const LOOP_POLL_MS = 80;
const LOOP_MIN_GAP = 1; // seconds — the shortest loop the toggle will accept
const EDGE_MARGIN = 8; // px — how close to a window edge the panel may be dragged

/*
  The Inspiration picture-in-picture panel: a docked, draggable YouTube player
  that keeps playing across song navigation (until explicitly closed) instead
  of leaving the page, plus a LoopTube toolbar under the video — A/B loop
  markers on a slim timeline, an endless A–B loop toggle (an ~80 ms poll that
  seekTo's back to A just before B, since YouTube has no native sub-range loop)
  and a playback-rate stepper. Driven through the YouTube IFrame Player API;
  the pure range/rate/clock maths is in lib/looptube.js.
*/
export function createInspiration() {
  let panelUrl = null;
  let apiPromise = null;
  let player = null;
  let playerReady = false;
  let pendingVideoId = null;
  let loopA = null;
  let loopB = null;
  let loopEnabled = false;
  let loopPollId = null;
  let loopDragging = null; // "a" | "b" | null

  // ---- YouTube IFrame API --------------------------------------------

  function loadIframeApi() {
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve) => {
      if (window.YT && window.YT.Player) {
        resolve();
        return;
      }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === "function") prev();
        resolve();
      };
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    });
    return apiPromise;
  }

  function attachPlayer() {
    if (player) return;
    player = new window.YT.Player("inspirationVideoFrame", {
      events: {
        onReady() {
          playerReady = true;
          if (pendingVideoId) {
            player.loadVideoById(pendingVideoId);
            pendingVideoId = null;
          }
          updateSpeedLabel();
          updateLoopUI();
        },
        onStateChange: onPlayerStateChange,
        onPlaybackRateChange: updateSpeedLabel,
      },
    });
  }

  // ---- the "Inspiration" button on the sheet -------------------------

  /*
    Keep the sheet's Inspiration button in sync with the current tune: created
    for a tune whose ABC has an F: field, removed for one without. It only
    updates its own url/title — it never touches an already-open panel, so a
    video someone is playing along to keeps going while they browse songs.
  */
  function updateLink(url, title) {
    let btn = byId("inspirationLink");
    if (url === undefined) {
      if (btn) btn.remove();
      return;
    }
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Inspiration";
      btn.id = "inspirationLink";
      btn.className = "sheet-inspiration-link";
      btn.addEventListener("click", () => togglePanel(btn.dataset.url, btn.dataset.title));
      const slot = byId("inspirationSlot");
      if (slot) slot.appendChild(btn);
    }
    btn.dataset.url = url;
    btn.dataset.title = title || "";
  }

  // ---- open / close -------------------------------------------------

  function togglePanel(url, title) {
    const panel = byId("inspirationPanel");
    if (!panel) return;
    if (!panel.hidden && panelUrl === url) closePanel();
    else openPanel(url, title);
  }

  function openPanel(url, title) {
    const panel = byId("inspirationPanel");
    const frame = byId("inspirationVideoFrame");
    if (!panel || !frame) return;
    const videoId = extractYouTubeId(url);
    if (!videoId) return;

    const titleEl = byId("inspirationPanelTitle");
    if (titleEl) titleEl.textContent = title || "Inspiration";
    const expandLink = byId("inspirationExpandBtn");
    if (expandLink) expandLink.href = url;

    panelUrl = url;
    panel.hidden = false;
    stopLoopPoll();
    resetLoopState();

    if (player && playerReady) {
      player.loadVideoById(videoId);
      return;
    }
    if (player) {
      pendingVideoId = videoId; // player exists but onReady hasn't fired yet
      return;
    }
    pendingVideoId = null;
    frame.src = youtubeEmbedUrl(url, {
      autoplay: true, jsApi: true, origin: window.location.origin,
    });
    loadIframeApi().then(attachPlayer);
  }

  function closePanel() {
    const panel = byId("inspirationPanel");
    if (!panel) return;
    panel.hidden = true;
    stopLoopPoll();
    if (player && playerReady && player.stopVideo) {
      player.stopVideo();
    } else {
      const frame = byId("inspirationVideoFrame");
      if (frame) frame.src = "";
    }
    const bar = byId("inspirationLoopBar");
    if (bar) bar.hidden = true;
    panelUrl = null;
  }

  function onPlayerStateChange(e) {
    const states = window.YT && window.YT.PlayerState;
    if (states && e.data === states.PLAYING) startLoopPoll();
    else stopLoopPoll();
    updateLoopUI();
  }

  // ---- loop poll ---------------------------------------------------

  function startLoopPoll() {
    if (loopPollId === null) loopPollId = window.setInterval(loopTick, LOOP_POLL_MS);
  }

  function stopLoopPoll() {
    if (loopPollId === null) return;
    window.clearInterval(loopPollId);
    loopPollId = null;
  }

  function loopTick() {
    if (!player || !playerReady) return;
    let t = player.getCurrentTime();
    if (loopEnabled && !loopDragging) {
      const span = normalizeLoop(loopA, loopB, LOOP_MIN_GAP);
      if (span) {
        const rate = player.getPlaybackRate ? player.getPlaybackRate() : 1;
        if (shouldLoopSeek(t, span.a, span.b, loopLeadSeconds(rate, LOOP_POLL_MS))) {
          player.seekTo(span.a, true);
          t = span.a;
        }
      }
    }
    updatePlayhead(t);
  }

  // ---- loop UI ----------------------------------------------------

  function playerDuration() {
    return player && playerReady && player.getDuration ? player.getDuration() : 0;
  }

  function updatePlayhead(t) {
    const played = byId("inspirationLoopPlayed");
    if (!played) return;
    const dur = player && player.getDuration ? player.getDuration() : 0;
    played.style.width = `${timeToFraction(t, dur) * 100}%`;
  }

  function positionLoopHandle(el, value, dur) {
    if (!el) return;
    if (value === null || dur <= 0) {
      el.hidden = true;
      return;
    }
    el.style.left = `${timeToFraction(value, dur) * 100}%`;
    el.hidden = false;
  }

  function updateLoopRange(dur) {
    const range = byId("inspirationLoopRange");
    if (!range) return;
    if (loopA !== null && loopB !== null && dur > 0) {
      const fa = timeToFraction(Math.min(loopA, loopB), dur);
      const fb = timeToFraction(Math.max(loopA, loopB), dur);
      range.style.left = `${fa * 100}%`;
      range.style.width = `${(fb - fa) * 100}%`;
      range.hidden = false;
    } else {
      range.hidden = true;
    }
  }

  function updateLoopReadout() {
    const readout = byId("inspirationLoopReadout");
    if (!readout) return;
    if (loopA !== null || loopB !== null) {
      const a = loopA !== null ? formatClock(loopA) : "–";
      const b = loopB !== null ? formatClock(loopB) : "–";
      readout.textContent = `${a} – ${b}`;
      readout.hidden = false;
    } else {
      readout.hidden = true;
    }
  }

  function updateLoopUI() {
    const dur = playerDuration();
    positionLoopHandle(byId("inspirationLoopHandleA"), loopA, dur);
    positionLoopHandle(byId("inspirationLoopHandleB"), loopB, dur);

    const setA = byId("inspirationSetA");
    const setB = byId("inspirationSetB");
    if (setA) setA.classList.toggle("armed", loopA !== null);
    if (setB) setB.classList.toggle("armed", loopB !== null);

    updateLoopRange(dur);
    updateLoopReadout();

    const canLoop = normalizeLoop(loopA, loopB, LOOP_MIN_GAP) !== null;
    if (!canLoop && loopEnabled) loopEnabled = false;
    const toggle = byId("inspirationLoopToggle");
    if (toggle) {
      toggle.disabled = !canLoop;
      toggle.setAttribute("aria-pressed", loopEnabled ? "true" : "false");
    }
  }

  function updateSpeedLabel() {
    const label = byId("inspirationSpeedValue");
    if (!label) return;
    const rate = player && playerReady && player.getPlaybackRate ? player.getPlaybackRate() : 1;
    label.textContent = `${Math.round(rate * 100) / 100}×`;
  }

  function resetLoopState() {
    loopA = null;
    loopB = null;
    loopEnabled = false;
    loopDragging = null;
    const bar = byId("inspirationLoopBar");
    if (bar) bar.hidden = false;
    if (player && playerReady && player.setPlaybackRate) player.setPlaybackRate(1);
    const played = byId("inspirationLoopPlayed");
    if (played) played.style.width = "0%";
    updateSpeedLabel();
    updateLoopUI();
  }

  function setLoopMarker(which) {
    if (!player || !playerReady) return;
    const t = player.getCurrentTime();
    if (!Number.isFinite(t)) return;
    if (which === "a") loopA = t;
    else loopB = t;
    updateLoopUI();
  }

  function toggleLoopEnabled() {
    const span = normalizeLoop(loopA, loopB, LOOP_MIN_GAP);
    if (!span) return;
    loopEnabled = !loopEnabled;
    updateLoopUI();
    if (loopEnabled && player && playerReady) {
      const t = player.getCurrentTime();
      if (t < span.a || t >= span.b) player.seekTo(span.a, true);
    }
  }

  function clearLoopMarkers() {
    loopA = null;
    loopB = null;
    loopEnabled = false;
    updateLoopUI();
  }

  function changeSpeed(direction) {
    if (!player || !playerReady) return;
    const rates = player.getAvailablePlaybackRates ? player.getAvailablePlaybackRates() : null;
    const current = player.getPlaybackRate ? player.getPlaybackRate() : 1;
    player.setPlaybackRate(stepPlaybackRate(current, direction, rates));
    updateSpeedLabel();
  }

  function trackFraction(track, e) {
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  }

  // ---- wiring ----------------------------------------------------

  function initLoopBar() {
    on("inspirationSetA", "click", () => setLoopMarker("a"));
    on("inspirationSetB", "click", () => setLoopMarker("b"));
    on("inspirationLoopToggle", "click", toggleLoopEnabled);
    on("inspirationLoopClear", "click", clearLoopMarkers);
    on("inspirationSpeedDown", "click", () => changeSpeed(-1));
    on("inspirationSpeedUp", "click", () => changeSpeed(1));

    const track = byId("inspirationLoopTrack");
    if (!track) return;
    track.addEventListener("pointerdown", (e) => {
      const handle = e.target.closest && e.target.closest(".inspiration-loop-handle");
      if (handle) {
        loopDragging = handle.id === "inspirationLoopHandleB" ? "b" : "a";
        track.setPointerCapture(e.pointerId);
        return;
      }
      if (!player || !playerReady) return;
      const dur = playerDuration();
      if (dur > 0) player.seekTo(fractionToTime(trackFraction(track, e), dur), true);
    });
    track.addEventListener("pointermove", (e) => {
      if (!loopDragging) return;
      const dur = playerDuration();
      if (dur <= 0) return;
      const frac = trackFraction(track, e);
      const otherFrac = loopDragging === "a"
        ? timeToFraction(loopB === null ? dur : loopB, dur)
        : timeToFraction(loopA === null ? 0 : loopA, dur);
      const clamped = clampHandleDrag(frac, otherFrac, loopDragging, LOOP_MIN_GAP / dur);
      const time = fractionToTime(clamped, dur);
      if (loopDragging === "a") loopA = time;
      else loopB = time;
      updateLoopUI();
    });
    track.addEventListener("pointerup", (e) => {
      if (!loopDragging) return;
      loopDragging = null;
      if (track.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId);
      updateLoopUI();
    });
  }

  // The panel can be dragged to any corner by its header; position switches
  // from the default bottom-right anchor to an explicit left/top on first drag.
  function initDrag(panel, header) {
    let drag = null;
    header.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".inspiration-panel-icon-btn")) return;
      const rect = panel.getBoundingClientRect();
      drag = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };
      header.setPointerCapture(e.pointerId);
      panel.classList.add("dragging");
    });
    header.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const maxLeft = window.innerWidth - panel.offsetWidth - EDGE_MARGIN;
      const maxTop = window.innerHeight - panel.offsetHeight - EDGE_MARGIN;
      const left = Math.min(Math.max(EDGE_MARGIN, drag.left + (e.clientX - drag.x)), Math.max(EDGE_MARGIN, maxLeft));
      const top = Math.min(Math.max(EDGE_MARGIN, drag.top + (e.clientY - drag.y)), Math.max(EDGE_MARGIN, maxTop));
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    });
    header.addEventListener("pointerup", (e) => {
      drag = null;
      panel.classList.remove("dragging");
      if (header.hasPointerCapture(e.pointerId)) header.releasePointerCapture(e.pointerId);
    });
  }

  function init() {
    const panel = byId("inspirationPanel");
    const header = byId("inspirationPanelHeader");
    if (!panel || !header) return;
    initLoopBar();
    on("inspirationCloseBtn", "click", closePanel);
    initDrag(panel, header);
  }

  return { updateLink, init };
}

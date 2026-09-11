import { test } from "node:test";
import assert from "node:assert/strict";
import { mountPage } from "../../../tests/helpers/dom.js";
import { createInspiration } from "./inspiration.js";

const SAMPLE_URL = "https://youtu.be/abcdefghijk";
const ARIA_PRESSED = "aria-pressed";

function inDom(fn) {
  const page = mountPage();
  try {
    return fn(page);
  } finally {
    page.cleanup();
  }
}

// Mounts a mocked window.YT.Player (the shape every LoopTube-timeline test
// needs: getCurrentTime/getDuration/seekTo/etc.), opens the panel through the
// normal Inspiration-button click, and fires onReady so the track/A/B/zoom
// controls are live. `overrides` patches individual player methods (e.g. a
// mutable getCurrentTime, or a seekTo that records its calls); the caller
// still owns `delete window.YT` and `page.cleanup()` in its own finally.
async function openLoopPanel(window, overrides = {}) {
  let fireReady = null;
  window.YT = {
    Player: function FakePlayer(_el, opts) {
      fireReady = opts.events.onReady;
      this.loadVideoById = () => {};
      this.stopVideo = () => {};
      this.getCurrentTime = () => 0;
      this.getDuration = () => 200;
      this.getPlaybackRate = () => 1;
      this.getAvailablePlaybackRates = () => [0.5, 1, 2];
      this.setPlaybackRate = () => {};
      this.seekTo = () => {};
      Object.assign(this, overrides);
    },
    PlayerState: { PLAYING: 1 },
  };
  const insp = createInspiration();
  insp.init();
  insp.updateLink(SAMPLE_URL, "X");
  document.getElementById("inspirationLink").dispatchEvent(new window.Event("click"));
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  fireReady();
  return insp;
}

// Opens the panel, primes its bounding rect and starts a left-edge drag at
// clientX 480 (the panel's left edge) — shared by the resize tests below,
// which differ only in where the pointer moves to next.
function startResizeDrag(window) {
  window.localStorage.clear();
  const insp = createInspiration();
  insp.init();
  const panel = document.getElementById("inspirationPanel");
  const handle = document.getElementById("inspirationResizeHandle");
  panel.getBoundingClientRect = () => ({ right: 800, left: 480, width: 320, top: 100, bottom: 400, height: 300 });
  handle.dispatchEvent(new window.PointerEvent("pointerdown", { pointerId: 1, clientX: 480 }));
  return { insp, panel, handle };
}

test("updateLink creates the Inspiration button for a tune with a reference", () => {
  inDom(() => {
    const insp = createInspiration();
    insp.updateLink(SAMPLE_URL, "Louis Armstrong");
    const btn = document.getElementById("inspirationLink");
    assert.ok(btn);
    assert.equal(btn.textContent, "Inspiration");
    assert.equal(btn.dataset.url, SAMPLE_URL);
    assert.equal(btn.dataset.title, "Louis Armstrong");
    assert.ok(document.getElementById("inspirationSlot").contains(btn));
  });
});

test("updateLink updates the existing button in place, without duplicating it", () => {
  inDom(() => {
    const insp = createInspiration();
    insp.updateLink("https://youtu.be/one11111111", "One");
    insp.updateLink("https://youtu.be/two22222222", "Two");
    assert.equal(document.querySelectorAll("#inspirationLink").length, 1);
    assert.equal(document.getElementById("inspirationLink").dataset.url, "https://youtu.be/two22222222");
  });
});

test("updateLink(undefined) removes the button for a tune without a reference", () => {
  inDom(() => {
    const insp = createInspiration();
    insp.updateLink(SAMPLE_URL, "X");
    insp.updateLink(undefined);
    assert.equal(document.getElementById("inspirationLink"), null);
  });
});

test("opening the panel marks the Inspiration button active, closing it clears that", () => {
  inDom(() => {
    const insp = createInspiration();
    insp.init();
    insp.updateLink(SAMPLE_URL, "X");
    const btn = document.getElementById("inspirationLink");

    btn.dispatchEvent(new window.Event("click"));
    assert.equal(btn.classList.contains("active"), true);
    assert.equal(btn.getAttribute("aria-expanded"), "true");

    document.getElementById("inspirationCloseBtn").dispatchEvent(new window.Event("click"));
    assert.equal(btn.classList.contains("active"), false);
    assert.equal(btn.getAttribute("aria-expanded"), "false");
  });
});

test("updateLink recreating the button while the panel is already open marks it active immediately", () => {
  inDom(() => {
    const insp = createInspiration();
    insp.init();
    insp.updateLink(SAMPLE_URL, "X");
    document.getElementById("inspirationLink").dispatchEvent(new window.Event("click"));

    // Simulate navigating to a song without a reference (button removed)
    // while the panel keeps playing, then back to one that has one.
    insp.updateLink(undefined);
    insp.updateLink("https://youtu.be/zyxwvutsrqp", "Y");

    const btn = document.getElementById("inspirationLink");
    assert.equal(btn.classList.contains("active"), true);
  });
});

test("init wires the close button without a player attached", () => {
  inDom(() => {
    const insp = createInspiration();
    insp.init();
    const panel = document.getElementById("inspirationPanel");
    panel.hidden = false;
    document.getElementById("inspirationCloseBtn").dispatchEvent(new window.Event("click"));
    assert.equal(panel.hidden, true);
  });
});

test("closePanel drops a pending video id so a late onReady can't play into a hidden panel", async () => {
  const page = mountPage();
  const { window } = page;
  try {
    let fireReady = null;
    const loaded = [];
    window.YT = {
      Player: function FakePlayer(_el, opts) {
        fireReady = opts.events.onReady;
        this.loadVideoById = (id) => loaded.push(id);
        this.stopVideo = () => {};
        this.getCurrentTime = () => 0;
        this.getPlaybackRate = () => 1;
      },
      PlayerState: { PLAYING: 1 },
    };
    const insp = createInspiration();
    insp.init();
    insp.updateLink("https://youtu.be/aaaaaaaaaaa", "A");
    const btn = document.getElementById("inspirationLink");

    // Open once: no player yet, so the frame src is set and the player is
    // attached on the next microtask — but onReady hasn't fired.
    btn.dispatchEvent(new window.Event("click"));
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    // Switch to another video while the player is still not ready: its id is
    // parked in pendingVideoId.
    btn.dataset.url = "https://youtu.be/bbbbbbbbbbb";
    btn.dispatchEvent(new window.Event("click"));

    // Close before the player becomes ready.
    document.getElementById("inspirationCloseBtn").dispatchEvent(new window.Event("click"));
    assert.equal(document.getElementById("inspirationPanel").hidden, true);

    // The late onReady must not start the parked video into the hidden panel.
    fireReady();
    assert.deepEqual(loaded, []);
  } finally {
    delete window.YT;
    page.cleanup();
  }
});

test("the size button steps the panel width and wraps back round", () => {
  inDom(({ window }) => {
    window.localStorage.clear();
    const insp = createInspiration();
    insp.init();
    const panel = document.getElementById("inspirationPanel");
    const btn = document.getElementById("inspirationSizeBtn");

    assert.equal(panel.style.width, "320px");
    const widths = [];
    for (let i = 0; i < 4; i += 1) {
      btn.dispatchEvent(new window.Event("click"));
      widths.push(panel.style.width);
    }
    assert.deepEqual(widths, ["420px", "540px", "680px", "320px"]);
  });
});

test("init restores a persisted panel width", () => {
  inDom(({ window }) => {
    window.localStorage.setItem("rj.inspirationWidth", "540");
    const insp = createInspiration();
    insp.init();
    assert.equal(document.getElementById("inspirationPanel").style.width, "540px");
    window.localStorage.clear();
  });
});

test("dragging the left edge resizes the panel and persists the new width", () => {
  inDom(({ window }) => {
    const { panel, handle } = startResizeDrag(window);
    handle.dispatchEvent(new window.PointerEvent("pointermove", { pointerId: 1, clientX: 300 }));
    assert.equal(panel.style.width, "500px");

    handle.dispatchEvent(new window.PointerEvent("pointerup", { pointerId: 1, clientX: 300 }));
    assert.equal(window.localStorage.getItem("rj.inspirationWidth"), "500");
  });
});

test("a shared A/B link opens the video with the loop already set", async () => {
  const page = mountPage();
  const { window } = page;
  try {
    let fireReady = null;
    let fireState = null;
    const seeks = [];
    window.YT = {
      Player: function FakePlayer(_el, opts) {
        fireReady = opts.events.onReady;
        fireState = opts.events.onStateChange;
        this.loadVideoById = () => {};
        this.stopVideo = () => {};
        this.getCurrentTime = () => 0;
        this.getDuration = () => 200;
        this.getPlaybackRate = () => 1;
        this.getAvailablePlaybackRates = () => [0.5, 1, 2];
        this.setPlaybackRate = () => {};
        this.seekTo = (t) => seeks.push(t);
      },
      PlayerState: { PLAYING: 1 },
    };
    const insp = createInspiration();
    insp.init();
    insp.applyShareState({ a: 12, b: 30 });
    insp.updateLink(SAMPLE_URL, "X");

    assert.equal(document.getElementById("inspirationPanel").hidden, false);
    assert.equal(
      document.getElementById("inspirationLoopToggle").getAttribute(ARIA_PRESSED), "true",
    );

    await new Promise((resolve) => { setTimeout(resolve, 0); });
    fireReady();
    // The shared start point (loop A) lands only once the video is playing,
    // not on onReady — a replacement video wouldn't have re-fired onReady.
    assert.deepEqual(seeks, []);
    fireState({ data: 1 });

    assert.deepEqual(seeks, [12]);
    assert.equal(document.getElementById("inspirationLoopHandleA").style.left, "6%");
    assert.equal(document.getElementById("inspirationLoopHandleB").style.left, "15%");
  } finally {
    delete window.YT;
    page.cleanup();
  }
});

test("the play/pause button drives the player and its icon follows player state", async () => {
  const page = mountPage();
  const { window } = page;
  try {
    let fireReady = null;
    let fireState = null;
    const calls = [];
    window.YT = {
      Player: function FakePlayer(_el, opts) {
        fireReady = opts.events.onReady;
        fireState = opts.events.onStateChange;
        this.loadVideoById = () => {};
        this.stopVideo = () => {};
        this.getCurrentTime = () => 0;
        this.getDuration = () => 200;
        this.getPlaybackRate = () => 1;
        this.getAvailablePlaybackRates = () => [0.5, 1, 2];
        this.setPlaybackRate = () => {};
        this.seekTo = () => {};
        this.playVideo = () => calls.push("play");
        this.pauseVideo = () => calls.push("pause");
      },
      PlayerState: { PLAYING: 1 },
    };
    const insp = createInspiration();
    insp.init();
    insp.updateLink(SAMPLE_URL, "X");
    document.getElementById("inspirationLink").dispatchEvent(new window.Event("click"));
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    fireReady();

    const toggle = document.getElementById("inspirationPlayToggle");
    const icon = toggle.querySelector("span");
    assert.equal(icon.className, "fa-solid fa-play");
    assert.equal(toggle.getAttribute("aria-label"), "Play");

    // Not playing yet -> the click should ask the player to start.
    toggle.dispatchEvent(new window.Event("click"));
    assert.deepEqual(calls, ["play"]);

    // The player reports it's now playing -> the button flips to pause.
    fireState({ data: 1 });
    assert.equal(icon.className, "fa-solid fa-pause");
    assert.equal(toggle.getAttribute("aria-label"), "Pause");

    // Playing -> the next click should ask the player to pause.
    toggle.dispatchEvent(new window.Event("click"));
    assert.deepEqual(calls, ["play", "pause"]);

    // Any non-playing state (e.g. paused) flips the icon back.
    fireState({ data: 2 });
    assert.equal(icon.className, "fa-solid fa-play");
    assert.equal(toggle.getAttribute("aria-label"), "Play");
  } finally {
    delete window.YT;
    page.cleanup();
  }
});

test("zoom in narrows the timeline window around the current playhead", async () => {
  const page = mountPage();
  const { window } = page;
  try {
    let currentTime = 100;
    await openLoopPanel(window, { getCurrentTime: () => currentTime });

    const zoomOut = document.getElementById("inspirationZoomOut");
    const zoomIn = document.getElementById("inspirationZoomIn");
    const zoomValue = document.getElementById("inspirationZoomValue");
    assert.equal(zoomValue.textContent, "1×");
    assert.equal(zoomOut.disabled, true); // already the widest view

    // A 200s clip, playhead at 100s -> smack in the middle either way, so a
    // marker placed here reads 50% before and after zooming in.
    document.getElementById("inspirationSetA").dispatchEvent(new window.Event("click"));
    assert.equal(document.getElementById("inspirationLoopHandleA").style.left, "50%");

    zoomIn.dispatchEvent(new window.Event("click")); // -> 2x, window [50, 150]
    assert.equal(zoomValue.textContent, "2×");
    assert.equal(zoomOut.disabled, false);
    assert.equal(document.getElementById("inspirationLoopHandleA").style.left, "50%");

    // A marker outside the now-narrower window is hidden, not clamped to an
    // edge (which would look like a real, wrong marker).
    currentTime = 199;
    document.getElementById("inspirationSetB").dispatchEvent(new window.Event("click"));
    assert.equal(document.getElementById("inspirationLoopHandleB").hidden, true);
  } finally {
    delete window.YT;
    page.cleanup();
  }
});

test("zoom in/out buttons disable at ZOOM_LEVELS' ends", async () => {
  const page = mountPage();
  const { window } = page;
  try {
    await openLoopPanel(window, { getCurrentTime: () => 100 });

    const zoomOut = document.getElementById("inspirationZoomOut");
    const zoomIn = document.getElementById("inspirationZoomIn");
    const zoomValue = document.getElementById("inspirationZoomValue");

    for (let i = 0; i < 10; i += 1) zoomIn.dispatchEvent(new window.Event("click"));
    assert.equal(zoomValue.textContent, "32×"); // ZOOM_LEVELS' last entry
    assert.equal(zoomIn.disabled, true);
    assert.equal(zoomOut.disabled, false);

    for (let i = 0; i < 10; i += 1) zoomOut.dispatchEvent(new window.Event("click"));
    assert.equal(zoomValue.textContent, "1×");
    assert.equal(zoomOut.disabled, true);
  } finally {
    delete window.YT;
    page.cleanup();
  }
});

test("dragging a handle near the zoomed timeline's edge pans the window", async () => {
  const page = mountPage();
  const { window } = page;
  try {
    await openLoopPanel(window, { getCurrentTime: () => 100 });

    document.getElementById("inspirationSetA").dispatchEvent(new window.Event("click")); // A=100
    const zoomIn = document.getElementById("inspirationZoomIn");
    zoomIn.dispatchEvent(new window.Event("click")); // 2x -> [50, 150]
    zoomIn.dispatchEvent(new window.Event("click")); // 4x -> [75, 125]

    const track = document.getElementById("inspirationLoopTrack");
    track.getBoundingClientRect = () => ({ left: 0, width: 200 });
    const handleA = document.getElementById("inspirationLoopHandleA");

    // Grab handle A (currently at 50% of [75,125], i.e. t=100) and drag to
    // the track's left edge — inside EDGE_PAN_THRESHOLD of it.
    handleA.dispatchEvent(new window.PointerEvent("pointerdown", { pointerId: 1, clientX: 100, bubbles: true }));
    track.dispatchEvent(new window.PointerEvent("pointermove", { pointerId: 1, clientX: 2 }));

    // The window panned left (toward 0) by one EDGE_PAN_STEP rather than
    // trapping the drag at the pre-pan [75,125] floor: without panning, 1%
    // into that window would land on 75.5s ("1:15"); with it, the window has
    // shifted to [65,115] and 1% into that lands on 65.5s ("1:05") instead.
    assert.equal(document.getElementById("inspirationLoopReadout").textContent, "1:05 – –");
    assert.equal(document.getElementById("inspirationZoomValue").textContent, "4×"); // zoom level itself is untouched by panning
  } finally {
    delete window.YT;
    page.cleanup();
  }
});

test("setting point B auto-enables the loop toggle once A and B form a span", async () => {
  const page = mountPage();
  const { window } = page;
  try {
    let currentTime = 0;
    const seeks = [];
    await openLoopPanel(window, { getCurrentTime: () => currentTime, seekTo: (t) => seeks.push(t) });

    const toggle = document.getElementById("inspirationLoopToggle");
    assert.equal(toggle.getAttribute(ARIA_PRESSED), "false");

    currentTime = 10;
    document.getElementById("inspirationSetA").dispatchEvent(new window.Event("click"));
    assert.equal(toggle.getAttribute(ARIA_PRESSED), "false"); // A alone isn't a loop yet

    currentTime = 20;
    document.getElementById("inspirationSetB").dispatchEvent(new window.Event("click"));
    assert.equal(toggle.getAttribute(ARIA_PRESSED), "true"); // B completes the span — auto-armed
    // Same seek-back-to-A the toggle button itself does when turned on by hand.
    assert.deepEqual(seeks, [10]);

    // A later Set B press just moves B — already looping, so it isn't
    // re-toggled off.
    currentTime = 25;
    document.getElementById("inspirationSetB").dispatchEvent(new window.Event("click"));
    assert.equal(toggle.getAttribute(ARIA_PRESSED), "true");
  } finally {
    delete window.YT;
    page.cleanup();
  }
});

test("setting point B too close to A to form a loop doesn't enable the toggle", async () => {
  const page = mountPage();
  const { window } = page;
  try {
    let currentTime = 0;
    await openLoopPanel(window, { getCurrentTime: () => currentTime });

    currentTime = 10;
    document.getElementById("inspirationSetA").dispatchEvent(new window.Event("click"));
    currentTime = 10.5; // under LOOP_MIN_GAP — not a playable span
    document.getElementById("inspirationSetB").dispatchEvent(new window.Event("click"));

    const toggle = document.getElementById("inspirationLoopToggle");
    assert.equal(toggle.getAttribute(ARIA_PRESSED), "false");
    assert.equal(toggle.disabled, true);
  } finally {
    delete window.YT;
    page.cleanup();
  }
});

test("the share button copies the link ctx.shareUrl builds from the markers", () => {
  inDom(({ window }) => {
    const copied = [];
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText: (t) => { copied.push(t); return Promise.resolve(); } },
      configurable: true,
    });
    const seen = [];
    const ctx = {
      shareUrl: (markers) => {
        seen.push(markers);
        return "https://red-jackets.example/songs/#s=basin_street&i=1";
      },
    };
    const insp = createInspiration(ctx);
    insp.init();

    document.getElementById("inspirationShareBtn").dispatchEvent(new window.Event("click"));

    assert.deepEqual(seen, [{ a: null, b: null }]);
    assert.deepEqual(copied, ["https://red-jackets.example/songs/#s=basin_street&i=1"]);
  });
});

test("a rejected clipboard write falls back to a prompt and shows no success tick", async () => {
  const page = mountPage();
  const { window } = page;
  try {
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("denied")) },
      configurable: true,
    });
    let prompted = null;
    window.prompt = (_label, value) => { prompted = value; return value; };
    const insp = createInspiration({ shareUrl: () => "https://x/songs/#s=y&i=1" });
    insp.init();

    window.document.getElementById("inspirationShareBtn").dispatchEvent(new window.Event("click"));
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    assert.equal(prompted, "https://x/songs/#s=y&i=1");
    assert.equal(
      window.document.getElementById("inspirationShareBtn").classList.contains("copied"), false,
    );
  } finally {
    page.cleanup();
  }
});

test("edge resize floors the panel at MIN_PANEL_WIDTH", () => {
  inDom(({ window }) => {
    const { panel, handle } = startResizeDrag(window);
    handle.dispatchEvent(new window.PointerEvent("pointermove", { pointerId: 1, clientX: 790 }));
    assert.equal(panel.style.width, "240px");
  });
});

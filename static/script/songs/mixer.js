import { byId, on } from "../lib/dom.js";
import { readPref, writePref, PREF_KEYS } from "../lib/preferences.js";

// Full re-engrave (the only way to change what plays — see sheet.js /
// lib/audio-mix.js) is too heavy to run on every "input" tick of a dragged
// slider, so it's debounced; a mute click or a slider release applies at once.
const APPLY_DEBOUNCE_MS = 220;
const REPOSITION_MARGIN = 8;

const CHANNELS = ["melody", "backing"];

function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 100;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function storedPercent(key) {
  const stored = readPref(key);
  return stored === null ? 100 : clampPercent(stored);
}

function elementIds(channel) {
  const cap = channel === "melody" ? "Melody" : "Backing";
  return {
    range: `mixer${cap}Range`,
    fill: `mixer${cap}Fill`,
    readout: `mixer${cap}Readout`,
    muteBtn: `mixer${cap}MuteBtn`,
  };
}

const VOLUME_PREF_KEY = { melody: PREF_KEYS.mixerMelodyVolume, backing: PREF_KEYS.mixerBackingVolume };
const MUTED_PREF_KEY = { melody: PREF_KEYS.mixerMelodyMuted, backing: PREF_KEYS.mixerBackingMuted };
const CHANNEL_LABEL = { melody: "melody", backing: "backing track" };

/*
  The sheet toolbar's Mixer button (#mixerBtn) and its popover/bottom-sheet
  panel (#mixerPanel): two channels — Melody and the Backing track (the
  comping voice, as one bus) — each a 0-100 volume fader plus an independent
  mute. Values are sticky across songs (persisted like the instrument /
  comping choices, see lib/preferences.js), read by sheet.js at render time
  (lib/audio-mix.js's injectVoiceVolumes) and by audio-player.js for mute
  (computeVoicesOff) — this module only owns the panel's DOM and ctx.state.mixer.

  The three comping sub-voices (root/3rd/5th) from the approved mockup are
  deliberately not here yet: ABCjs's comping voice is one chorded MIDI track
  (see lib/comping.js), so there's no hook to mix them independently without
  first splitting that voice in three for real. See CLAUDE.md's Mixer section
  for the plan.
*/
export function createMixer(ctx) {
  let open = false;
  let applyTimer = null;

  function commit() {
    applyTimer = null;
    persist();
    ctx.sheet.rerender();
  }

  function scheduleApply() {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(commit, APPLY_DEBOUNCE_MS);
  }

  function applyNow() {
    clearTimeout(applyTimer);
    applyTimer = null;
    persist();
    ctx.sheet.rerender();
  }

  function persist() {
    const m = ctx.state.mixer;
    writePref(VOLUME_PREF_KEY.melody, String(m.melodyVolume));
    writePref(VOLUME_PREF_KEY.backing, String(m.backingVolume));
    writePref(MUTED_PREF_KEY.melody, m.melodyMuted ? "1" : "0");
    writePref(MUTED_PREF_KEY.backing, m.backingMuted ? "1" : "0");
  }

  function updateStripVisual(channel) {
    const m = ctx.state.mixer;
    const percent = channel === "melody" ? m.melodyVolume : m.backingVolume;
    const muted = channel === "melody" ? m.melodyMuted : m.backingMuted;
    const ids = elementIds(channel);

    const fill = byId(ids.fill);
    if (fill) fill.style.width = `${percent}%`;

    const readout = byId(ids.readout);
    if (readout) readout.textContent = muted ? "Muted" : `${percent}%`;

    const muteBtn = byId(ids.muteBtn);
    if (muteBtn) {
      muteBtn.classList.toggle("is-muted", muted);
      muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
      const icon = muteBtn.querySelector(".fa-solid");
      if (icon) icon.classList.toggle("fa-volume-xmark", muted);
      if (icon) icon.classList.toggle("fa-volume-high", !muted);
      const label = `${muted ? "Unmute" : "Mute"} ${CHANNEL_LABEL[channel]}`;
      muteBtn.title = label;
      muteBtn.setAttribute("aria-label", label);
    }
  }

  // The backing-track channel only means anything once the current tune
  // actually has a comping voice playing — dim it and swap in an explainer
  // otherwise, rather than a fader that silently does nothing.
  function updateBusGate() {
    const bus = byId("mixerBus");
    if (bus) bus.classList.toggle("is-inactive", !ctx.state.compingActive);
  }

  function refresh() {
    CHANNELS.forEach(updateStripVisual);
    updateBusGate();
  }

  function wireStrip(channel) {
    const ids = elementIds(channel);
    const range = byId(ids.range);
    if (range) {
      range.value = String(ctx.state.mixer[`${channel}Volume`]);
      range.addEventListener("input", () => {
        ctx.state.mixer[`${channel}Volume`] = clampPercent(range.value);
        updateStripVisual(channel);
        scheduleApply();
      });
      range.addEventListener("change", applyNow);
    }
    on(ids.muteBtn, "click", () => {
      const key = `${channel}Muted`;
      ctx.state.mixer[key] = !ctx.state.mixer[key];
      updateStripVisual(channel);
      applyNow();
    });
  }

  // A fixed-position popover anchored under the button on desktop; the same
  // element becomes a bottom sheet under the 1024px breakpoint (CSS
  // !important overrides these inline coordinates there) — see split.css.
  function positionPanel() {
    const btn = byId("mixerBtn");
    const panel = byId("mixerPanel");
    if (!btn || !panel) return;
    const rect = btn.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 10}px`;
    panel.style.right = `${Math.max(REPOSITION_MARGIN, window.innerWidth - rect.right)}px`;
  }

  function setOpen(next) {
    open = next;
    const panel = byId("mixerPanel");
    const backdrop = byId("mixerBackdrop");
    const btn = byId("mixerBtn");
    if (panel) panel.hidden = !open;
    if (backdrop) backdrop.hidden = !open;
    if (btn) {
      btn.classList.toggle("active", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }
    if (open) {
      refresh();
      positionPanel();
    }
  }

  function init() {
    CHANNELS.forEach(wireStrip);

    on("mixerCloseBtn", "click", () => setOpen(false));
    on("mixerBackdrop", "click", () => setOpen(false));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && open) setOpen(false);
    });
    window.addEventListener("resize", () => {
      if (open) positionPanel();
    });

    refresh();
  }

  return {
    init,
    refresh,
    toggle() {
      setOpen(!open);
    },
  };
}

// The mixer's initial ctx.state.mixer slice, seeded from persisted prefs —
// built here (not inline in app.js) so the storedPercent/clampPercent
// defaulting logic lives next to the module that owns the rest of this state.
export function loadMixerState() {
  return {
    melodyVolume: storedPercent(VOLUME_PREF_KEY.melody),
    backingVolume: storedPercent(VOLUME_PREF_KEY.backing),
    melodyMuted: readPref(MUTED_PREF_KEY.melody) === "1",
    backingMuted: readPref(MUTED_PREF_KEY.backing) === "1",
  };
}

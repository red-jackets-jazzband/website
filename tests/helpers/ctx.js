import { createAppStore, bindAppPrefs } from "../../static/script/songs/core/state.js";
import { subscribeRerender } from "../../static/script/songs/sheet/sheet.js";
import { createNavigation } from "../../static/script/songs/core/navigation.js";

/*
  A minimal stand-in for the app's shared `ctx`, for testing songs/ modules in
  isolation. Pass overrides to swap in spies or seed state.
*/
export function makeCtx(overrides = {}) {
  // A real app store (songs/core/state.js), seeded with test-friendly
  // defaults; `overrides.state` is a flat { key: value } map on top of them.
  const store = createAppStore({
    allSongsLoaded: true,
    // A single implicit "Melody" voice, same as lib/audio-mix.js's
    // resolveMixerVoices would produce for an ordinary tune with no V:
    // declaration of its own and Comping off.
    mixerVoices: [{
      id: "1", index: 0, label: "Melody", slug: "melody", muted: false, program: null, volume: 100,
    }],
    mixer: {
      bassVolume: 100, chordsVolume: 100,
      bassMuted: true, chordsMuted: true,
      bassProgram: null, chordsProgram: null,
    },
    gchordPattern: "jazz",
    highQualityAudio: false,
    swing: 0,
    ...overrides.state,
  });
  // Persist changes the way the app does, without loading over the seed.
  bindAppPrefs(store, { load: false });
  const ctx = {
    store,
    state: store.state,
    readFile: overrides.readFile || (() => {}),
    storage: overrides.storage || (() => null),
    songName: overrides.songName || ((file) => file),
    sheet: {
      render: () => {},
      rerender: () => {},
      renderFromFile: () => {},
      renderIntoBooklet: () => {},
      ...overrides.sheet,
    },
    // `audio` is replaced wholesale when overridden — accessor properties
    // (transposeSemitones / chordOffset setters) don't survive object spread,
    // so a test that needs to observe them passes a complete object.
    audio: overrides.audio || {
      transposeSemitones: 0,
      chordOffset: 0,
      pickupBeats: 0,
      isPlaying: false,
      nativeQpm: 120,
      beatsPerMeasure: 4,
      setRepeatBoundaries: () => {},
      setRepeatCount: () => {},
      initForTune: () => {},
      setupNotationClickHandler: () => {},
      updateTempoLabel: () => {},
      stepTempo: () => {},
      playPause: () => {},
      stop: () => {},
    },
    mixer: overrides.mixer || {
      init: () => {}, toggle: () => {}, refresh: () => {}, syncVoices: () => {}, isOpen: () => false,
    },
    metronome: overrides.metronome || {
      init: () => {}, refresh: () => {}, onPlaybackChange: () => {}, onBarStart: () => {},
    },
    inspiration: {
      updateLink: () => {}, init: () => {}, isOpen: () => false, ...overrides.inspiration,
    },
    layers: {
      init: () => {}, setOpen: () => {}, toggle: () => {}, ...overrides.layers,
    },
    setlistData: overrides.setlistData,
    setlistHome: overrides.setlistHome,
    setlistModal: overrides.setlistModal,
    setlistPrint: {
      buildBooklet: () => {},
      print: () => {},
      setListenChangeHandler: () => {},
      getListenUrl: () => null,
      getListenSongs: () => [],
      getListenTitle: () => "",
      ...overrides.setlistPrint,
    },
    setlistView: overrides.setlistView,
    library: overrides.library,
  };
  // The real navigation service (it only touches the store and the page —
  // so only when there is a page: a DOM-less test gets no-op stand-ins),
  // with any of its methods swapped for a test's spies via `overrides.nav`.
  const nav = globalThis.document ? createNavigation(ctx) : {};
  ctx.nav = { ...nav, ...overrides.nav };
  // Like the real sheet, the stand-in re-renders on any store change that
  // needs it — so a test's `sheet.rerender` spy sees what the app would do.
  subscribeRerender(store, () => ctx.sheet.rerender());
  return ctx;
}

// An in-memory Storage, for setlists-store-backed modules.
export function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get length() {
      return map.size;
    },
  };
}

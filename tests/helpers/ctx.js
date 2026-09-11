/*
  A minimal stand-in for the app's shared `ctx`, for testing songs/ modules in
  isolation. Pass overrides to swap in spies or seed state.
*/
export function makeCtx(overrides = {}) {
  const ctx = {
    state: {
      allSongs: [],
      allSongsLoaded: true,
      setlistIndex: [],
      activeTab: "library",
      setlistsView: "home",
      currentPersonalId: null,
      currentOpenSongs: null,
      currentOpenSetlistName: "",
      currentOpenSetlistDesc: "",
      currentSongFile: null,
      currentSetlistSongIndex: null,
      currentLibraryIndex: null,
      currentSongText: undefined,
      compingActive: false,
      hasChords: false,
      tempoOverrideBpm: null,
      mixer: {
        melodyVolume: 100, bassVolume: 100, chordsVolume: 100, compingVolume: 100,
        melodyMuted: false, bassMuted: true, chordsMuted: true, compingMuted: false,
        melodyProgram: null, bassProgram: null, chordsProgram: null, compingProgram: null,
      },
      gchordPattern: "jazz",
      metronomeEnabled: false,
      highQualityAudio: false,
      swing: 0,
      ...overrides.state,
    },
    readFile: overrides.readFile || (() => {}),
    storage: overrides.storage || (() => null),
    songName: overrides.songName || ((file) => file),
    openLibrarySong: overrides.openLibrarySong || (() => {}),
    setSheetBackLabel: overrides.setSheetBackLabel || (() => {}),
    switchTab: overrides.switchTab || (() => {}),
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
      isPlaying: false,
      nativeQpm: 120,
      beatsPerMeasure: 4,
      setRepeatBoundaries: () => {},
      initForTune: () => {},
      setupNotationClickHandler: () => {},
      updateTempoLabel: () => {},
      stepTempo: () => {},
      playPause: () => {},
      stop: () => {},
    },
    mixer: overrides.mixer || { init: () => {}, toggle: () => {}, refresh: () => {} },
    metronome: overrides.metronome || { init: () => {}, refresh: () => {}, onPlaybackChange: () => {} },
    inspiration: { updateLink: () => {}, init: () => {}, ...overrides.inspiration },
    setlistData: overrides.setlistData,
    setlistHome: overrides.setlistHome,
    setlistModal: overrides.setlistModal,
    setlistPrint: { buildBooklet: () => {}, print: () => {}, ...overrides.setlistPrint },
    setlistView: overrides.setlistView,
    library: overrides.library,
  };
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

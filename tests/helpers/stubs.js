/*
  Shared test doubles for the browser globals the app leans on: Tonal (note
  math), ABCJS (engraving + synth) and the YouTube IFrame player. None of the
  real libraries run under node/jsdom, so tests install these instead.
*/

// ---------------------------------------------------------------------------
// Tonal — a small but arithmetically real subset, enough for the chord / scale
// math in comping.js and music-theory.js without the 200 KB browser bundle.
// ---------------------------------------------------------------------------

const SHARP_PC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const LETTER_CHROMA = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function pcChroma(pc) {
  const m = String(pc).match(/^([A-G])([#b]*)/);
  let acc = 0;
  for (const c of m[2]) acc += c === "#" ? 1 : -1;
  return (((LETTER_CHROMA[m[1]] + acc) % 12) + 12) % 12;
}

function pcAdd(pc, semis) {
  return SHARP_PC[(pcChroma(pc) + ((semis % 12) + 12)) % 12];
}

export function nameToMidi(name) {
  const m = String(name).match(/^([A-G])([#b]*)(-?\d+)$/);
  if (!m) return null;
  return (Number.parseInt(m[3], 10) + 1) * 12 + pcChroma(m[1] + m[2]);
}

export const tonalStub = {
  Scale: {
    get(name) {
      const m = name.match(/^([A-G][#b]*)\s+(\w+)$/);
      if (!m) return { notes: [] };
      const steps = m[2] === "minor" ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
      return { notes: steps.map((s) => pcAdd(m[1], s)) };
    },
  },
  Chord: {
    get(name) {
      const s = String(name);
      if (!/^[A-G]/.test(s)) return { notes: [] };
      let i = 1;
      while (s[i] === "#" || s[i] === "b") i += 1;
      const root = s.slice(0, i);
      const q = s.slice(i);
      const third = /^(m|-|dim|°|o)/.test(q) ? 3 : 4;
      let fifth = 7;
      if (/^(dim|°|o)/.test(q)) fifth = 6;
      else if (/^(aug|\+)/.test(q)) fifth = 8;
      return { notes: [root, pcAdd(root, third), pcAdd(root, fifth)] };
    },
  },
  Note: { midi: nameToMidi },
  Interval: {
    distance: (a, b) => ({ a, b }),
    semitones: (d) => (((pcChroma(d.b) - pcChroma(d.a)) % 12) + 12) % 12,
  },
  AbcNotation: {
    scientificToAbcNotation(sci) {
      const m = sci.match(/^([A-G])([#b]*)(-?\d+)$/);
      const acc = m[2].replace(/#/g, "^").replace(/b/g, "_");
      const oct = Number.parseInt(m[3], 10);
      const body = oct >= 5
        ? m[1].toLowerCase() + "'".repeat(oct - 5)
        : m[1] + ",".repeat(Math.max(0, 4 - oct));
      return acc + body;
    },
    abcToScientificNotation(abc) {
      const m = abc.match(/^([_^=]*)([A-Ga-g])([,']*)$/);
      if (!m) return null;
      const acc = m[1].replace(/\^/g, "#").replace(/_/g, "b").replace(/=/g, "");
      let oct = m[2] === m[2].toLowerCase() ? 5 : 4;
      for (const c of m[3]) oct += c === "'" ? 1 : -1;
      return m[2].toUpperCase() + acc + oct;
    },
  },
};

// Run `fn` with `globalThis.Tonal` set to the stub, then restore.
export function withTonal(fn) {
  const real = globalThis.Tonal;
  globalThis.Tonal = tonalStub;
  try {
    return fn();
  } finally {
    if (real === undefined) delete globalThis.Tonal;
    else globalThis.Tonal = real;
  }
}

// ---------------------------------------------------------------------------
// ABCJS — records the calls the sheet pipeline makes and hands back the
// minimum shape the orchestration reads.
// ---------------------------------------------------------------------------

export function createAbcjsStub({ audioSupported = false } = {}) {
  const calls = { renderAbc: [], parseOnly: [], setTune: [] };

  function fakeTune(text) {
    return {
      metaText: { title: "Stub Tune", url: undefined },
      lines: [{ staff: [{ key: { root: "C", acc: "", mode: "" }, voices: [[]] }] }],
      _source: text,
    };
  }

  const stub = {
    calls,
    renderAbc(target, abc, params) {
      calls.renderAbc.push({ target, abc, params });
      return [fakeTune(abc)];
    },
    parseOnly(abc, params) {
      calls.parseOnly.push({ abc, params });
      return [fakeTune(abc)];
    },
    TimingCallbacks: function TimingCallbacks() {
      this.noteTimings = [];
    },
    synth: {
      supportsAudio: () => audioSupported,
      SynthController: function SynthController() {
        // Mirrors ABCjs 6.6.4: play() toggles `isStarted` (resume/pause both
        // go through it), setTune() resets it, pause() leaves it untouched.
        this.isStarted = false;
        this.load = (_target, cursorControl) => { stub.cursorControl = cursorControl; };
        this.setTune = (tune, opts, params) => {
          calls.setTune.push({ tune, opts, params });
          this.isStarted = false;
          return Promise.resolve();
        };
        this.play = () => { this.isStarted = !this.isStarted; return Promise.resolve(); };
        this.pause = () => {};
        // ABCjs's real setWarp() ends with an internal seek that fires one
        // event callback; mirror that so tests can prove the highlight guard.
        this.setWarp = () => {
          if (stub.cursorControl && stub.cursorControl.onEvent) {
            stub.cursorControl.onEvent({ elements: stub._warpEventElements || [] });
          }
          return Promise.resolve();
        };
      },
    },
  };
  return stub;
}

export function withAbcjs(stub, fn) {
  const real = globalThis.ABCJS;
  globalThis.ABCJS = stub;
  try {
    return fn();
  } finally {
    if (real === undefined) delete globalThis.ABCJS;
    else globalThis.ABCJS = real;
  }
}

// ---------------------------------------------------------------------------
// YouTube IFrame player — a controllable fake with the getters/setters the
// LoopTube toolbar calls.
// ---------------------------------------------------------------------------

export function fakeYtPlayer({ duration = 200, time = 0, rate = 1 } = {}) {
  const state = { duration, time, rate, seeks: [], rates: [0.25, 0.5, 1, 1.5, 2] };
  return {
    state,
    getCurrentTime: () => state.time,
    getDuration: () => state.duration,
    getPlaybackRate: () => state.rate,
    getAvailablePlaybackRates: () => state.rates.slice(),
    setPlaybackRate: (r) => { state.rate = r; },
    seekTo: (t) => { state.time = t; state.seeks.push(t); },
    playVideo: () => {},
    pauseVideo: () => {},
    stopVideo: () => {},
    loadVideoById: (id) => { state.loadedId = id; },
  };
}

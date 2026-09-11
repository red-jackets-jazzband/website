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

function fakeTune(text) {
  return {
    metaText: { title: "Stub Tune", url: undefined },
    lines: [{ staff: [{ key: { root: "C", acc: "", mode: "" }, voices: [[]] }] }],
    _source: text,
  };
}

// A minimal AudioBuffer-shaped stand-in for what a real offline render would
// hand back — enough for wav-export.js's encodeWav() to consume.
function fakeAudioBuffer() {
  return {
    numberOfChannels: 1,
    sampleRate: 44100,
    length: 2,
    getChannelData: () => Float32Array.from([0, 0.5]),
  };
}

export function createAbcjsStub({ audioSupported = false, exportAudioBuffer } = {}) {
  const calls = {
    renderAbc: [], parseOnly: [], setTune: [], synthControllers: [], createSynths: [],
  };

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
        // Recorded per instance (`this._cursorControl`), not just on the
        // stub as a whole, so a test can hang onto an earlier controller's
        // own cursorControl after a later initForTune() has overwritten
        // `stub.cursorControl` — needed to simulate a torn-down controller's
        // callback firing late.
        this.load = (_target, cursorControl) => {
          this._cursorControl = cursorControl;
          stub.cursorControl = cursorControl;
        };
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
          if (this._cursorControl && this._cursorControl.onEvent) {
            this._cursorControl.onEvent({ elements: stub._warpEventElements || [] });
          }
          return Promise.resolve();
        };
        calls.synthControllers.push(this);
      },
      // songs/wav-export.js's offline render: init() then prime() resolve
      // once, populating audioBuffers[0] the way the real library does.
      CreateSynth: function CreateSynth() {
        this.audioBuffers = [];
        this.init = (opts) => {
          calls.createSynths.push({ instance: this, init: opts });
          return Promise.resolve();
        };
        this.prime = () => {
          this.audioBuffers = exportAudioBuffer === null ? [] : [exportAudioBuffer || fakeAudioBuffer()];
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
// AudioContext — songs/metronome.js's Web Audio scheduling target. jsdom
// implements no Web Audio API at all, so this is a from-scratch fake: a
// single shared `instance` the test can read/advance directly (`currentTime`,
// `oscillators`), plus a constructor function that always returns that same
// instance — `new AudioCtor()` behaves like the real `new AudioContext()`
// (a constructor returning an object short-circuits `new`'s own instance).
// ---------------------------------------------------------------------------

export function createAudioContextStub({ currentTime = 0 } = {}) {
  const instance = {
    state: "running",
    currentTime,
    destination: {},
    resumeCalls: 0,
    constructorCalls: 0,
    oscillators: [],
    gains: [],
    createOscillator() {
      const osc = {
        type: null,
        frequency: { value: 0 },
        startedAt: null,
        stoppedAt: null,
        connect: () => osc,
        start(t) { osc.startedAt = t; },
        stop(t) { osc.stoppedAt = t; },
      };
      instance.oscillators.push(osc);
      return osc;
    },
    createGain() {
      const events = [];
      const node = {
        gain: {
          setValueAtTime: (v, t) => events.push(["set", v, t]),
          linearRampToValueAtTime: (v, t) => events.push(["linear", v, t]),
          exponentialRampToValueAtTime: (v, t) => events.push(["exp", v, t]),
        },
        events,
        connect: () => node,
      };
      instance.gains.push(node);
      return node;
    },
    resume() {
      instance.resumeCalls += 1;
      instance.state = "running";
      return Promise.resolve();
    },
  };
  function FakeAudioContext() {
    instance.constructorCalls += 1;
    return instance;
  }
  return { Ctor: FakeAudioContext, instance };
}

// Run `fn` with `window.AudioContext` set to the given constructor, then restore.
export function withAudioContext(Ctor, fn) {
  const real = window.AudioContext;
  window.AudioContext = Ctor;
  try {
    return fn();
  } finally {
    if (real === undefined) delete window.AudioContext;
    else window.AudioContext = real;
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

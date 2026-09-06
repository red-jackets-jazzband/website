"use strict";

// Pure helpers for the Inspiration player's LoopTube toolbar — A/B loop-range
// math, timeline positioning and playback-rate stepping. All DOM / YT.Player
// orchestration lives in render_abc.js.

var DEFAULT_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

// "0:05", "1:23", "1:02:03" (h:mm:ss only once past an hour).
export function formatClock(seconds) {
  var s = Math.max(0, Math.floor(Number(seconds) || 0));
  var h = Math.floor(s / 3600);
  var m = Math.floor((s % 3600) / 60);
  var sec = s % 60;
  if (h > 0) return h + ":" + pad(m) + ":" + pad(sec);
  return m + ":" + pad(sec);
}

// Position 0..1 of `time` within a clip of `duration` seconds.
export function timeToFraction(time, duration) {
  var d = Number(duration) || 0;
  if (d <= 0) return 0;
  return clamp01((Number(time) || 0) / d);
}

// Inverse of timeToFraction — seconds for a 0..1 position.
export function fractionToTime(fraction, duration) {
  var d = Number(duration) || 0;
  return clamp01(Number(fraction) || 0) * d;
}

// Given the two raw markers (either may be null), returns an ordered
// { a, b } with b - a >= minGapSeconds, or null when it isn't a usable loop.
export function normalizeLoop(a, b, minGapSeconds) {
  if (a == null || b == null) return null;
  var lo = Math.min(a, b);
  var hi = Math.max(a, b);
  if (hi - lo < (minGapSeconds || 0)) return null;
  return { a: lo, b: hi };
}

// While dragging one handle, keep it on its side of the other by at least
// minGapFraction. `side` is "a" (must stay left of B) or "b" (right of A).
export function clampHandleDrag(fraction, otherFraction, side, minGapFraction) {
  var f = clamp01(fraction);
  var other = clamp01(otherFraction);
  var gap = minGapFraction || 0;
  if (side === "a") return Math.min(f, Math.max(0, other - gap));
  return Math.max(f, Math.min(1, other + gap));
}

// Next entry in `rates` from `current` moving `direction` (-1 slower, +1
// faster), clamped at the ends. `rates` is YT's getAvailablePlaybackRates()
// (ascending); falls back to a sane default set.
export function stepPlaybackRate(current, direction, rates) {
  var list = (rates && rates.length)
    ? rates.slice().sort(function(x, y) { return x - y; })
    : DEFAULT_RATES.slice();
  var next = nearestIndex(list, current) + (direction < 0 ? -1 : 1);
  if (next < 0) next = 0;
  if (next > list.length - 1) next = list.length - 1;
  return list[next];
}

// How far before B to fire the seek so playback doesn't audibly overshoot:
// covers one poll tick at the current rate, plus margin, floored at 0.12s.
export function loopLeadSeconds(playbackRate, intervalMs) {
  var rate = Number(playbackRate) || 1;
  var interval = Number(intervalMs) || 0;
  return Math.max(0.12, (rate * interval / 1000) * 1.5);
}

// True when the play head has reached the loop's tail (within `lead`) or has
// drifted well before A — i.e. it's time to seek back to A.
export function shouldLoopSeek(currentTime, a, b, lead) {
  var t = Number(currentTime);
  if (!isFinite(t)) return false;
  if (t >= b - (lead || 0)) return true;
  if (t < a - 0.5) return true;
  return false;
}

function pad(n) {
  return n < 10 ? "0" + n : String(n);
}

function clamp01(n) {
  if (!(n > 0)) return 0;
  if (n > 1) return 1;
  return n;
}

function nearestIndex(list, value) {
  var v = Number(value) || 1;
  var best = 0;
  var bestDist = Infinity;
  for (var i = 0; i < list.length; i++) {
    var d = Math.abs(list[i] - v);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

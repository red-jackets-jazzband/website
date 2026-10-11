// Pure decision for dragging a bottom sheet down to dismiss it (the Layers
// panel's grip, songs/layers/sheet-drag.js). Given how far it was pulled down
// (`dy`, px), how long the gesture took (`dt`, ms) and the sheet's height,
// decide whether it should close or spring back.

const DEFAULTS = {
  tapDistance: 6, // px or less is a tap on the handle, which also closes
  closeFraction: 0.3, // pulled past this share of the sheet's height
  flickSpeed: 0.5, // px/ms — a quick flick closes it from much less
  flickDistance: 24, // ...but only past this much travel
};

export function shouldDismissSheet(dy, dt, height, opts = {}) {
  const { tapDistance, closeFraction, flickSpeed, flickDistance } = { ...DEFAULTS, ...opts };
  if (dy <= tapDistance) return dy >= 0 && dt < 300;
  if (height > 0 && dy >= height * closeFraction) return true;
  return dy >= flickDistance && dy / Math.max(dt, 1) >= flickSpeed;
}

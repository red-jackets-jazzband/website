import { byId, el } from "../../lib/core/dom.js";
import { INSTRUMENTS } from "../../lib/music/instruments.js";
import { COMPING_PATTERNS } from "../../lib/music/comping.js";
import { SOLO_STYLES } from "../../lib/music/solo.js";
import {
  PRACTICE_EXERCISES, PRACTICE_RHYTHMS, PRACTICE_RUNS, RUN_EXERCISES,
} from "../../lib/music/practice.js";
import { COMPING_PARTS } from "./state.js";
import { tl } from "../../lib/core/i18n.js";

function dropdown(select) {
  return el("div", { class: "dropdown" }, select);
}

/*
  The Instrument <select> (#instrument): the chart is transposed and clef-set
  for whichever instrument is chosen. Lives in the sheet's button bar (#sheetStatus,
  falling back to #sheetmenu) right next to Key / Tempo / Play. A view of
  ctx.state.instrument (songs/sheet/state.js, sticky across songs): a pick
  writes the store, and the select redraws from it.
*/
export function createInstrumentDropdown(ctx) {
  const select = el("select", {
    class: "dropbtn",
    id: "instrument",
    // aria-label only — a stray text node leaks into the styleable
    // (appearance: base-select) picker as a phantom first row.
    attrs: { "aria-label": tl("instrument", "Instrument") },
  }, INSTRUMENTS.map((instrument) => el("option", {
    value: instrument.value,
    text: instrument.label.toUpperCase(),
  })));

  const draw = () => {
    if (select.value !== ctx.state.instrument) select.value = ctx.state.instrument;
  };
  draw();
  ctx.store.subscribe("settings", draw);

  select.addEventListener("change", () => {
    ctx.state.instrument = select.value;
  });

  const mount = byId("sheetStatus") || byId("sheetmenu");
  if (mount) mount.append(dropdown(select));
}

/*
  The comping-pattern <select> (#comping): an "OFF" entry plus the 15
  predefined patterns from lib/comping.js, grouped into optgroups. A view of
  ctx.state.comping (sticky across songs); sheet.js turns the pattern into
  the coloured block-chord comping staff.
*/
export function createCompingDropdown(ctx) {
  const slot = byId("compingSlot");
  if (!slot) return;

  const select = el("select", { class: "dropbtn", id: "comping" },
    el("option", { value: "off", text: tl("comping_off", "COMPING: OFF") }));

  const groups = new Map();
  for (const pattern of COMPING_PATTERNS) {
    if (!groups.has(pattern.group)) {
      const optgroup = el("optgroup", { label: pattern.group.toUpperCase() });
      groups.set(pattern.group, optgroup);
      select.append(optgroup);
    }
    groups.get(pattern.group).append(
      el("option", { value: pattern.value, text: pattern.label.toUpperCase() }),
    );
  }

  const split = createCompingSplit(ctx);
  const draw = () => {
    if (select.value !== ctx.state.comping) select.value = ctx.state.comping;
    split.draw();
  };
  select.addEventListener("change", () => {
    ctx.state.comping = select.value;
  });

  slot.append(dropdown(select), ...split.nodes);
  draw();
  ctx.store.subscribe("settings", draw);
}

const ARIA_PRESSED = "aria-pressed";

/*
  The Split button next to the comping dropdown (#compingSplitBtn) and the
  R / 3 / 5 toggles (.comping-part-btn) it reveals: split replaces the one
  block-chord staff with a single-note staff per chord tone, and the toggles
  pick which of those staves are drawn — e.g. just the 3 and the 5 to print.
  Views of ctx.state.compingSplit / compingParts (sticky across songs). At
  least one tone always stays selected. Both are hidden while comping is
  off; the toggles also while it isn't split.
*/
function createCompingSplit(ctx) {
  const splitBtn = el("button", {
    type: "button", class: "sheet-icon-btn", id: "compingSplitBtn",
    attrs: {
      [ARIA_PRESSED]: "false",
      title: tl("comping_split_title", "Split comping into R / 3 / 5 voices"),
      "aria-label": tl("comping_split_aria", "Split comping into separate R, 3 and 5 voices"),
    },
  }, el("span", { class: "fa-solid fa-diagram-predecessor", attrs: { "aria-hidden": "true" } }));
  const group = el("div", {
    class: "comping-parts", id: "compingParts", attrs: { role: "group", "aria-label": tl("comping_parts_aria", "Comping voices to show") },
  });
  const partBtns = COMPING_PARTS.map((name, index) => el("button", {
    type: "button", class: "comping-part-btn", text: name,
    attrs: {
      "data-part": String(index),
      [ARIA_PRESSED]: "false",
      title: tl("comping_part_show", "Show the {name} voice", { name }),
    },
  }));
  group.append(...partBtns);

  function draw() {
    const { comping, compingSplit, compingParts } = ctx.state;
    const on = comping !== "off";
    splitBtn.setAttribute(ARIA_PRESSED, String(compingSplit));
    splitBtn.hidden = !on;
    splitBtn.classList.toggle("active", compingSplit);
    group.hidden = !(on && compingSplit);
    partBtns.forEach((btn, index) => btn.setAttribute(ARIA_PRESSED, String(compingParts.includes(index))));
  }

  splitBtn.addEventListener("click", () => {
    ctx.state.compingSplit = !ctx.state.compingSplit;
  });
  partBtns.forEach((btn, index) => {
    btn.addEventListener("click", () => {
      const parts = ctx.state.compingParts;
      const pressed = parts.includes(index);
      if (pressed && parts.length === 1) return;
      ctx.state.compingParts = pressed
        ? parts.filter((p) => p !== index)
        : [...parts, index].sort((a, b) => a - b);
    });
  });

  return { nodes: [splitBtn, group], draw };
}

/*
  The solo <select> (#solo), built the same way as the comping one: an "OFF"
  entry plus one entry per solo style from lib/solo.js — a view of
  ctx.state.solo. Creating it switches ctx.state.soloEnabled on (until then
  sheet.js ignores the stored pick); sheet.js evolves the line and adds it as
  another staff (and the Mixer mutes the lead while it plays).
*/
export function createSoloDropdown(ctx) {
  const slot = byId("soloSlot");
  if (!slot) return;

  const select = el("select", { class: "dropbtn", id: "solo" },
    el("option", { value: "off", text: tl("solo_off", "SOLO: OFF") }));
  for (const style of SOLO_STYLES) {
    select.append(el("option", { value: style.value, text: style.label.toUpperCase() }));
  }

  ctx.state.soloEnabled = true;
  const draw = () => {
    if (select.value !== ctx.state.solo) select.value = ctx.state.solo;
  };
  draw();
  ctx.store.subscribe("settings", draw);

  select.addEventListener("change", () => {
    ctx.state.solo = select.value;
  });

  // Progress of the background composing (written by sheet.js).
  const status = el("span", {
    class: "sheet-solo-status", id: "soloStatus", attrs: { role: "status", "aria-live": "polite" },
  });
  slot.append(dropdown(select), status);
}

/*
  The practice pickers in #practiceSlot, views of the settings slice like the
  comping one: the exercise (#practice: "OFF" plus lib/music/practice.js's
  PRACTICE_EXERCISES), and — once one is on — its rhythm (#practiceRhythm:
  varied, or one pattern the whole way) and, for the run exercises, the
  shape of its runs (#practiceRuns). sheet.js appends the exercise as one
  more staff (Comping / Solo stay as they are, and the lead keeps playing,
  so it can be played along with).
*/
export function createPracticeDropdown(ctx) {
  const slot = byId("practiceSlot");
  if (!slot) return;

  const exercise = el("select", { class: "dropbtn", id: "practice" },
    el("option", { value: "off", text: tl("practice_off", "PRACTICE: OFF") }));
  for (const entry of PRACTICE_EXERCISES) {
    exercise.append(el("option", { value: entry.value, text: entry.label.toUpperCase() }));
  }
  const rhythm = el("select", {
    class: "dropbtn", id: "practiceRhythm", attrs: { "aria-label": tl("practice_rhythm_aria", "Practice rhythm") },
  }, el("option", { value: "varied", text: tl("practice_rhythm_varied", "RHYTHM: VARIED") }));
  for (const entry of PRACTICE_RHYTHMS) {
    rhythm.append(el("option", { value: entry.value, text: entry.label.toUpperCase() }));
  }
  const runs = el("select", {
    class: "dropbtn", id: "practiceRuns", attrs: { "aria-label": tl("practice_runs_aria", "Practice runs") },
  });
  for (const entry of PRACTICE_RUNS) {
    runs.append(el("option", { value: entry.value, text: entry.label.toUpperCase() }));
  }
  const rhythmBox = dropdown(rhythm);
  const runsBox = dropdown(runs);

  const pickers = [[exercise, "practice"], [rhythm, "practiceRhythm"], [runs, "practiceRuns"]];
  const draw = () => {
    for (const [select, key] of pickers) {
      if (select.value !== ctx.state[key]) select.value = ctx.state[key];
    }
    const on = ctx.state.practice !== "off";
    rhythmBox.hidden = !on;
    runsBox.hidden = !on || !RUN_EXERCISES.has(ctx.state.practice);
  };
  draw();
  ctx.store.subscribe("settings", draw);

  for (const [select, key] of pickers) {
    select.addEventListener("change", () => {
      ctx.state[key] = select.value;
    });
  }
  slot.append(dropdown(exercise), rhythmBox, runsBox);
}

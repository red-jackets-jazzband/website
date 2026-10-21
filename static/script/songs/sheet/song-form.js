import { byId, el, qsa } from "../../lib/core/dom.js";
import { readPref, removePref, songFormPrefKey, writePref } from "../../lib/core/preferences.js";
import { tl } from "../../lib/core/i18n.js";
import {
  MORE, addPart, addRound, cloneRounds, deleteRound, duplicateRound, formText, movePart,
  moveRound, partChoices, readStoredForm, removePart, removeRepeat, roundsFromTables,
  roundsToRows, sameForm, sameRound, setText, writeStoredForm,
} from "../../lib/music/song-form.js";
import { buildFormStrip, renderWordsTables } from "./form-strip.js";
import { fitSongForms } from "./chord-table.js";
import { createFormDrag } from "./form-drag.js";

/*
  A visitor's own version of a song's form, next to the band's.

  The band's form is the strip sheet.js draws under the chord table from the
  tune's `W:|` table (published as `tune.formTables`). Under it sits a small
  pencil; it opens an editor below the strip: one card per round, with its
  part chips (tap to remove, drag to reorder or into another round), buttons
  to add a part or "..." (as long as it takes), what plays and a note. The
  strip follows every edit. Save keeps the version in this browser only
  (rj.songForm.<file>, lib/music/song-form.js's stored shape); a version that
  matches the band's exactly isn't kept. Once there is one, a two-icon switch
  beside the pencil flips between the band's form and it, and while it shows
  the strip is framed in gold with a dot on every round that differs. The
  editor can hand the form over as the W: lines a song's .abc file carries,
  for the band's own scores.

  Its state is per song and lives here, not in a store slice: which version
  shows is stored with the version itself, and the editor closes whenever
  another song opens. It redraws after every live render (a `tune` publish),
  since the render draws the band's strip afresh.
*/

// Who usually plays a round, offered as the "Who plays" field's suggestions
// (with whatever the band's form already says). Written as the band's .abc
// files write them.
const LEAD_SUGGESTIONS = [
  "Collective", "Vocals", "Clarinet solo", "Trumpet solo", "Trombone solo",
  "Banjo solo", "Sousaphone solo", "Drum solo",
];
const DATALIST_ID = "songFormWho";
const ICON_BTN = "songForm-icon-btn";

function icon(name) {
  return el("span", { class: `fa-solid ${name}`, attrs: { "aria-hidden": "true" } });
}

// An icon-only button; `focus` names it for focus to come back to after a redraw.
function iconButton(cls, iconName, label, onClick, focus) {
  return el("button", {
    type: "button",
    class: cls,
    attrs: { "aria-label": label, title: label, "data-focus": focus },
    on: { click: onClick },
  }, [icon(iconName)]);
}

function partLabel(name) {
  return name === MORE ? "…" : name;
}

// Put the focus back on the control a redraw replaced, when it's still there.
function refocus(container, key) {
  if (!key || !container) return;
  const target = container.querySelector(`[data-focus="${key}"]`);
  if (target) target.focus();
}

// Copy `text` from `textarea`: the Clipboard API where there is one (Safari 13.1+),
// else the old select-and-copy.
function copyText(textarea, text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  textarea.select();
  // No Clipboard API on the old browsers this fallback is for.
  document.execCommand("copy"); // NOSONAR
  return Promise.resolve();
}

export function createSongForm(ctx) {
  let file = null;
  let band = [];
  let choices = [];
  let mine = null; // the visitor's rounds, or null
  let show = "band"; // which one the strip shows when not editing
  let draft = null; // the rounds being edited, or null
  let textOpen = false;

  const drag = createFormDrag({ onDrop: dropped });

  const editing = () => draft !== null;
  const showingMine = () => show === "mine" && mine !== null;

  function shownRounds() {
    if (editing()) return draft;
    return showingMine() ? mine : band;
  }

  function load(songFile) {
    file = songFile;
    const stored = songFile ? readStoredForm(readPref(songFormPrefKey(songFile))) : null;
    mine = stored ? stored.rounds : null;
    show = stored ? stored.show : "band";
    draft = null;
    textOpen = false;
  }

  function persist() {
    if (!file) return;
    if (mine === null) removePref(songFormPrefKey(file));
    else writePref(songFormPrefKey(file), writeStoredForm(mine, show));
  }

  // ---- the strip -----------------------------------------------------------

  function mineStrip(rounds) {
    return buildFormStrip(roundsToRows(rounds), {
      changed: rounds.map((round, i) => !sameRound(round, band[i])),
      mine: true,
    });
  }

  // The band's strip(s) as the render drew them, or the visitor's version in
  // their place; returns the last one (or the chord table when there's none).
  function drawStrip(chordEl) {
    const parent = chordEl.parentNode;
    if (!editing() && !showingMine()) {
      renderWordsTables(chordEl, ctx.state.formTables);
    } else {
      qsa(".songForm", parent).forEach((old) => old.remove());
      if (shownRounds().length > 0) chordEl.after(mineStrip(shownRounds()));
    }
    const strips = qsa(".songForm", parent);
    return strips.length > 0 ? strips[strips.length - 1] : chordEl;
  }

  // Redraw only the strip, while typing in the editor (rebuilding the editor
  // would take the focus out of the field).
  function redrawStrip() {
    const chordEl = byId("chordtable");
    if (!chordEl || !chordEl.parentNode) return;
    drawStrip(chordEl);
    fitSongForms(chordEl);
  }

  // ---- the switch and the pencil -------------------------------------------

  function switchButton(which, iconName, label) {
    const pressed = which === "mine" ? showingMine() : !showingMine();
    return el("button", {
      type: "button",
      class: `songForm-switch-btn songForm-switch-btn--${which}${pressed ? " is-active" : ""}`,
      attrs: { "aria-pressed": String(pressed), "aria-label": label, title: label, "data-focus": `show-${which}` },
      on: { click: () => setShow(which) },
    }, [icon(iconName)]);
  }

  function tools() {
    const editLabel = mine
      ? tl("form_edit_mine", "Edit my version of the song form")
      : tl("form_edit_new", "Make your own version of the song form");
    return el("div", { class: "songForm-tools" }, [
      mine ? el("div", { class: "songForm-switch", attrs: { role: "group", "aria-label": tl("form_which", "Which song form") } }, [
        switchButton("band", "fa-users", tl("form_band", "The band's form")),
        switchButton("mine", "fa-user", tl("form_mine", "My version")),
      ]) : null,
      iconButton(ICON_BTN, "fa-pen", editLabel, startEdit, "edit"),
    ]);
  }

  // ---- the editor ----------------------------------------------------------

  function edit(next, focus) {
    draft = next;
    draw(focus);
  }

  function chip(round, i, name, j) {
    const label = name === MORE
      ? tl("form_remove_more", "Stop repeating round {n} as long as it takes", { n: i + 1 })
      : tl("form_remove_part", "Remove part {part} from round {n}", { part: name, n: i + 1 });
    const node = el("button", {
      type: "button",
      class: name === MORE ? "songForm-chip songForm-chip--more" : "songForm-chip",
      dataset: { part: String(j) },
      attrs: { "aria-label": label, title: name === MORE ? tl("form_more", "Repeat as long as it takes") : label, "data-focus": `part-${i}-${j}` },
      on: {
        click: () => {
          if (!drag.clickWasDrag()) edit(removePart(draft, i, j), `card-${i}`);
        },
        keydown: (e) => chipKey(e, i, j),
        pointerdown: (e) => drag.begin(e, node, { kind: "part", round: i, part: j }),
      },
    }, [partLabel(name), el("span", { class: "songForm-chip-x", attrs: { "aria-hidden": "true" }, text: "×" })]);
    return node;
  }

  // Arrow keys move a focused chip within its round; Delete removes it.
  function chipKey(e, i, j) {
    const parts = draft[i].parts;
    let to = null;
    if (e.key === "ArrowLeft") to = j - 1;
    else if (e.key === "ArrowRight") to = j + 1;
    if (to !== null) {
      e.preventDefault();
      if (to < 0 || to >= parts.length) return;
      const next = movePart(draft, { round: i, part: j }, i, to);
      // A "..." stays last, so a move onto or off it changes nothing.
      const moved = next[i].parts.join(" ") !== parts.join(" ");
      edit(next, `part-${i}-${moved ? to : j}`);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      edit(removePart(draft, i, j), `card-${i}`);
    }
  }

  function addButton(i, name) {
    const label = name === MORE
      ? tl("form_add_more", "Repeat round {n} as long as it takes", { n: i + 1 })
      : tl("form_add_part", "Add part {part} to round {n}", { part: name, n: i + 1 });
    return el("button", {
      type: "button",
      class: "songForm-add-part",
      attrs: { "aria-label": label, title: label, "data-focus": `add-${i}-${name}` },
      on: { click: () => edit(addPart(draft, i, name), `add-${i}-${name}`) },
    }, `+ ${partLabel(name)}`);
  }

  function textField(round, i, field) {
    const isLead = field === "lead";
    const input = el("input", {
      type: "text",
      class: isLead ? "songForm-field songForm-field--lead" : "songForm-field",
      value: round[field],
      placeholder: isLead ? tl("form_who", "Who plays") : tl("form_note", "Note"),
      attrs: {
        "aria-label": isLead
          ? tl("form_who_round", "Who plays in round {n}", { n: i + 1 })
          : tl("form_note_round", "Note for round {n}", { n: i + 1 }),
        list: isLead ? DATALIST_ID : null,
        "data-focus": `${field}-${i}`,
      },
      on: {
        input: () => {
          draft = setText(draft, i, field, input.value);
          redrawStrip();
        },
      },
    });
    return input;
  }

  function card(round, i) {
    const grip = el("span", {
      class: "songForm-grip",
      attrs: { "aria-hidden": "true", title: tl("form_drag_round", "Drag to move round {n}", { n: i + 1 }) },
      on: {
        pointerdown: (e) => {
          e.preventDefault();
          drag.begin(e, cardNode, { kind: "round", round: i });
        },
      },
    }, [icon("fa-grip-vertical")]);
    const adds = choices.map((name) => addButton(i, name));
    if (!round.parts.includes(MORE)) adds.push(addButton(i, MORE));
    const repeat = round.repeat ? el("button", {
      type: "button",
      class: "songForm-chip songForm-chip--repeat",
      attrs: { "aria-label": tl("form_remove_repeat", "Remove {repeat} from round {n}", { repeat: round.repeat, n: i + 1 }) },
      on: { click: () => edit(removeRepeat(draft, i), `card-${i}`) },
    }, [round.repeat, el("span", { class: "songForm-chip-x", attrs: { "aria-hidden": "true" }, text: "×" })]) : null;
    const last = draft.length - 1;
    const up = iconButton(ICON_BTN, "fa-chevron-up", tl("form_up", "Move round {n} up", { n: i + 1 }), () => edit(moveRound(draft, i, i - 1), `up-${i - 1}`), `up-${i}`);
    const down = iconButton(ICON_BTN, "fa-chevron-down", tl("form_down", "Move round {n} down", { n: i + 1 }), () => edit(moveRound(draft, i, i + 1), `down-${i + 1}`), `down-${i}`);
    up.disabled = i === 0;
    down.disabled = i === last;
    const cardNode = el("div", {
      class: sameRound(round, band[i]) ? "songForm-card" : "songForm-card is-changed",
      dataset: { round: String(i) },
      attrs: { tabindex: "-1", "data-focus": `card-${i}` },
    }, [
      el("div", { class: "songForm-card-top" }, [
        el("div", { class: "songForm-card-parts" }, [
          grip,
          el("span", { class: "songForm-card-num", text: String(i + 1) }),
          ...round.parts.map((name, j) => chip(round, i, name, j)),
          repeat,
          ...adds,
        ]),
        el("div", { class: "songForm-card-actions" }, [
          up,
          down,
          iconButton(ICON_BTN, "fa-copy", tl("form_duplicate", "Duplicate round {n}", { n: i + 1 }), () => edit(duplicateRound(draft, i), `card-${i + 1}`), `dup-${i}`),
          iconButton(`${ICON_BTN} songForm-icon-btn--danger`, "fa-trash-can", tl("form_delete", "Delete round {n}", { n: i + 1 }), () => edit(deleteRound(draft, i), "addRound"), `del-${i}`),
        ]),
      ]),
      el("div", { class: "songForm-card-fields" }, [textField(round, i, "lead"), textField(round, i, "note")]),
    ]);
    return cardNode;
  }

  function leadSuggestions() {
    const names = [];
    [...band.map((round) => round.lead), ...LEAD_SUGGESTIONS].forEach((name) => {
      if (name && !names.includes(name)) names.push(name);
    });
    return el("datalist", { id: DATALIST_ID }, names.map((name) => el("option", { value: name })));
  }

  function textPanel() {
    const text = formText(draft);
    const area = el("textarea", {
      class: "songForm-text-area",
      readOnly: true,
      rows: Math.max(2, draft.length),
      value: text,
      attrs: { "aria-label": tl("form_text", "Song form as text"), "data-focus": "text", spellcheck: "false" },
    });
    const copyBtn = el("button", { type: "button", class: "songForm-btn songForm-btn--primary" }, tl("form_copy", "Copy"));
    copyBtn.addEventListener("click", () => {
      copyText(area, text).then(() => {
        copyBtn.textContent = tl("form_copied", "Copied ✓");
      }, () => area.select());
    });
    return el("div", { class: "songForm-text" }, [
      area,
      el("div", { class: "songForm-text-actions" }, [
        el("button", {
          type: "button",
          class: "songForm-btn",
          on: { click: () => setTextOpen(false) },
        }, tl("form_close", "Close")),
        copyBtn,
      ]),
    ]);
  }

  function editor() {
    return el("section", { class: "songForm-editor", attrs: { "aria-label": tl("form_editor", "Edit your song form") } }, [
      leadSuggestions(),
      ...draft.map((round, i) => card(round, i)),
      el("button", {
        type: "button",
        class: "songForm-add-round",
        attrs: { "data-focus": "addRound" },
        on: { click: () => edit(addRound(draft, choices), `lead-${draft.length}`) },
      }, [icon("fa-plus"), ` ${tl("form_add_round", "Add a round")}`]),
      el("div", { class: "songForm-footer" }, [
        iconButton(ICON_BTN, "fa-rotate-left", tl("form_restart", "Back to the band's form"), () => edit(cloneRounds(band), "restart"), "restart"),
        iconButton(ICON_BTN, "fa-file-lines", tl("form_copy_text", "Copy as text"), () => setTextOpen(!textOpen), "copyText"),
        el("span", { class: "songForm-footer-gap" }),
        el("button", { type: "button", class: "songForm-btn", on: { click: cancel } }, tl("form_cancel", "Cancel")),
        el("button", { type: "button", class: "songForm-btn songForm-btn--primary", on: { click: save } }, tl("form_save", "Save")),
      ]),
      textOpen ? textPanel() : null,
    ]);
  }

  // ---- drawing -------------------------------------------------------------

  // Everything under the chord table: the strip, then the pencil (and switch),
  // or the editor while editing. `focus` names the control to focus after.
  function draw(focus) {
    const chordEl = byId("chordtable");
    if (!chordEl || !chordEl.parentNode || ctx.state.currentSongText === undefined) return;
    const parent = chordEl.parentNode;
    qsa(".songForm-tools, .songForm-editor", parent).forEach((old) => old.remove());
    const last = drawStrip(chordEl);
    const below = editing() ? editor() : tools();
    last.after(below);
    fitSongForms(chordEl);
    refocus(parent, focus);
  }

  // ---- actions -------------------------------------------------------------

  function setShow(which) {
    show = which;
    persist();
    draw(`show-${which}`);
  }

  function startEdit() {
    let start = cloneRounds(mine || band);
    if (start.length === 0) start = addRound([], choices);
    textOpen = false;
    // The card, not its text field: on a phone a field would pop the keyboard up.
    edit(start, "card-0");
  }

  function cancel() {
    draft = null;
    textOpen = false;
    draw("edit");
  }

  function save() {
    if (sameForm(draft, band)) {
      mine = null;
      show = "band";
    } else {
      mine = cloneRounds(draft);
      show = "mine";
    }
    persist();
    cancel();
  }

  function setTextOpen(open) {
    textOpen = open;
    draw(open ? "text" : "copyText");
  }

  function dropped(source, target) {
    if (source.kind === "round") {
      edit(moveRound(draft, source.round, target.round), `card-${target.round}`);
    } else {
      edit(movePart(draft, source, target.round, target.part), `card-${target.round}`);
    }
  }

  // A live render drew the band's strip afresh: draw over it, and pick up the
  // song's own version when another song opened.
  ctx.store.subscribe("tune", (tune) => {
    const songFile = ctx.state.currentSongFile;
    if (songFile !== file) load(songFile);
    band = roundsFromTables(tune.formTables);
    choices = partChoices(tune.currentSongText, band);
    draw();
  });

  return {
    // For the tour and tests: open or close the editor.
    setEditing(open) {
      if (open && !editing()) startEdit();
      if (!open && editing()) cancel();
    },
  };
}

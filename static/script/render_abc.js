"use strict";

import { INSTRUMENTS, offsetForInstrument, changeClefForInstrument } from "./lib/instruments.js";
import { parseChordScheme, simplifyBlues, simplifySong, computeChordOffset } from "./lib/chords.js";
import { irealProFromAbc } from "./lib/irealpro.js";
import { convertChordsToRoman } from "./lib/music-theory.js";
import { youtubeEmbedUrl } from "./lib/youtube.js";
import { COMPING_PATTERNS, buildCompingTune } from "./lib/comping.js";

/*
   Funcion: renderSong
   `path` is always a bare .abc filename (from a hash link or the library
   list) — always resolved against /songs/.
*/
export function renderSong(path) {
  readFile("/songs/" + path, function(text) {
    renderSongTextWithOverride(text, 0);
  });
}

/*
   Funcion: renderSongTextWithOverride
   Same reset-then-render sequence as renderSong, but for a caller that
   already has the ABC text in hand (song_library.js, opening a setlist song
   that needs its key preset from a per-song override) and wants the Key
   stepper preset to a computed semitone value instead of always starting
   at 0.
*/
export function renderSongTextWithOverride(text, transposeSemitones) {
  document.getElementById("transpose").value = transposeSemitones || 0;
  tempoBpm = null;
  audioPlayer.melodOff = false;
  renderAbcFile(text);
}

export function rerenderFile() {
  if (window.current_song !== undefined) {
    renderAbcFile(window.current_song);
  }
}

/*
   Function: stylePartMarkers
   Draw a small square outline around every part marker (P: field), keeping
   the black letter as-is. Must run after each render since abcjs rebuilds
   the SVG.
*/
function stylePartMarkers(containerId) {
  var container = document.getElementById(containerId);
  if (!container) return;
  var SVGNS = "http://www.w3.org/2000/svg";
  var padX = 3, padY = 1;
  container.querySelectorAll("text.abcjs-part").forEach(function(txt) {
    if (txt.previousSibling && txt.previousSibling.classList &&
        txt.previousSibling.classList.contains("abcjs-part-bg")) return;
    var bbox;
    try { bbox = txt.getBBox(); } catch (e) { return; }
    var rect = document.createElementNS(SVGNS, "rect");
    rect.setAttribute("class", "abcjs-part-bg");
    rect.setAttribute("x", bbox.x - padX);
    rect.setAttribute("y", bbox.y - padY);
    rect.setAttribute("width", bbox.width + 2 * padX);
    rect.setAttribute("height", bbox.height + 2 * padY);
    rect.setAttribute("fill", "none");
    rect.setAttribute("stroke", "#000");
    rect.setAttribute("stroke-width", "1");
    txt.parentNode.insertBefore(rect, txt);
  });
}

/*
   Funcion: renderAbcFile
   Render a song from a abc text
   Parameters:
       text - String containing (valid) abc file
*/
export function renderAbcFile(text, notationElt, chordTableElt, songTitleElt, titlePrefix, add_link, extraTransposeSteps) {

  notationElt = (typeof notationElt !== 'undefined') ?  notationElt : "notation";
  chordTableElt = (typeof chordTableElt !== 'undefined') ?  chordTableElt : "chordtable";
  songTitleElt = (typeof songTitleElt !== 'undefined') ?  songTitleElt : "songtitle";
  titlePrefix = (typeof titlePrefix !== 'undefined') ?  titlePrefix : "";
  add_link = (typeof add_link !== 'undefined') ?  add_link : true;
  extraTransposeSteps = (typeof extraTransposeSteps !== 'undefined') ? Number(extraTransposeSteps) : 0;

  // A booklet/export render (any target other than the on-screen "notation")
  // must be reproducible from the setlist alone: its transposition comes only
  // from the setlist's own per-song key override (extraTransposeSteps) plus
  // the selected instrument's offset folded in below — never from the Key
  // stepper's transient on-screen value, which belongs to whichever single
  // song happens to be open in the sheet.
  var isBookletRender = notationElt !== "notation";
  var transposeInput = document.getElementById("transpose");
  // Don't use valueAsNumber to let IE users also enjoy transposing
  var stepperSteps = (!isBookletRender && transposeInput !== null) ? Number(transposeInput.value) : 0;
  var transpose_steps = stepperSteps + extraTransposeSteps;
  // The Key stepper (+ a setlist's key override) is a real request to hear
  // the song in a different key, so it should shift the audio too — stash
  // it before the instrument's own offset is folded in below, since that
  // offset only exists to make the notation read correctly for whichever
  // instrument is selected and must NOT change how the tune actually
  // sounds (every instrument's audio plays back in the same concert pitch).
  // Guarded to the main sheet's own render so a booklet/export pass over
  // other songs never clobbers it for the song actually on screen.
  if (!isBookletRender) {
    audioPlayer.transposeSemitones = transpose_steps;
  }
  var instrumentSelect = document.getElementById("instrument");
  var instrumentTextEl = document.getElementById("instrumentText");
  if (instrumentTextEl) {
    instrumentTextEl.innerHTML = instrumentSelect.options[instrumentSelect.selectedIndex].text.toLowerCase();
  }

  // Check if there are voice definitions with instrument-related attributes
  const hasInstrumentVoices = text.match(/^V:\d+.*(clef=|transpose=|name=)/gm);

  if (!hasInstrumentVoices) {
    text = changeClefForInstrument(instrumentSelect.value, text);
    transpose_steps += offsetForInstrument(instrumentSelect.value);
  }

  window.current_song = text;
  var song = string_to_abc_tune(text, transpose_steps);
  var chords = parseChordScheme(song);
  var displayChords = (instrumentSelect.value === 'concert_+_roman')
    ? convertChordsToRoman(chords, song)
    : chords;
  audioPlayer.chordOffset = computeChordOffset(song);

  // Comping: on the live sheet only (never a setlist booklet), when a rhythm
  // pattern is picked, add a second staff below the melody — one voice of
  // block chords, one black stem per hit, with each chord's noteheads
  // colour-keyed by chord-tone function (root / third / fifth). It's generated
  // from the tune in *concert* pitch (parsed fresh at visualTranspose 0) and
  // injected into `text`, so the single visualTranspose passed to
  // ABCJS.renderAbc below transposes the melody and the comping together — no
  // separate transposition pass.
  var renderText = text;
  var compingPalette = null;
  compingActive = false;
  var sheetMenuEl = document.getElementById("sheetmenu");
  var advancedOn = sheetMenuEl !== null && sheetMenuEl.classList.contains("show-advanced");
  var compingSelect = document.getElementById("comping");
  var compingValue = compingSelect ? compingSelect.value : "off";
  if (!isBookletRender && advancedOn && compingValue && compingValue !== "off" && chords.length > 0) {
    var concertSong = string_to_abc_tune(text, 0);
    var concertChords = parseChordScheme(concertSong);
    var compingTune = buildCompingTune(text, concertChords, concertSong, compingValue);
    if (compingTune) {
      renderText = compingTune.abc;
      compingPalette = compingTune.palette;
      compingActive = true;
    }
  }

  if (add_link) {
    add_inspiration_link(song.metaText.url, song.metaText.title);
    add_irealpro_link(song, chords);
  }

  // Phone layout: #rjSheet (and #notation inside it) starts display:none
  // until a song is active. Must happen before ABCJS.renderAbc() runs below
  // — its "responsive: resize" mode measures the container's width at
  // render time, and a display:none container measures as 0, producing a
  // degenerate zero-height SVG that a later display change won't fix.
  if (notationElt === "notation") {
    document.body.classList.add("rj-sheet-active");
  }

  // The setlist print booklet engraves each song into its own off-screen
  // container (see #setlistPrintBooklet in split.css). Two reasons it needs a
  // plain fixed-width render rather than the sheet's "responsive: resize":
  //   1. responsive mode sets inline styles on the notation element
  //      (display:inline-block, a padding-bottom % box, overflow:hidden) that
  //      then fight the print stylesheet — e.g. "Print chordbook" can't hide
  //      the staves because the inline display beats a plain CSS rule.
  //   2. its width comes from measuring the container, which is brittle for a
  //      box that's only ever visible during printing.
  // A fixed staffwidth sized to the A4 print column sidesteps both.
  // (isBookletRender is computed near the top of this function.)

  var abcParams = {
    visualTranspose: transpose_steps,
    responsive: isBookletRender ? undefined : "resize",
    staffwidth: isBookletRender ? 700 : 1000,
    paddingTop: 0,
    paddingBottom: 0,
    add_classes: true,
    jazzchords:true,
    oneSvgPerLine:true,
    format: {
      annotationfont: "MuseJazzText italic",
      composerfont: "MuseJazzText",
      footerfont: "MuseJazzText",
      gchordfont: "MuseJazzText",
      headerfont: "MuseJazzText",
      historyfont: "MuseJazzText",
      infofont: "MuseJazzText",
      measurefont: "MuseJazzText",
      partsfont: "MuseJazzText italic",
      repeatfont: "MuseJazzText",
      subtitlefont: "MuseJazzText",
      tabgracefont: "MuseJazzText",
      tablabelfont: "MuseJazzText",
      tabnumberfont: "MuseJazzText",
      tempofont: "MuseJazzText",
      textfont: "MuseJazzText",
      titlefont: "MuseJazzText 4",
      tripletfont: "MuseJazzText",
      vocalfont: "MuseJazzText",
      voicefont: "MuseJazzText",
      wordsfont: "MuseJazzText",
    }
  };

  // Marks the notation as carrying a comping staff (used for print tweaks).
  document.getElementById(notationElt).classList.toggle("comping-active", compingActive);

  var visualObjs = ABCJS.renderAbc(notationElt, renderText, abcParams);

  // Colour the comping voice's chord noteheads by chord-tone function. ABCjs
  // only exposes a notehead's *vertical* position within its chord
  // (.abcjs-chord-pos-N), but voice-leading means position ≠ function, so we
  // zip the rendered onsets against buildCompingTune's palette instead of
  // using CSS. Safe against abcjs's resize handler (it rescales the SVG's
  // viewBox, it doesn't re-render), and re-applied on every full re-render.
  if (compingActive) {
    applyCompingColors(notationElt, compingPalette);
  }

  /* Hide title below chord table */
  document
    .getElementById(notationElt)
    .querySelectorAll(".abcjs-title")
    .forEach(function(el) {
      el.setAttribute("display", "none");
    });

  /* Part markers (P: fields): render as white letters on black squares */
  stylePartMarkers(notationElt);

  var chordtable = document.getElementById(chordTableElt);
  create_chord_table(displayChords, chordtable);
  if (notationElt === "notation") {
    updateRepeatBoundaries();
  }

  /* Add own title, above chordTable */
  var songtitle = document.getElementById(songTitleElt);
  songtitle.innerHTML = titlePrefix.concat(song.metaText.title);

  /* Initialize audio player for the main songs page */
  if (notationElt === "notation" && visualObjs && visualObjs.length > 0) {
    initAudioForTune(visualObjs[0]);
    setupNotationClickHandler();
    updateTempoLabel();
  }

  // Move W: lyric SVGs out of notation so the printer can paginate between them
  var lyricsEl = document.getElementById('lyrics');
  if (lyricsEl) {
    lyricsEl.innerHTML = '';
    var notEl = document.getElementById(notationElt);
    var moved = false;
    notEl.querySelectorAll('svg').forEach(function(svg) {
      if (svg.querySelector('.abcjs-unaligned-words')) {
        lyricsEl.appendChild(svg);
        moved = true;
      }
    });
    lyricsEl.style.display = moved ? '' : 'none';
  }
}

/*
   Funcion: readFile
   Read a file from an address
   Parameters:
       file - Path to file to read
       callback - Function to call with data if loaded succesfully
       onError - Optional, called with the HTTP status if the request fails
                 (e.g. a setlist referencing a .abc file that doesn't exist)
*/
export function readFile(file, callback, onError) {
  var f = new XMLHttpRequest();
  f.onreadystatechange = function() {
    if (f.readyState === 4) {
      if (f.status === 200 || f.status === 0) {
        callback(f.responseText);
      } else if (onError) {
        onError(f.status);
      }
    }
  };
  f.open("GET", file, true);
  f.send(null);
}

function string_to_abc_tune(text, transpose_steps) {
  var tunes = ABCJS.parseOnly(text, { visualTranspose: transpose_steps });
  return tunes[0];
}

/*
   Funcion: create_chord_table
   Create a table from a list of chords
   Returns:
       chords - A list of lists with the chords per measure
*/
function create_chord_table(chords, chordtable) {
  chords = simplifyBlues(chords);
  chords = simplifySong(chords, 8);

  var cols = 4;
  if (chords.length > 4 * 4) {
    cols = 8;
  }

  // A CSS grid rather than a <table>: cells are a flat sequence in the same
  // left-to-right, top-to-bottom order the old row/col math produced, but
  // how many columns they wrap into is controlled by CSS (and can change
  // at narrow widths) instead of being baked into the DOM at render time.
  // Cell order/count must stay exactly this sequence — playback highlighting
  // (cursorControl.onEvent) looks up chord cells by flat index.
  var grid = document.createElement("DIV");
  grid.classList.add("chordGrid");
  grid.style.setProperty("--chord-cols", cols);

  for (var i = 0; i < chords.length; i++) {
    var cell = document.createElement("DIV");
    var chordDiv = document.createElement("DIV");
    chordDiv.classList.add("chordDiv");
    chordDiv.innerHTML = chords[i].text;
    cell.appendChild(chordDiv);
    cell.classList.add("chordCell");

    if (chords[i].doubeThinBarLeft !== undefined) {
      cell.classList.add("chordCellDoubleThinBarLeft");
    }
    if (chords[i].doubeThinBarRight !== undefined) {
      cell.classList.add("chordCellDoubleThinBarRight");
    }

    if (chords[i].rightRepeat !== undefined) {
      cell.classList.add("chordCellRightRepeat");
      var rightSpan = document.createElement("span");
      rightSpan.classList.add("chordRightRepeatSign");
      rightSpan.innerHTML = ":";
      chordDiv.appendChild(rightSpan);
    }
    if (chords[i].leftRepeat !== undefined) {
      cell.classList.add("chordCellLeftRepeat");
      var leftSpan = document.createElement("span");
      leftSpan.classList.add("chordLeftRepeatSign");
      leftSpan.innerHTML = ":";
      chordDiv.insertBefore(leftSpan, chordDiv.childNodes[0]);
    }

    grid.appendChild(cell);
  }

  chordtable.innerHTML = "";
  chordtable.appendChild(grid);
}

/*
   Funcion: add_inspiration_link
   Adds a button to the sheetmenu if an abc tune contains a F field. The
   button opens the reference recording in the docked picture-in-picture
   panel (see openInspirationPanel below) rather than leaving the page —
   it just updates its own url/title in place if the currently-open song
   changes; it never touches an already-open panel, so a video someone is
   playing along to keeps playing while they browse to a different song.
*/
function add_inspiration_link(url, title) {
  var btn = document.getElementById("inspirationLink");
  if (url !== undefined) {
    if (btn === null) {
      btn = document.createElement("BUTTON");
      btn.type = "button";
      btn.innerHTML = "Inspiration";
      btn.id = "inspirationLink";
      btn.className = "sheet-inspiration-link";
      btn.addEventListener("click", function() {
        toggleInspirationPanel(btn.dataset.url, btn.dataset.title);
      });
      var slot = document.getElementById("inspirationSlot");
      if (slot) slot.appendChild(btn);
    }
    btn.dataset.url = url;
    btn.dataset.title = title || "";
  } else if (btn !== null) {
    btn.parentNode.removeChild(btn);
  }
}

var inspirationPanelUrl = null;

/*
   Funcion: toggleInspirationPanel
   Clicking Inspiration for the song already showing in the panel closes
   it (stopping playback); clicking it for a different song swaps the
   panel to that song's video, opening it if needed.
*/
function toggleInspirationPanel(url, title) {
  var panel = document.getElementById("inspirationPanel");
  if (!panel) return;
  if (!panel.hidden && inspirationPanelUrl === url) {
    closeInspirationPanel();
  } else {
    openInspirationPanel(url, title);
  }
}

function openInspirationPanel(url, title) {
  var panel = document.getElementById("inspirationPanel");
  var frame = document.getElementById("inspirationVideoFrame");
  if (!panel || !frame) return;
  var embedUrl = youtubeEmbedUrl(url, true);
  if (!embedUrl) return;

  var titleEl = document.getElementById("inspirationPanelTitle");
  if (titleEl) titleEl.textContent = title || "Inspiration";
  var expandLink = document.getElementById("inspirationExpandBtn");
  if (expandLink) expandLink.href = url;

  frame.src = embedUrl;
  inspirationPanelUrl = url;
  panel.hidden = false;
}

function closeInspirationPanel() {
  var panel = document.getElementById("inspirationPanel");
  var frame = document.getElementById("inspirationVideoFrame");
  if (!panel) return;
  panel.hidden = true;
  if (frame) frame.src = "";
  inspirationPanelUrl = null;
}

/*
   Funcion: initInspirationPanel
   Wires the close button and lets the panel be dragged to any corner by
   its header, per the design's "keeps playing while you switch songs"
   picture-in-picture player. Position switches from the default
   bottom-right anchor (right/bottom in CSS) to an explicit left/top pair
   on the first drag.
*/
function initInspirationPanel() {
  var panel = document.getElementById("inspirationPanel");
  var header = document.getElementById("inspirationPanelHeader");
  var closeBtn = document.getElementById("inspirationCloseBtn");
  if (!panel || !header) return;

  if (closeBtn) closeBtn.addEventListener("click", closeInspirationPanel);

  var drag = null;
  header.addEventListener("pointerdown", function(e) {
    if (e.target.closest(".inspiration-panel-icon-btn")) return;
    var rect = panel.getBoundingClientRect();
    drag = { startX: e.clientX, startY: e.clientY, startLeft: rect.left, startTop: rect.top };
    header.setPointerCapture(e.pointerId);
    panel.classList.add("dragging");
  });
  header.addEventListener("pointermove", function(e) {
    if (!drag) return;
    var maxLeft = window.innerWidth - panel.offsetWidth - 8;
    var maxTop = window.innerHeight - panel.offsetHeight - 8;
    var left = Math.min(Math.max(8, drag.startLeft + (e.clientX - drag.startX)), Math.max(8, maxLeft));
    var top = Math.min(Math.max(8, drag.startTop + (e.clientY - drag.startY)), Math.max(8, maxTop));
    panel.style.left = left + "px";
    panel.style.top = top + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  });
  header.addEventListener("pointerup", function(e) {
    drag = null;
    panel.classList.remove("dragging");
    if (header.hasPointerCapture(e.pointerId)) header.releasePointerCapture(e.pointerId);
  });
}

/*
   Funcion: add_irealpro_link
   Adds an icon button to the sheet's action cluster that opens the chart in
   iReal Pro (available on iOS, Android, macOS and Windows). Only shown for
   tunes that actually have a chord scheme to hand over.
*/
function add_irealpro_link(song, chords) {

  var link = document.getElementById("iRealPro");
  if (chords.length === 0) {
    if (link !== null) link.parentNode.removeChild(link);
    return;
  }
  var url = irealProFromAbc(song, chords);
  if (link !== null) {
    link.href = url;
  } else {
    link = document.createElement("A");
    link.innerHTML = '<img src="/images/irealpro_mark_white.webp" alt="" aria-hidden="true" class="irealpro-logo">';
    link.href = url;
    link.id = "iRealPro";
    link.className = "sheet-icon-btn";
    link.title = "Open in iReal Pro";
    link.setAttribute("aria-label", "Open in iReal Pro");
    var actions = document.getElementById("sheetActions");
    if (actions) actions.appendChild(link);
  }
}

/*
   Funcion: parse_song_from_hash
   Parse which song os the currently selected song and render that (usefull for sharing)
   Returns:
       hash - Hash of the window.location
*/
function parse_song_from_hash(hash) {
  var hash2Obj = parseQueryString(hash.substring(1));

  renderSong(hash2Obj.s + ".abc");
}

function parseQueryString(queryString) {
  var params = {},
    queries,
    temp,
    i,
    l;
  // Split into key/value pairs
  queries = queryString.split("&");
  // Convert the array of strings into an object
  for (i = 0, l = queries.length; i < l; i++) {
    temp = queries[i].split("=");
    params[temp[0]] = temp[1];
  }
  return params;
}

export function loadSongs() {
  createInstrumentDropdown();
  document.getElementById("instrument").addEventListener("change", rerenderFile);
  createCompingDropdown();
  initAdvancedToggle();
  initPrintLink();
  initSheetControls();
  initInspirationPanel();

  if (window.location.hash) {
    parse_song_from_hash(window.location.hash);
  }
}

/*
   Funcion: initAdvancedToggle
   Wires the double-chevron button in the sheet menu that reveals the
   "advanced" controls (currently just the comping dropdown; more later).
   The open/closed state lives as `.show-advanced` on #sheetmenu and is
   persisted in localStorage. Toggling re-renders so the comping staff
   appears/disappears with the control.
*/
var ADVANCED_STORAGE_KEY = "rj.sheetAdvanced";

function initAdvancedToggle() {
  var btn = document.getElementById("advancedToggleBtn");
  var menu = document.getElementById("sheetmenu");
  if (!btn || !menu) return;

  function apply(on) {
    menu.classList.toggle("show-advanced", on);
    btn.setAttribute("aria-expanded", on ? "true" : "false");
    btn.title = on ? "Fewer controls" : "More controls";
  }

  var stored = false;
  try {
    stored = window.localStorage.getItem(ADVANCED_STORAGE_KEY) === "1";
  } catch (e) {
    stored = false;
  }
  apply(stored);

  btn.addEventListener("click", function() {
    var on = !menu.classList.contains("show-advanced");
    apply(on);
    try {
      window.localStorage.setItem(ADVANCED_STORAGE_KEY, on ? "1" : "0");
    } catch (e) {
      // localStorage unavailable — the preference just won't persist.
    }
    rerenderFile();
  });
}

/*
   Funcion: clearBookletPrintState
   Strips any leftover setlist-booklet print classes from <body>. The setlist
   "Print …" buttons add these and remove them again on "afterprint", but a
   stale class (or a browser that skips the event) would otherwise drag the
   last-built booklet into an unrelated single-song print.
*/
export function clearBookletPrintState() {
  var body = document.body;
  body.classList.remove("export-booklet-mode");
  Array.prototype.slice.call(body.classList).forEach(function(cls) {
    if (cls.indexOf("export-mode-") === 0) body.classList.remove(cls);
  });
}

/*
   Funcion: initPrintLink
   Wires up the (shared) #printLink to window.print().
*/
export function initPrintLink() {
  var link = document.getElementById("printLink");
  if (link) {
    link.addEventListener("click", function(e) {
      e.preventDefault();
      clearBookletPrintState();
      window.print();
    });
  }
}

/*
   Funcion: initSheetControls
   Wires up the sheet controls (transpose input, audio buttons) that used
   to carry inline onclick/oninput attributes.
*/
function initSheetControls() {
  var transpose = document.getElementById("transpose");
  if (transpose) transpose.addEventListener("input", rerenderFile);

  var keyUpBtn = document.getElementById("keyUpBtn");
  if (keyUpBtn) keyUpBtn.addEventListener("click", function() { stepTranspose(1); });
  var keyDownBtn = document.getElementById("keyDownBtn");
  if (keyDownBtn) keyDownBtn.addEventListener("click", function() { stepTranspose(-1); });

  var tempoUpBtn = document.getElementById("tempoUpBtn");
  if (tempoUpBtn) tempoUpBtn.addEventListener("click", function() { stepTempo(TEMPO_STEP); });
  var tempoDownBtn = document.getElementById("tempoDownBtn");
  if (tempoDownBtn) tempoDownBtn.addEventListener("click", function() { stepTempo(-TEMPO_STEP); });

  var playBtn = document.getElementById("playPauseBtn");
  if (playBtn) playBtn.addEventListener("click", playPause);

  var stopBtn = document.getElementById("stopBtn");
  if (stopBtn) stopBtn.addEventListener("click", stopAudio);

  var melodyBtn = document.getElementById("melodyOffBtn");
  if (melodyBtn) melodyBtn.addEventListener("click", toggleMelody);

  var backBtn = document.getElementById("sheetBackBtn");
  if (backBtn) {
    backBtn.addEventListener("click", function() {
      document.body.classList.remove("rj-sheet-active");
    });
  }

}

/*
   Funcion: stepTranspose
   Nudges the Key stepper's underlying #transpose value by one semitone and
   dispatches an "input" event, reusing the existing listener that re-renders
   the chart — the stepper buttons are a visual restyle, not a new code path.
*/
function stepTranspose(delta) {
  var input = document.getElementById("transpose");
  if (!input) return;
  var next = Number(input.value || 0) + delta;
  next = Math.max(Number(input.min), Math.min(Number(input.max), next));
  input.value = next;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

// ============================================================
// Tempo control (playback speed only — the engraved notation is unaffected).
// Musicians think in bpm, not percent, so the stepper shows and steps a
// real bpm number. tempoBpm === null means "follow the tune's own Q: field"
// (the default for every newly-opened song); stepping it the first time
// seeds it from that native tempo (or DEFAULT_BPM, for a tune with no Q:
// field to read).
// ============================================================

var DEFAULT_BPM = 120;
var TEMPO_STEP = 4;
var TEMPO_MIN_BPM = 40;
var TEMPO_MAX_BPM = 320;
var tempoBpm = null;

function stepTempo(delta) {
  var base = tempoBpm !== null ? tempoBpm : (audioPlayer.nativeQpm || DEFAULT_BPM);
  tempoBpm = Math.max(TEMPO_MIN_BPM, Math.min(TEMPO_MAX_BPM, base + delta));
  updateTempoLabel();
  applyTempo();
}

function updateTempoLabel() {
  var label = document.getElementById("tempoValueLabel");
  if (!label) return;
  var bpm = tempoBpm !== null ? tempoBpm : (audioPlayer.nativeQpm || DEFAULT_BPM);
  label.textContent = Math.round(bpm);
}

/*
   Function: currentWarpPercent
   ABCJS's synth expresses playback speed as a "warp" percentage of the
   tune's own engraved tempo (100 = play at the Q: field's bpm), not as an
   absolute bpm. Convert our real-bpm target into that percentage.
   tempoBpm === null means "no override" -> 100%.
*/
function currentWarpPercent() {
  if (tempoBpm === null) return 100;
  var native = audioPlayer.nativeQpm || DEFAULT_BPM;
  return Math.max(1, Math.round((tempoBpm / native) * 100));
}

/*
   Funcion: applyTempo
   Applies the current tempo to the live SynthController via its `setWarp`
   method. An earlier version passed a `qpm` option to `setTune` instead,
   but SynthController ignores that for playback in ABCJS 6.6.3 — `go()`
   drives the MIDI buffer purely from the tune's own millisecondsPerMeasure
   and `warp`, so the stepper had no audible effect. `setWarp` re-primes the
   buffer at the new speed and resumes playback itself if it was running.
   We render the (hidden) warp slider — `displayWarp: true` in
   initAudioForTune — precisely so `setWarp`'s internal `control.setWarp`
   call finds its `.abcjs-midi-tempo` element instead of throwing.
*/
function applyTempo() {
  var ctrl = audioPlayer.synthController;
  if (!ctrl || typeof ctrl.setWarp !== "function") return;
  Promise.resolve(ctrl.setWarp(currentWarpPercent()))
    .then(function() {
      if (ctrl !== audioPlayer.synthController) return;
      // setWarp restarts playback itself when it was already running.
      audioPlayer.isPlaying = !!ctrl.isStarted;
      updatePlayButton();
    })
    .catch(function(err) {
      console.warn("Tempo change failed:", err);
    });
}

/*
   Instrument profile persistence (localStorage): whichever instrument you
   last picked is what the sheet preselects next time. Guarded with try/catch so private
   browsing / disabled storage degrades to today's no-persistence behavior
   instead of throwing.
*/
var INSTRUMENT_STORAGE_KEY = "rj.instrument";

function readStoredInstrument() {
  try {
    return window.localStorage.getItem(INSTRUMENT_STORAGE_KEY);
  } catch (e) {
    return null;
  }
}

function storeInstrument(value) {
  try {
    window.localStorage.setItem(INSTRUMENT_STORAGE_KEY, value);
  } catch (e) {
    // localStorage unavailable — nothing to do, instrument choice just won't persist.
  }
}

export function createInstrumentDropdown() {
  var div = document.createElement("DIV");
  div.classList.add("dropdown");

  var select = document.createElement("SELECT");
  select.classList.add("dropbtn");
  // aria-label only — a stray text node here leaks into the styleable
  // (appearance: base-select) picker as a phantom first row.
  select.setAttribute("aria-label", "Instrument");
  select.id = "instrument";
  div.appendChild(select);

  INSTRUMENTS.forEach(function(instrument) {
    var option = document.createElement("OPTION");
    option.innerHTML = instrument.label.toUpperCase();
    option.value = instrument.value;
    select.appendChild(option);
  });

  var storedValue = readStoredInstrument();
  if (storedValue && INSTRUMENTS.some(function(instrument) { return instrument.value === storedValue; })) {
    select.value = storedValue;
  }
  select.addEventListener("change", function() {
    storeInstrument(select.value);
  });

  // Mounted into #sheetStatus — the left-hand slot in the sheet's button
  // bar that used to hold a read-only "current instrument" caption. The
  // dropdown replaces that caption outright: it's always visible right
  // next to Key/Tempo/Play, and it's now the thing you actually change,
  // not just a label reflecting a choice made elsewhere.
  var menu = document.getElementById("sheetStatus") ||
    document.getElementById("sheetmenu");
  menu.appendChild(div);
}

/*
   Comping selection persistence (localStorage): sticky across songs like the
   instrument choice, guarded so private browsing degrades gracefully.
*/
var COMPING_STORAGE_KEY = "rj.comping";

function readStoredComping() {
  try {
    return window.localStorage.getItem(COMPING_STORAGE_KEY);
  } catch (e) {
    return null;
  }
}

function storeComping(value) {
  try {
    window.localStorage.setItem(COMPING_STORAGE_KEY, value);
  } catch (e) {
    // localStorage unavailable — the comping choice just won't persist.
  }
}

/*
   Funcion: createCompingDropdown
   Builds the sheet's comping-pattern <select> (#comping): an "OFF" entry plus
   the 15 predefined patterns from lib/comping.js, grouped into optgroups.
   Changing it re-renders the current song, which is where buildCompingTune
   turns the chord scheme into the coloured 3-voice comping staff.
*/
export function createCompingDropdown() {
  var slot = document.getElementById("compingSlot");
  if (!slot) return;

  var div = document.createElement("DIV");
  div.classList.add("dropdown");

  var select = document.createElement("SELECT");
  select.classList.add("dropbtn");
  select.id = "comping";
  div.appendChild(select);

  var offOption = document.createElement("OPTION");
  offOption.innerHTML = "COMPING: OFF";
  offOption.value = "off";
  select.appendChild(offOption);

  var currentGroup = null;
  var groupEl = null;
  COMPING_PATTERNS.forEach(function(pattern) {
    if (pattern.group !== currentGroup) {
      currentGroup = pattern.group;
      groupEl = document.createElement("OPTGROUP");
      groupEl.label = pattern.group.toUpperCase();
      select.appendChild(groupEl);
    }
    var option = document.createElement("OPTION");
    option.innerHTML = pattern.label.toUpperCase();
    option.value = pattern.value;
    groupEl.appendChild(option);
  });

  var storedValue = readStoredComping();
  if (storedValue &&
      (storedValue === "off" ||
       COMPING_PATTERNS.some(function(p) { return p.value === storedValue; }))) {
    select.value = storedValue;
  }

  select.addEventListener("change", function() {
    storeComping(select.value);
    rerenderFile();
  });

  slot.appendChild(div);
}

/*
  applyCompingColors: colour the comping voice's chord noteheads by chord-tone
  function. `palette` (from buildCompingTune) has one ["R","3","5"] entry per
  chord onset in the comping voice, bottom-to-top; ABCjs renders those onsets
  left-to-right as `g.abcjs-note.abcjs-v1` groups, each notehead / accidental
  tagged `.abcjs-chord-pos-N` (N up from the bottom). We zip the two and set an
  inline fill. The stacked "R / 3 / 5" voice label is tinted to match.
*/
var COMPING_FN_FILL = { R: "#222222", "3": "var(--rj-gold)", "5": "var(--rj-hover)" };

function applyCompingColors(notationElt, palette) {
  if (!palette || !palette.length) return;
  var root = document.getElementById(notationElt);
  var groups = root.querySelectorAll("g.abcjs-note.abcjs-v1");
  var idx = 0;
  groups.forEach(function (g) {
    var marks = g.querySelectorAll('[class*="abcjs-chord-pos-"]');
    if (!marks.length) return;
    var order = palette[idx++];
    if (!order) return;
    marks.forEach(function (el) {
      var m = /abcjs-chord-pos-(\d+)/.exec(el.getAttribute("class"));
      if (!m) return;
      var fn = order[parseInt(m[1], 10) - 1];
      if (fn && COMPING_FN_FILL[fn]) el.style.fill = COMPING_FN_FILL[fn];
    });
  });

  var label = root.querySelector("text.abcjs-voice-name.abcjs-v1");
  if (label) {
    var tspans = label.querySelectorAll("tspan");
    ["R", "3", "5"].forEach(function (fn, i) {
      if (tspans[i]) tspans[i].style.fill = COMPING_FN_FILL[fn];
    });
  }
}

/*
  updateRepeatBoundaries: reads chordCellLeftRepeat / chordCellRightRepeat CSS
  classes from the rendered chord table and stores the first and last repeat
  section indices in audioPlayer. Used by onEvent to wrap measure indices that
  exceed the chord table size back into the repeated section rather than the
  whole table.
*/
function updateRepeatBoundaries() {
  var cells = document.querySelectorAll('#chordtable .chordCell');
  var repeatStart, repeatEnd;
  for (var i = 0; i < cells.length; i++) {
    if (repeatStart === undefined && cells[i].classList.contains('chordCellLeftRepeat')) {
      repeatStart = i;
    }
    if (cells[i].classList.contains('chordCellRightRepeat')) {
      repeatEnd = i;
    }
  }
  var valid = repeatStart !== undefined && repeatEnd !== undefined && repeatStart <= repeatEnd;
  audioPlayer.repeatStart = valid ? repeatStart : undefined;
  audioPlayer.repeatEnd   = valid ? repeatEnd   : undefined;
}

// ============================================================
// Audio Playback
// ============================================================

var audioPlayer = {
  synthController: null,
  isPlaying: false,
  totalMs: 0,
  currentVisualObj: null,
  nativeQpm: null,
  melodOff: false,
  transposeSemitones: 0,
  repeatStart: undefined,
  repeatEnd: undefined
};

var audioParams = {
  soundFontUrl: "https://gleitz.github.io/midi-js-soundfonts/FatBoy/",
  program: 56  // Trumpet (GM)
};

// True while the on-screen sheet is showing a comping staff (set in
// renderAbcFile). Used so the "mute melody" button silences only voice 0
// (the melody) instead of the whole tune when there's a comping to hear.
var compingActive = false;

function currentAudioParams() {
  var params = Object.assign({}, audioParams);
  if (audioPlayer.melodOff) params.voicesOff = compingActive ? [0] : true;
  // Tempo is applied through SynthController.setWarp (see applyTempo), not a
  // synth option — `qpm` here is ignored by SynthController's playback path.
  if (audioPlayer.transposeSemitones) {
    params.midiTranspose = audioPlayer.transposeSemitones;
  }
  return params;
}

var lastHighlighted = [];
var lastHighlightedChordCell = null;

// Cursor control callbacks for ABCJS SynthController
var cursorControl = {
  onStart: function() {
    clearNoteHighlight();
  },
  onEvent: function(ev) {
    if (!ev || !ev.elements) return;
    clearNoteHighlight();

    // Highlight the notes at current position and cache them
    var newHighlighted = [];
    for (var i = 0; i < ev.elements.length; i++) {
      for (var j = 0; j < ev.elements[i].length; j++) {
        ev.elements[i][j].classList.add("abcjs-current-note");
        newHighlighted.push(ev.elements[i][j]);
      }
    }
    lastHighlighted = newHighlighted;

    // Highlight the matching chord table cell
    if (newHighlighted.length > 0 && newHighlighted[0]._abcMeasureIdx !== undefined) {
      var measureIdx = newHighlighted[0]._abcMeasureIdx;
      var offset = audioPlayer.chordOffset || 0;
      if (measureIdx >= offset) {
        var cells = document.querySelectorAll('#chordtable .chordCell');
        if (cells.length > 0) {
          var cellIdx = measureIdx - offset;
          if (cellIdx >= cells.length) {
            var rs = audioPlayer.repeatStart;
            var re = audioPlayer.repeatEnd;
            if (rs !== undefined && re !== undefined) {
              cellIdx = rs + (cellIdx - rs) % (re - rs + 1);
            } else {
              cellIdx = cellIdx % cells.length;
            }
          }
          if (cellIdx >= 0 && cellIdx < cells.length) {
            cells[cellIdx].classList.add('chordCell-playing');
            lastHighlightedChordCell = cells[cellIdx];
          }
        }
      }
    }
  },
  onFinished: function() {
    audioPlayer.isPlaying = false;
    updatePlayButton();
    clearNoteHighlight();
  },
  onBeat: function() {}
};

function clearNoteHighlight() {
  for (var i = 0; i < lastHighlighted.length; i++) {
    lastHighlighted[i].classList.remove("abcjs-current-note");
  }
  lastHighlighted = [];
  if (lastHighlightedChordCell) {
    lastHighlightedChordCell.classList.remove('chordCell-playing');
    lastHighlightedChordCell = null;
  }
}

function updatePlayButton() {
  var btn = document.getElementById("playPauseBtn");
  if (!btn) return;
  if (audioPlayer.isPlaying) {
    btn.innerHTML = '<span class="fa-solid fa-pause" aria-hidden="true"></span>';
    btn.title = "Pause";
    btn.classList.add("playing");
  } else {
    btn.innerHTML = '<span class="fa-solid fa-play" aria-hidden="true"></span>';
    btn.title = "Play";
    btn.classList.remove("playing");
  }
}

function setPlayerButtonsDisabled(disabled) {
  var playBtn = document.getElementById("playPauseBtn");
  var stopBtn = document.getElementById("stopBtn");
  var melodyBtn = document.getElementById("melodyOffBtn");
  if (playBtn) playBtn.disabled = disabled;
  if (stopBtn) stopBtn.disabled = disabled;
  if (melodyBtn) melodyBtn.disabled = disabled;
}

function updateMelodyButton() {
  var btn = document.getElementById("melodyOffBtn");
  if (!btn) return;
  if (audioPlayer.melodOff) {
    btn.classList.add("active");
    btn.innerHTML = '<span class="fa-solid fa-microphone-lines-slash" aria-hidden="true"></span>';
    btn.title = "Unmute melody";
    btn.setAttribute("aria-label", "Unmute melody");
  } else {
    btn.classList.remove("active");
    btn.innerHTML = '<span class="fa-solid fa-microphone-lines" aria-hidden="true"></span>';
    btn.title = "Mute melody";
    btn.setAttribute("aria-label", "Mute melody");
  }
}

function toggleMelody() {
  audioPlayer.melodOff = !audioPlayer.melodOff;
  updateMelodyButton();
  rerenderFile();
}

function setAudioLoadingVisible(visible) {
  var label = document.getElementById("audioLoadingLabel");
  if (label) {
    if (visible) {
      label.classList.add("visible");
    } else {
      label.classList.remove("visible");
    }
  }
}

function playPause() {
  if (!audioPlayer.synthController) return;
  if (audioPlayer.isPlaying) {
    audioPlayer.synthController.pause();
    audioPlayer.isPlaying = false;
  } else {
    audioPlayer.synthController.play();
    audioPlayer.isPlaying = true;
  }
  updatePlayButton();
}

function stopAudio() {
  if (!audioPlayer.synthController || !audioPlayer.currentVisualObj) return;

  // Silence immediately
  try { audioPlayer.synthController.pause(); } catch(e) {}
  audioPlayer.isPlaying = false;
  updatePlayButton();
  clearNoteHighlight();
  setPlayerButtonsDisabled(true);

  // Re-call setTune() on the existing controller to fully reset its internal
  // state (midiBuffer + timingCallbacks) back to position 0. The soundfont
  // buffers are already decoded in the AudioContext so this is fast.
  var ctrl = audioPlayer.synthController;
  ctrl.setTune(audioPlayer.currentVisualObj, false, currentAudioParams())
    .then(function() {
      if (ctrl !== audioPlayer.synthController) return;
      clearNoteHighlight();
      setPlayerButtonsDisabled(false);
    })
    .catch(function(err) {
      console.warn("Stop reset failed:", err);
      if (ctrl !== audioPlayer.synthController) return;
      clearNoteHighlight();
      setPlayerButtonsDisabled(false);
    });
}

function initAudioForTune(visualObj) {
  if (!ABCJS.synth || typeof ABCJS.synth.supportsAudio !== "function" ||
      !ABCJS.synth.supportsAudio()) {
    return;
  }

  // Silence and discard the existing controller before loading a new tune
  if (audioPlayer.synthController) {
    try { audioPlayer.synthController.pause(); } catch(e) {}
    audioPlayer.synthController = null;
  }
  audioPlayer.isPlaying = false;
  audioPlayer.totalMs = 0;
  audioPlayer.currentVisualObj = visualObj;
  audioPlayer.nativeQpm = (visualObj.metaText && visualObj.metaText.tempo && visualObj.metaText.tempo.bpm) || null;
  updatePlayButton();
  updateMelodyButton();
  setPlayerButtonsDisabled(true);
  setAudioLoadingVisible(true);

  // Pre-compute note-to-time map for click-to-seek
  buildTimingMap(visualObj);

  // Fresh SynthController for every new tune
  audioPlayer.synthController = new ABCJS.synth.SynthController();
  audioPlayer.synthController.load("#abc-player-container", cursorControl, {
    displayLoop: false,
    displayRestart: false,
    displayPlay: false,
    displayProgress: false,
    // The container is display:none, so this renders nothing visible — but it
    // makes SynthController build the `.abcjs-midi-tempo` element that its own
    // setWarp() writes to, so the Tempo stepper (applyTempo) can drive it.
    displayWarp: true
  });

  var ctrl = audioPlayer.synthController;
  ctrl.setTune(visualObj, false, currentAudioParams())
    .then(function() {
      if (ctrl !== audioPlayer.synthController) return;
      setAudioLoadingVisible(false);
      setPlayerButtonsDisabled(false);
      // Carry a tempo override from the previously-open song onto this one.
      if (tempoBpm !== null) applyTempo();
    })
    .catch(function(err) {
      console.warn("Audio could not load:", err);
      if (ctrl !== audioPlayer.synthController) return;
      setAudioLoadingVisible(false);
    });
}

/*
  buildTimingMap: Use ABCJS.TimingCallbacks to pre-compute the time (ms) for
  every note element in the SVG, stored as el._abcSeekMs. Also records the
  total song duration for fraction-based seeking.
*/
function buildTimingMap(visualObj) {
  if (typeof ABCJS.TimingCallbacks !== "function") return;
  try {
    var tc = new ABCJS.TimingCallbacks(visualObj, {
      eventCallback: function() { return true; },
      beatCallback: function() { return true; }
    });
    var timings = tc.noteTimings || [];
    var maxMs = 0;
    var measureIdx = 0;
    var seenFirstEvent = false;
    for (var i = 0; i < timings.length; i++) {
      var t = timings[i];
      if (t.type === "event" && t.elements && t.milliseconds !== undefined) {
        if (t.measureStart && seenFirstEvent) measureIdx++;
        seenFirstEvent = true;
        if (t.milliseconds > maxMs) maxMs = t.milliseconds;
        for (var v = 0; v < t.elements.length; v++) {
          for (var e = 0; e < t.elements[v].length; e++) {
            t.elements[v][e]._abcSeekMs = t.milliseconds;
            t.elements[v][e]._abcMeasureIdx = measureIdx;
          }
        }
      }
    }
    // Add a small buffer so the final note isn't at fraction=1 immediately
    audioPlayer.totalMs = maxMs + 500;
  } catch(e) {
    console.warn("buildTimingMap error:", e);
  }
}

/*
  seekToMs: Seek playback to a given millisecond offset.
*/
function seekToMs(ms) {
  var sc = audioPlayer.synthController;
  if (!sc || audioPlayer.totalMs <= 0) return;
  var fraction = Math.max(0, Math.min(1, ms / audioPlayer.totalMs));
  if (typeof sc.seek === "function") {
    sc.seek(fraction);
    if (audioPlayer.isPlaying && typeof sc.play === "function") {
      sc.play();
    }
  }
}

/*
  handleNotationClick: Walk up the DOM from the clicked element to find the
  nearest element tagged with _abcSeekMs and seek to that position.
*/
function handleNotationClick(e) {
  var notation = document.getElementById("notation");
  var el = e.target;
  while (el && el !== notation) {
    if (el._abcSeekMs !== undefined) {
      seekToMs(el._abcSeekMs);
      return;
    }
    el = el.parentElement;
  }
}

function setupNotationClickHandler() {
  var notation = document.getElementById("notation");
  if (!notation || notation._abcClickHandlerSet) return;
  notation._abcClickHandlerSet = true;
  notation.addEventListener("click", handleNotationClick);
}

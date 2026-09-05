"use strict";

import { INSTRUMENTS, offsetForInstrument, changeClefForInstrument } from "./lib/instruments.js";
import { parseChordScheme, simplifyBlues, simplifySong, computeChordOffset } from "./lib/chords.js";
import { irealProFromAbc } from "./lib/irealpro.js";
import { convertChordsToRoman } from "./lib/music-theory.js";

export function renderSong(path) {
  document.getElementById("transpose").value = 0;
  tempoPercent = 100;
  updateTempoLabel();
  audioPlayer.melodOff = false;
  readFile(path, renderAbcFile);
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

  var transpose_steps = document.getElementById("transpose");
  transpose_steps = (transpose_steps !== null) ? transpose_steps.value : 0;

  // Don't use valueAsNumber to let IE users also enjoy transposing
  transpose_steps = Number(transpose_steps) + extraTransposeSteps;
  var instrumentSelect = document.getElementById("instrument");
  var instrumentTextEl = document.getElementById("instrumentText");
  if (instrumentTextEl) {
    instrumentTextEl.innerHTML = instrumentSelect.options[instrumentSelect.selectedIndex].text.toLowerCase();
  }
  updateSheetStatusLine(instrumentSelect);

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

  if (add_link) {
    add_inspiration_link(song.metaText.url);
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

  var abcParams = {
    visualTranspose: transpose_steps,
    responsive: "resize",
    staffwidth:1000,
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

  var visualObjs = ABCJS.renderAbc(notationElt, text, abcParams);

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
   Adds a link to the sheetmenu if anabc tune contains a F field
*/
function add_inspiration_link(url) {
  if (url !== undefined) {
    var link = document.getElementById("inspirationLink");
    if (link !== null) {
      link.href = url;
    } else {
      link = document.createElement("A");
      link.innerHTML = "Inspiration";
      link.href = url;
      link.target = "_blank";
      link.id = "inspirationLink";
      link.className = "sheet-inspiration-link";
      var slot = document.getElementById("inspirationSlot");
      if (slot) slot.appendChild(link);
    }
  } else {
    var link = document.getElementById("inspirationLink");
    if (link !== null) {
      link.parentNode.removeChild(link);
    }
  }
}

/*
   Funcion: add_irealpro_link
   Adds a link to the overflow menu for devices that could have irealpro
*/
function add_irealpro_link(song, chords) {

  var couldHaveIrealPro = /iPhone|iPad|iPod|Android|Macintosh/i.test(navigator.userAgent);
  if (couldHaveIrealPro && (chords.length > 0)) {
    var url = irealProFromAbc(song, chords);
    var link = document.getElementById("iRealPro");
    if (link !== null) {
      link.href = url;
    } else {
      var link = document.createElement("A");
      link.innerHTML = "irealpro";
      link.href = url
      /* link.target = "_blank"; */
      link.id = "iRealPro";
      var menu = document.getElementById("overflowMenu");
      if (menu) menu.appendChild(link);
    }
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
  initPrintLink();
  initSheetControls();

  if (window.location.hash) {
    parse_song_from_hash(window.location.hash);
  }
}

/*
   Funcion: initPrintLink
   Wires up the (shared) #printLink to window.print(), used on both the
   songs page and the setlists page.
*/
export function initPrintLink() {
  var link = document.getElementById("printLink");
  if (link) {
    link.addEventListener("click", function(e) {
      e.preventDefault();
      window.print();
    });
  }
}

/*
   Funcion: initSheetControls
   Wires up the songs-page-only sheet controls (transpose input, audio
   buttons) that used to carry inline onclick/oninput attributes. Not
   called on the setlists page, which has none of these elements.
*/
function initSheetControls() {
  var transpose = document.getElementById("transpose");
  if (transpose) transpose.addEventListener("input", rerenderFile);

  var keyUpBtn = document.getElementById("keyUpBtn");
  if (keyUpBtn) keyUpBtn.addEventListener("click", function() { stepTranspose(1); });
  var keyDownBtn = document.getElementById("keyDownBtn");
  if (keyDownBtn) keyDownBtn.addEventListener("click", function() { stepTranspose(-1); });

  var tempoUpBtn = document.getElementById("tempoUpBtn");
  if (tempoUpBtn) tempoUpBtn.addEventListener("click", function() { stepTempo(10); });
  var tempoDownBtn = document.getElementById("tempoDownBtn");
  if (tempoDownBtn) tempoDownBtn.addEventListener("click", function() { stepTempo(-10); });

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

  var overflowToggle = document.getElementById("overflowToggle");
  if (overflowToggle) {
    overflowToggle.addEventListener("click", function(e) {
      e.stopPropagation();
      toggleOverflowMenu();
    });
  }
  document.addEventListener("click", function(e) {
    var menu = document.getElementById("overflowMenu");
    if (menu && !menu.hidden && !menu.contains(e.target) && e.target !== overflowToggle) {
      closeOverflowMenu();
    }
  });
}

/*
   Funcion: updateSheetStatusLine
   Shows the current instrument as a read-only caption next to the sheet
   controls. The instrument picker itself lives in the library sidebar's
   profile row (a fact about the player, set once) — Key and Tempo are the
   per-song steppers that live next to Play. Separate from #instrumentText,
   which still feeds the print footer.
*/
function updateSheetStatusLine(instrumentSelect) {
  var statusEl = document.getElementById("sheetStatus");
  if (!statusEl) return;
  statusEl.textContent = instrumentSelect.options[instrumentSelect.selectedIndex].text;
}

function toggleOverflowMenu() {
  var menu = document.getElementById("overflowMenu");
  if (!menu) return;
  if (menu.hidden) {
    openOverflowMenu();
  } else {
    closeOverflowMenu();
  }
}

function openOverflowMenu() {
  var menu = document.getElementById("overflowMenu");
  var toggle = document.getElementById("overflowToggle");
  if (menu) menu.hidden = false;
  if (toggle) toggle.setAttribute("aria-expanded", "true");
}

function closeOverflowMenu() {
  var menu = document.getElementById("overflowMenu");
  var toggle = document.getElementById("overflowToggle");
  if (menu) menu.hidden = true;
  if (toggle) toggle.setAttribute("aria-expanded", "false");
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
// Tempo control (playback speed only — the engraved notation is unaffected)
// ============================================================

var tempoPercent = 100;
var TEMPO_MIN = 50;
var TEMPO_MAX = 150;

function stepTempo(delta) {
  tempoPercent = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, tempoPercent + delta));
  updateTempoLabel();
  applyTempo();
}

function updateTempoLabel() {
  var label = document.getElementById("tempoValueLabel");
  if (label) label.textContent = tempoPercent + "%";
}

/*
   Funcion: applyTempo
   Applies the current tempo percentage by reloading the tune into the live
   SynthController with a scaled `qpm` option (percentage of the tune's own
   Q: field, read once into audioPlayer.nativeQpm when the tune first loads).
   SynthController does expose a `setWarp` instance method, but it's wired to
   ABCJS's own built-in tempo-slider DOM element (created only when
   `displayWarp: true`) and throws when that element doesn't exist — confirmed
   by testing it directly, which is why this goes through setTune's `qpm`
   option instead. Resumes playback afterward if it was already playing.
*/
function applyTempo() {
  var ctrl = audioPlayer.synthController;
  if (!ctrl || !audioPlayer.currentVisualObj) return;
  var wasPlaying = audioPlayer.isPlaying;
  ctrl.setTune(audioPlayer.currentVisualObj, false, currentAudioParams())
    .then(function() {
      if (ctrl !== audioPlayer.synthController) return;
      if (wasPlaying) {
        ctrl.play();
        audioPlayer.isPlaying = true;
        updatePlayButton();
      }
    })
    .catch(function(err) {
      console.warn("Tempo change failed:", err);
    });
}

/*
   Instrument profile persistence (localStorage). Shared by the songs page
   and the setlists page: whichever instrument you last picked on either
   page is what both preselect next time. Guarded with try/catch so private
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
  select.innerText = "Instrument";
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

  // The instrument is a fact about the player, not a per-song setting, so it
  // lives in the library sidebar's persistent profile row (#rjLibraryProfile)
  // rather than the per-song overflow menu. The setlists page doesn't have
  // that sidebar (yet — see the unification milestone), so it still falls
  // back to appending straight into #sheetmenu.
  var menu = document.getElementById("rjLibraryProfile") ||
    document.getElementById("overflowMenu") ||
    document.getElementById("sheetmenu");
  menu.appendChild(div);
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
  repeatStart: undefined,
  repeatEnd: undefined
};

var audioParams = {
  soundFontUrl: "https://gleitz.github.io/midi-js-soundfonts/FatBoy/",
  program: 56  // Trumpet (GM)
};

function currentAudioParams() {
  var params = Object.assign({}, audioParams);
  if (audioPlayer.melodOff) params.voicesOff = true;
  if (tempoPercent !== 100 && audioPlayer.nativeQpm) {
    params.qpm = Math.round(audioPlayer.nativeQpm * tempoPercent / 100);
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
    btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    btn.title = "Pause";
    btn.classList.add("playing");
  } else {
    btn.innerHTML = '<i class="fa-solid fa-play"></i>';
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
    btn.textContent = "Unmute melody";
  } else {
    btn.classList.remove("active");
    btn.textContent = "Mute melody";
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
    displayWarp: false
  });

  var ctrl = audioPlayer.synthController;
  ctrl.setTune(visualObj, false, currentAudioParams())
    .then(function() {
      if (ctrl !== audioPlayer.synthController) return;
      setAudioLoadingVisible(false);
      setPlayerButtonsDisabled(false);
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

"use strict";

import { INSTRUMENTS, offsetForInstrument, changeClefForInstrument } from "./lib/instruments.js";
import { parseChordScheme, simplifyBlues, simplifySong, computeChordOffset } from "./lib/chords.js";
import { irealProFromAbc } from "./lib/irealpro.js";

export function renderSong(path) {
  document.getElementById("transpose").value = 0;
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
export function renderAbcFile(text, notationElt, chordTableElt, songTitleElt, titlePrefix, add_link) {

  notationElt = (typeof notationElt !== 'undefined') ?  notationElt : "notation";
  chordTableElt = (typeof chordTableElt !== 'undefined') ?  chordTableElt : "chordtable";
  songTitleElt = (typeof songTitleElt !== 'undefined') ?  songTitleElt : "songtitle";
  titlePrefix = (typeof titlePrefix !== 'undefined') ?  titlePrefix : "";
  add_link = (typeof add_link !== 'undefined') ?  add_link : true;

  var transpose_steps = document.getElementById("transpose");
  transpose_steps = (transpose_steps !== null) ? transpose_steps.value : 0;

  // Don't use valueAsNumber to let IE users also enjoy transposing
  transpose_steps = Number(transpose_steps);
  var manualTransposeSteps = transpose_steps;
  var instrumentSelect = document.getElementById("instrument");
  document.getElementById("instrumentText").innerHTML = instrumentSelect.options[instrumentSelect.selectedIndex].text.toLowerCase();
  updateSheetStatusLine(instrumentSelect, manualTransposeSteps);

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
*/
export function readFile(file, callback) {
  var f = new XMLHttpRequest();
  f.onreadystatechange = function() {
    if (f.readyState === 4) {
      if (f.status === 200 || f.status === 0) {
        callback(f.responseText);
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

// ============================================================
// Roman Numeral Conversion
// ============================================================

function noteChroma(noteName) {
  var normalized = noteName.replace(/♭/g, 'b').replace(/♯/g, '#');
  if (typeof Tonal !== 'undefined' && Tonal.Note) {
    try {
      var n = Tonal.Note.get(normalized);
      if (typeof n.chroma === 'number') return n.chroma;
    } catch(e) {}
  }
  var CHROMAS = {C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  var letter = normalized[0].toUpperCase();
  var rest = normalized.slice(1);
  var c = (CHROMAS[letter] !== undefined) ? CHROMAS[letter] : 0;
  for (var i = 0; i < rest.length; i++) {
    if (rest[i] === 'b') c--;
    else if (rest[i] === '#') c++;
  }
  return ((c % 12) + 12) % 12;
}

function chordToRomanNumeral(chordStr, keyRoot, keyMode) {
  if (!chordStr || chordStr === ' % ') return chordStr;

  var match = chordStr.match(/^([A-G][♭♯b#]?)(.*)/);
  if (!match) return chordStr;
  var chordRoot = match[1];
  var suffix    = match[2] || '';

  var interval = ((noteChroma(chordRoot) - noteChroma(keyRoot)) + 12) % 12;
  var isMinorKey = keyMode && keyMode !== '' && keyMode !== 'major' && keyMode !== 'maj';

  var MAJOR_MAP = {0:[0,''],1:[1,'♭'],2:[1,''],3:[2,'♭'],4:[2,''],5:[3,''],
                   6:[3,'♯'],7:[4,''],8:[5,'♭'],9:[5,''],10:[6,'♭'],11:[6,'']};
  var MINOR_MAP = {0:[0,''],1:[1,'♭'],2:[1,''],3:[2,''],4:[2,'♯'],5:[3,''],
                   6:[4,'♭'],7:[4,''],8:[5,''],9:[5,'♯'],10:[6,''],11:[6,'♯']};

  var entry    = (isMinorKey ? MINOR_MAP : MAJOR_MAP)[interval] || [0,''];
  var ROMANS   = ['I','II','III','IV','V','VI','VII'];
  var romanBase  = ROMANS[entry[0]];
  var accidental = entry[1];

  var isMinorChord = /^(m|min|-)(?!aj)/i.test(suffix);
  var isHalfDim    = /^(Ø|ø|m7[b♭]5)/i.test(suffix);
  var isDim        = /^(°|dim)/i.test(suffix);
  var isAug        = /^(\+|aug)/i.test(suffix);
  var isMaj7       = /maj7|Δ/.test(suffix);
  var numExt       = (suffix.match(/\d+/) || [])[0] || '';

  var roman;
  if (isHalfDim)       roman = romanBase.toLowerCase() + 'ø7';
  else if (isDim)      roman = romanBase.toLowerCase() + '°';
  else if (isMinorChord) roman = romanBase.toLowerCase() + numExt;
  else if (isAug)      roman = romanBase + '+';
  else if (isMaj7)     roman = romanBase + 'maj7';
  else                 roman = romanBase + numExt;

  return accidental + roman;
}

function convertChordsToRoman(chords, song) {
  if (!chords || !chords.length || !song.lines || !song.lines[0]) return chords;

  // Build a per-line key map so key changes mid-song are handled
  var lineKeys = song.lines.map(function(line) {
    return (line.staff && line.staff[0] && line.staff[0].key) || null;
  });

  // Walk lines again to propagate: each line inherits the last known key
  var resolvedKeys = [];
  var lastKey = (lineKeys[0]) || {root:'C', acc:'', mode:''};
  for (var i = 0; i < lineKeys.length; i++) {
    if (lineKeys[i] && lineKeys[i].root) lastKey = lineKeys[i];
    resolvedKeys.push(lastKey);
  }

  // Count measures per line so we can map measure index → key
  var measureKeyMap = [];
  for (var li = 0; li < song.lines.length; li++) {
    var line = song.lines[li];
    if (!line.staff || !line.staff[0] || !line.staff[0].voices) continue;
    var voice   = line.staff[0].voices[0] || [];
    var lineKey = resolvedKeys[li];
    var currentKey = lineKey;
    for (var j = 0; j < voice.length; j++) {
      var el = voice[j];
      if (el.el_type === 'keySignature' && el.key && el.key.root) currentKey = el.key;
      if (el.el_type === 'bar') measureKeyMap.push(currentKey);
    }
  }

  return chords.map(function(measure, idx) {
    var key    = measureKeyMap[idx] || resolvedKeys[0] || {root:'C', acc:'', mode:''};
    var keyRoot = key.root + (key.acc || '');
    var keyMode = key.mode || '';
    var romanText = measure.text.map(function(chordStr) {
      return chordToRomanNumeral(chordStr, keyRoot, keyMode);
    });
    return Object.assign({}, measure, {text: romanText});
  });
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
      link.innerHTML = "inspiration";
      link.href = url;
      link.target = "_blank";
      link.id = "inspirationLink";
      var menu = document.getElementById("overflowMenu");
      if (menu) menu.appendChild(link);
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
   songs page and the songbook page.
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
   called on the songbook page, which has none of these elements.
*/
function initSheetControls() {
  var transpose = document.getElementById("transpose");
  if (transpose) transpose.addEventListener("input", rerenderFile);

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
   Fills the compact "instrument · transpose" status line shown next to the
   persistent Play button. Separate from #instrumentText, which still feeds
   the print footer.
*/
function updateSheetStatusLine(instrumentSelect, manualTransposeSteps) {
  var statusEl = document.getElementById("sheetStatus");
  if (!statusEl) return;
  var parts = [instrumentSelect.options[instrumentSelect.selectedIndex].text];
  if (manualTransposeSteps) {
    parts.push((manualTransposeSteps > 0 ? "+" : "") + manualTransposeSteps + " semitones");
  }
  statusEl.textContent = parts.join(" · ");
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
   Instrument profile persistence (localStorage). Shared by the songs page
   and the songbook page: whichever instrument you last picked on either
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

  // The songs page has an overflow menu for the instrument picker; the
  // songbook page (no overflow menu) still appends it straight to #sheetmenu.
  var menu = document.getElementById("overflowMenu") || document.getElementById("sheetmenu");
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
    btn.title = "Unmute melody";
  } else {
    btn.classList.remove("active");
    btn.title = "Mute melody";
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

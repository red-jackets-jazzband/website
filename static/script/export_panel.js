"use strict";

import { renderAbcFile, readFile } from "./render_abc.js";
import { parseSongIndex, filterSongsByQuery } from "./lib/song-index.js";

var allSongs = [];
var selectedFiles = [];

/*
   Funcion: initExportPanel
   Bootstraps the Export panel: this-chart-vs-booklet, a song picker for
   booklet mode, and an include-lyrics toggle — all still ending in
   window.print(). #printLink stays as the one-click "just print this
   chart" default; this panel is progressive disclosure on top of it.
*/
export function initExportPanel() {
  var openBtn = document.getElementById("exportOpenBtn");
  var panel = document.getElementById("exportPanel");
  if (!openBtn || !panel) return;

  openBtn.addEventListener("click", openPanel);
  document.getElementById("exportCloseBtn").addEventListener("click", closePanel);
  document.getElementById("exportCancelBtn").addEventListener("click", closePanel);
  document.getElementById("exportRunBtn").addEventListener("click", runExport);

  document.querySelectorAll('input[name="exportFormat"]').forEach(function(radio) {
    radio.addEventListener("change", updateFormatVisibility);
  });

  var searchInput = document.getElementById("exportSongSearch");
  if (searchInput) {
    searchInput.addEventListener("input", function() {
      renderSongPicker(searchInput.value);
    });
  }

  window.addEventListener("afterprint", function() {
    document.body.classList.remove("export-hide-lyrics");
    document.body.classList.remove("export-booklet-mode");
  });

  readFile("index_of_songs.txt", function(data) {
    allSongs = parseSongIndex(data);
    renderSongPicker("");
  });
}

function openPanel() {
  var overflow = document.getElementById("overflowMenu");
  if (overflow) overflow.hidden = true;
  document.getElementById("exportPanel").hidden = false;
}

function closePanel() {
  document.getElementById("exportPanel").hidden = true;
}

function updateFormatVisibility() {
  var isBooklet = document.querySelector('input[name="exportFormat"]:checked').value === "booklet";
  document.getElementById("exportSongPicker").hidden = !isBooklet;
}

function renderSongPicker(query) {
  var listEl = document.getElementById("exportSongList");
  if (!listEl) return;
  listEl.innerHTML = "";
  var songs = filterSongsByQuery(allSongs, query || "");
  songs.forEach(function(song) {
    var row = document.createElement("LABEL");
    row.className = "export-song-row";

    var checkbox = document.createElement("INPUT");
    checkbox.type = "checkbox";
    checkbox.checked = selectedFiles.indexOf(song.file) !== -1;
    checkbox.addEventListener("change", function() {
      toggleSelected(song.file, checkbox.checked);
    });

    row.appendChild(checkbox);
    row.appendChild(document.createTextNode(" " + song.name));
    listEl.appendChild(row);
  });
  updateSelectedCount();
}

function toggleSelected(file, checked) {
  var idx = selectedFiles.indexOf(file);
  if (checked && idx === -1) selectedFiles.push(file);
  if (!checked && idx !== -1) selectedFiles.splice(idx, 1);
  updateSelectedCount();
}

function updateSelectedCount() {
  var el = document.getElementById("exportSelectedCount");
  if (el) el.textContent = selectedFiles.length + " selected";
}

function runExport() {
  var format = document.querySelector('input[name="exportFormat"]:checked').value;
  var includeLyrics = document.getElementById("exportIncludeLyrics").checked;
  document.body.classList.toggle("export-hide-lyrics", !includeLyrics);

  if (format === "chart") {
    closePanel();
    window.print();
    return;
  }

  // The currently-open single song (#rjSheet) has no print-hiding class of
  // its own — normally correct, since printing while reading a chart should
  // print that chart — but it would otherwise print alongside the booklet
  // too. Hide it just for this print, same restore-on-afterprint pattern as
  // export-hide-lyrics above.
  document.body.classList.add("export-booklet-mode");
  buildBooklet(selectedFiles.slice(), function() {
    closePanel();
    window.print();
  });
}

/*
   Funcion: buildBooklet
   Same reuse pattern as render_book.js's retrieveAndRenderSongForBook:
   fetch each selected song and call renderAbcFile(..., add_link=false)
   into a numbered, print-only container. `done` runs once every song has
   rendered (or immediately if none were selected).
*/
function buildBooklet(files, done) {
  var container = document.getElementById("exportBooklet");
  container.innerHTML = "";
  if (files.length === 0) {
    done();
    return;
  }

  var remaining = files.length;
  files.forEach(function(file, index) {
    var n = index + 1;
    var titleId = "exportTitle-" + n;
    var chordId = "exportChord-" + n;
    var notationId = "exportNotation-" + n;

    var titleEl = document.createElement("DIV");
    titleEl.id = titleId;
    titleEl.classList.add("songtitle", "pageBreakBefore");
    container.appendChild(titleEl);

    var chordEl = document.createElement("DIV");
    chordEl.id = chordId;
    chordEl.classList.add("chordtable");
    container.appendChild(chordEl);

    var notationEl = document.createElement("DIV");
    notationEl.id = notationId;
    notationEl.classList.add("notation");
    container.appendChild(notationEl);

    readFile("/songs/" + file, function(text) {
      renderAbcFile(text, notationId, chordId, titleId, n + ". ", false);
      remaining -= 1;
      if (remaining === 0) done();
    });
  });
}

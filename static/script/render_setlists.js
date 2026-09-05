"use strict";

import { renderAbcFile, readFile, createInstrumentDropdown, initPrintLink } from "./render_abc.js";
import { parseSongIndex } from "./lib/song-index.js";
import { parseSetlistFile } from "./lib/setlist-format.js";
import { extractKeyFromAbc, semitonesBetweenKeys } from "./lib/music-theory.js";

var setlistIndex = []; // [{ name, file }] parsed from index_of_setlists.txt

function renderHomeList() {
  var listEl = document.getElementById("bandSetlistList");
  if (!listEl) return;
  listEl.innerHTML = "";

  if (setlistIndex.length === 0) {
    var empty = document.createElement("DIV");
    empty.className = "setlists-empty";
    empty.textContent = "No setlists published yet.";
    listEl.appendChild(empty);
    return;
  }

  setlistIndex.forEach(function(entry) {
    var row = document.createElement("BUTTON");
    row.type = "button";
    row.className = "setlists-row";
    row.textContent = entry.name;
    row.addEventListener("click", function() {
      openSetlist(entry.file, entry.name);
    });
    listEl.appendChild(row);
  });
}

function openSetlist(file, fallbackName) {
  readFile("/setlists/" + file, function(text) {
    var setlist = parseSetlistFile(text);
    showSetlistView(setlist.name || fallbackName, setlist.songs);
  }, function(status) {
    console.warn("Could not load setlist " + file + " (status " + status + ")");
  });
}

function showSetlistView(name, songs) {
  var home = document.getElementById("setlistsHome");
  var view = document.getElementById("setlistView");
  if (home) home.hidden = true;
  if (view) view.hidden = false;

  var songsEl = document.getElementById("setlistSongs");
  songsEl.innerHTML = "";

  var heading = document.createElement("DIV");
  heading.className = "setlist-view-title";
  heading.textContent = name;
  songsEl.appendChild(heading);

  songs.forEach(function(song, index) {
    var n = index + 1;
    var titleId = "setlistTitle-" + n;
    var chordId = "setlistChord-" + n;
    var notationId = "setlistNotation-" + n;

    var titleEl = document.createElement("DIV");
    titleEl.id = titleId;
    titleEl.classList.add("songtitle", "pageBreakBefore");
    songsEl.appendChild(titleEl);

    var chordEl = document.createElement("DIV");
    chordEl.id = chordId;
    chordEl.classList.add("chordtable");
    songsEl.appendChild(chordEl);

    var notationEl = document.createElement("DIV");
    notationEl.id = notationId;
    notationEl.classList.add("notation");
    songsEl.appendChild(notationEl);

    readFile("/songs/" + song.file, function(text) {
      var extraTransposeSteps = 0;
      if (song.key) {
        var nativeKey = extractKeyFromAbc(text) || "C";
        extraTransposeSteps = semitonesBetweenKeys(nativeKey, song.key);
      }
      renderAbcFile(text, notationId, chordId, titleId, n + ". ", false, extraTransposeSteps);
    }, function(status) {
      console.warn("Setlist references a missing song file: " + song.file + " (status " + status + ")");
    });
  });
}

function showHome() {
  var home = document.getElementById("setlistsHome");
  var view = document.getElementById("setlistView");
  if (view) view.hidden = true;
  if (home) home.hidden = false;
}

createInstrumentDropdown();
initPrintLink();

var backBtn = document.getElementById("setlistBackBtn");
if (backBtn) backBtn.addEventListener("click", showHome);

readFile("/setlists/index_of_setlists.txt", function(data) {
  setlistIndex = parseSongIndex(data);
  renderHomeList();
});

"use strict";

import { renderSong, readFile } from "./render_abc.js";
import { parseSongIndex, groupSongsByLetter, filterSongsByQuery, songTitleSlug } from "./lib/song-index.js";

var allSongs = [];

/*
   Funcion: initSongLibrary
   Bootstraps the songs-page library sidebar: fetches index_of_songs.txt,
   renders the grouped/searchable list and the A-Z scroll rail, and wires
   up the search box. Replaces the old letter-dropdown grid
   (createAllDropdowns/createMapFromSongList/createLetterDropDown).
*/
export function initSongLibrary() {
  var listEl = document.getElementById("songList");
  var railEl = document.getElementById("songRail");
  var searchInput = document.getElementById("songSearch");
  var countEl = document.getElementById("songCount");
  if (!listEl) return;

  readFile("index_of_songs.txt", function(data) {
    allSongs = parseSongIndex(data);
    if (countEl) countEl.textContent = allSongs.length + " lead sheets";
    renderLibrary(listEl, railEl, allSongs, "");
  });

  if (searchInput) {
    searchInput.addEventListener("input", function() {
      renderLibrary(listEl, railEl, allSongs, searchInput.value);
    });
  }
}

function renderLibrary(listEl, railEl, songs, query) {
  var isSearching = query.trim().length > 0;
  var filtered = filterSongsByQuery(songs, query);

  listEl.innerHTML = "";

  if (isSearching) {
    if (filtered.length === 0) {
      var empty = document.createElement("DIV");
      empty.className = "song-list-empty";
      empty.textContent = "No songs match your search.";
      listEl.appendChild(empty);
    } else {
      filtered.forEach(function(song) {
        listEl.appendChild(buildSongRow(song));
      });
    }
    if (railEl) railEl.innerHTML = "";
    return;
  }

  var groups = groupSongsByLetter(filtered);
  groups.forEach(function(group) {
    var heading = document.createElement("DIV");
    heading.className = "song-list-letter";
    heading.id = "letter-" + group.letter;
    heading.textContent = group.letter;
    listEl.appendChild(heading);
    group.items.forEach(function(song) {
      listEl.appendChild(buildSongRow(song));
    });
  });

  if (railEl) renderRail(railEl, groups);
}

function renderRail(railEl, groups) {
  railEl.innerHTML = "";
  groups.forEach(function(group) {
    var btn = document.createElement("BUTTON");
    btn.type = "button";
    btn.textContent = group.letter;
    btn.title = "Jump to " + group.letter;
    btn.addEventListener("click", function() {
      var target = document.getElementById("letter-" + group.letter);
      if (target) target.scrollIntoView({ block: "start" });
    });
    railEl.appendChild(btn);
  });
}

function buildSongRow(song) {
  var title = songTitleSlug(song);
  var link = document.createElement("A");
  link.href = "#s=" + title;
  link.className = "song-list-item";
  link.textContent = song.name;
  link.addEventListener("click", function(e) {
    e.preventDefault();
    window.location.hash = "s=" + title;
    renderSong(song.file);
  });
  return link;
}

"use strict";

import { renderSong, renderSongTextWithOverride, readFile, renderAbcFile } from "./render_abc.js";
import { parseSongIndex, groupSongsByLetter, filterSongsByQuery, songTitleSlug } from "./lib/song-index.js";
import { parseSetlistFile } from "./lib/setlist-format.js";
import { extractKeyFromAbc, semitonesBetweenKeys } from "./lib/music-theory.js";
import {
  listPersonalSetlists,
  getPersonalSetlist,
  createPersonalSetlist,
  deletePersonalSetlist,
  renamePersonalSetlist,
  addSongToPersonalSetlist,
  removeSongFromPersonalSetlist,
  updateSongKeyInPersonalSetlist,
  moveSongInPersonalSetlist,
  copyBandSetlistToPersonal,
  exportPersonalSetlistText,
  importPersonalSetlistText,
} from "./lib/setlists-store.js";

var allSongs = []; // [{ name, file }] from index_of_songs.txt, shared by both tabs
var allSongsLoaded = false;
var setlistIndex = []; // [{ name, file }] from index_of_setlists.txt

var activeTab = "library"; // "library" | "setlists"
var setlistsView = "home"; // "home" | "open"
var currentPersonalId = null; // set while an editable personal setlist is open
var currentOpenSongs = null; // songs array of the currently open setlist

function storage() {
  try {
    return window.localStorage;
  } catch (e) {
    return null;
  }
}

/*
   Funcion: initSongLibrary
   Bootstraps the shared library sidebar used by both the songs page and the
   setlists page: a Library tab (search-first full song list, unchanged from
   before) and a Setlists tab (band + personal setlists, opening one shows
   its songs through the exact same interactive sheet a library song opens
   in — no more separate "dump everything" view). Which tab starts active is
   read from the page's own data-default-tab attribute.
*/
export function initSongLibrary() {
  var listEl = document.getElementById("songList");
  if (!listEl) return;

  readFile("/songs/index_of_songs.txt", function(data) {
    allSongs = parseSongIndex(data);
    allSongsLoaded = true;
    var countEl = document.getElementById("songCount");
    if (countEl) countEl.textContent = allSongs.length + " lead sheets";
    if (activeTab === "library") renderLibraryList("");
  });

  readFile("/setlists/index_of_setlists.txt", function(data) {
    setlistIndex = parseSongIndex(data);
    if (activeTab === "setlists" && setlistsView === "home") renderSetlistsHome();
  });

  var searchInput = document.getElementById("songSearch");
  if (searchInput) {
    searchInput.addEventListener("input", function() {
      renderLibraryList(searchInput.value);
    });
  }

  initTabs();
  initSetlistControls();

  var layout = document.querySelector(".rj-songs-layout");
  var defaultTab = (layout && layout.dataset.defaultTab) || "library";
  switchTab(defaultTab);
}

// ============================================================
// Tabs
// ============================================================

function initTabs() {
  var tabsEl = document.getElementById("libraryTabs");
  if (!tabsEl) return;
  tabsEl.querySelectorAll(".rj-library-tab").forEach(function(btn) {
    btn.addEventListener("click", function() {
      switchTab(btn.dataset.tab);
    });
  });
}

function switchTab(tab) {
  activeTab = tab;
  var tabsEl = document.getElementById("libraryTabs");
  if (tabsEl) {
    tabsEl.querySelectorAll(".rj-library-tab").forEach(function(btn) {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
  }

  var searchRow = document.getElementById("librarySearchRow");
  var setlistTools = document.getElementById("setlistTools");
  var railEl = document.getElementById("songRail");

  if (tab === "library") {
    if (searchRow) searchRow.hidden = false;
    if (setlistTools) setlistTools.hidden = true;
    if (railEl) railEl.hidden = false;
    var searchInput = document.getElementById("songSearch");
    renderLibraryList(searchInput ? searchInput.value : "");
  } else {
    if (searchRow) searchRow.hidden = true;
    if (setlistTools) setlistTools.hidden = false;
    if (railEl) railEl.hidden = true;
    setlistsView = "home";
    showSetlistsHome();
  }
}

// ============================================================
// Library tab (unchanged behavior, just renamed for clarity)
// ============================================================

function renderLibraryList(query) {
  var listEl = document.getElementById("songList");
  var railEl = document.getElementById("songRail");
  var isSearching = query.trim().length > 0;
  var filtered = filterSongsByQuery(allSongs, query);

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
      var list = document.getElementById("songList");
      if (!target) return;
      if (!list) { target.scrollIntoView({ block: "start" }); return; }
      // Not scrollIntoView, and not a single offsetTop read: the letter
      // headings are position: sticky, so both a rect read and offsetTop
      // report a heading's *stuck* position, not its layout position — a
      // jump back up to a letter that's currently pinned at the top then
      // does nothing. Resetting scrollTop to 0 first unsticks every
      // heading, making the offsetTop read that follows honest.
      list.scrollTop = 0;
      list.scrollTop = target.offsetTop;
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

// ============================================================
// Setlists tab: home (band + personal shelves)
// ============================================================

function songNameFor(file) {
  var match = allSongs.find(function(song) {
    return song.file === file;
  });
  return match ? match.name : file;
}

function ensureSongsLoaded(callback) {
  if (allSongsLoaded) {
    callback();
    return;
  }
  readFile("/songs/index_of_songs.txt", function(data) {
    allSongs = parseSongIndex(data);
    allSongsLoaded = true;
    callback();
  });
}

function showSetlistsHome() {
  setlistsView = "home";
  currentPersonalId = null;
  currentOpenSongs = null;

  var backBtn = document.getElementById("setlistsBackBtn");
  var newRow = document.getElementById("newSetlistRow");
  var openTools = document.getElementById("openSetlistTools");
  var addRow = document.getElementById("addSongRow");
  if (backBtn) backBtn.hidden = true;
  if (newRow) newRow.hidden = false;
  if (openTools) openTools.hidden = true;
  if (addRow) addRow.hidden = true;

  renderSetlistsHome();
}

function renderSetlistsHome() {
  var listEl = document.getElementById("songList");
  if (!listEl) return;
  listEl.innerHTML = "";

  var bandHeading = document.createElement("DIV");
  bandHeading.className = "song-list-letter";
  bandHeading.textContent = "From the band";
  listEl.appendChild(bandHeading);

  if (setlistIndex.length === 0) {
    listEl.appendChild(buildEmptyRow("No setlists published yet."));
  } else {
    setlistIndex.forEach(function(entry) {
      listEl.appendChild(buildBandSetlistRow(entry));
    });
  }

  var mineHeading = document.createElement("DIV");
  mineHeading.className = "song-list-letter";
  mineHeading.textContent = "Yours";
  listEl.appendChild(mineHeading);

  var mine = listPersonalSetlists(storage());
  if (mine.length === 0) {
    listEl.appendChild(buildEmptyRow("No personal setlists yet on this device."));
  } else {
    mine.forEach(function(entry) {
      listEl.appendChild(buildPersonalSetlistRow(entry));
    });
  }
}

function buildEmptyRow(text) {
  var empty = document.createElement("DIV");
  empty.className = "song-list-empty";
  empty.textContent = text;
  return empty;
}

function buildBandSetlistRow(entry) {
  var row = document.createElement("DIV");
  row.className = "song-list-item setlist-row";

  var main = document.createElement("BUTTON");
  main.type = "button";
  main.className = "setlist-row-main";
  main.textContent = entry.name;
  main.addEventListener("click", function() {
    openBandSetlist(entry.file, entry.name);
  });
  row.appendChild(main);

  var copyBtn = document.createElement("BUTTON");
  copyBtn.type = "button";
  copyBtn.className = "setlist-row-copy";
  copyBtn.textContent = "Copy to mine";
  copyBtn.addEventListener("click", function(e) {
    e.stopPropagation();
    readFile("/setlists/" + entry.file, function(text) {
      var parsed = parseSetlistFile(text);
      var copy = copyBandSetlistToPersonal(storage(), {
        name: parsed.name || entry.name,
        desc: parsed.desc,
        songs: parsed.songs,
      });
      openPersonalSetlist(copy.id);
    });
  });
  row.appendChild(copyBtn);

  return row;
}

function buildPersonalSetlistRow(entry) {
  var row = document.createElement("BUTTON");
  row.type = "button";
  row.className = "song-list-item setlist-row";
  row.textContent = entry.name + " · " + entry.songs.length + (entry.songs.length === 1 ? " song" : " songs");
  row.addEventListener("click", function() {
    openPersonalSetlist(entry.id);
  });
  return row;
}

// ============================================================
// Setlists tab: an open setlist (band = read-only, personal = editable)
// ============================================================

function openBandSetlist(file, fallbackName) {
  readFile("/setlists/" + file, function(text) {
    var setlist = parseSetlistFile(text);
    currentPersonalId = null;
    renderOpenSetlist(setlist.name || fallbackName, setlist.songs, null, setlist.desc);
  }, function(status) {
    console.warn("Could not load setlist " + file + " (status " + status + ")");
  });
}

function openPersonalSetlist(id) {
  var entry = getPersonalSetlist(storage(), id);
  if (!entry) return;
  currentPersonalId = id;
  ensureSongsLoaded(function() {
    renderOpenSetlist(entry.name, entry.songs, entry, entry.desc);
  });
}

function refreshOpenPersonalSetlist() {
  if (!currentPersonalId) return;
  var entry = getPersonalSetlist(storage(), currentPersonalId);
  if (!entry) {
    showSetlistsHome();
    return;
  }
  renderOpenSetlist(entry.name, entry.songs, entry, entry.desc);
}

function renderOpenSetlist(name, songs, personalEntry, desc) {
  setlistsView = "open";
  currentOpenSongs = songs;

  var backBtn = document.getElementById("setlistsBackBtn");
  var newRow = document.getElementById("newSetlistRow");
  var openTools = document.getElementById("openSetlistTools");
  var addRow = document.getElementById("addSongRow");
  var nameInput = document.getElementById("setlistNameInput");
  var copyBtn = document.getElementById("setlistCopyBtn");
  var exportBtn = document.getElementById("setlistExportBtn");
  var deleteBtn = document.getElementById("setlistDeleteBtn");

  if (backBtn) backBtn.hidden = false;
  if (newRow) newRow.hidden = true;
  if (openTools) openTools.hidden = false;
  if (addRow) addRow.hidden = !personalEntry;

  var isPersonal = !!personalEntry;
  if (nameInput) {
    nameInput.hidden = !isPersonal;
    if (isPersonal && document.activeElement !== nameInput) nameInput.value = name;
  }
  if (copyBtn) copyBtn.hidden = isPersonal;
  if (exportBtn) exportBtn.hidden = !isPersonal;
  if (deleteBtn) deleteBtn.hidden = !isPersonal;
  if (copyBtn) {
    copyBtn.onclick = function() {
      var copy = copyBandSetlistToPersonal(storage(), { name: name, desc: desc, songs: songs });
      openPersonalSetlist(copy.id);
    };
  }

  var listEl = document.getElementById("songList");
  listEl.innerHTML = "";

  if (!isPersonal) {
    var heading = document.createElement("DIV");
    heading.className = "song-list-letter";
    heading.textContent = name;
    listEl.appendChild(heading);
  }

  songs.forEach(function(song, index) {
    listEl.appendChild(buildSetlistSongRow(song, index, songs, personalEntry));
  });

  if (songs.length === 0) {
    listEl.appendChild(buildEmptyRow(isPersonal ? "No songs yet — add one below." : "This setlist has no songs."));
  }

  buildSetlistPrintBooklet(name, songs, desc);
}

function buildSetlistSongRow(song, index, songs, personalEntry) {
  var row = document.createElement("DIV");
  row.className = "song-list-item setlist-song-row";

  var number = document.createElement("SPAN");
  number.className = "setlist-song-number";
  number.textContent = index + 1;
  row.appendChild(number);

  var title = document.createElement("BUTTON");
  title.type = "button";
  title.className = "setlist-song-title";
  title.textContent = songNameFor(song.file);
  title.addEventListener("click", function() {
    openSetlistSong(song);
  });
  row.appendChild(title);

  if (personalEntry) {
    var keyInput = document.createElement("INPUT");
    keyInput.type = "text";
    keyInput.className = "setlist-song-key-input";
    keyInput.placeholder = "key";
    keyInput.value = song.key || "";
    keyInput.addEventListener("change", function() {
      updateSongKeyInPersonalSetlist(storage(), personalEntry.id, index, keyInput.value.trim());
      refreshOpenPersonalSetlist();
    });
    row.appendChild(keyInput);

    var upBtn = document.createElement("BUTTON");
    upBtn.type = "button";
    upBtn.className = "setlist-song-btn";
    upBtn.textContent = "↑";
    upBtn.disabled = index === 0;
    upBtn.addEventListener("click", function() {
      moveSongInPersonalSetlist(storage(), personalEntry.id, index, -1);
      refreshOpenPersonalSetlist();
    });
    row.appendChild(upBtn);

    var downBtn = document.createElement("BUTTON");
    downBtn.type = "button";
    downBtn.className = "setlist-song-btn";
    downBtn.textContent = "↓";
    downBtn.disabled = index === songs.length - 1;
    downBtn.addEventListener("click", function() {
      moveSongInPersonalSetlist(storage(), personalEntry.id, index, 1);
      refreshOpenPersonalSetlist();
    });
    row.appendChild(downBtn);

    var removeBtn = document.createElement("BUTTON");
    removeBtn.type = "button";
    removeBtn.className = "setlist-song-btn setlist-song-remove";
    removeBtn.textContent = "×";
    removeBtn.title = "Remove";
    removeBtn.addEventListener("click", function() {
      removeSongFromPersonalSetlist(storage(), personalEntry.id, index);
      refreshOpenPersonalSetlist();
    });
    row.appendChild(removeBtn);
  } else if (song.key) {
    var keyBadge = document.createElement("SPAN");
    keyBadge.className = "setlist-song-key-badge";
    keyBadge.textContent = song.key;
    row.appendChild(keyBadge);
  }

  return row;
}

/*
   Funcion: openSetlistSong
   Opens a setlist song in the same interactive sheet a library song opens
   in (Key/Tempo/Play/More, single paper) — this is the crux of the songs/
   setlists unification: a setlist is just a different song list feeding the
   same reader, not a separate flattened dump of every chart at once.
*/
function openSetlistSong(song) {
  readFile("/songs/" + song.file, function(text) {
    var extraTransposeSteps = 0;
    if (song.key) {
      var nativeKey = extractKeyFromAbc(text) || "C";
      extraTransposeSteps = semitonesBetweenKeys(nativeKey, song.key);
    }
    renderSongTextWithOverride(text, extraTransposeSteps);
  }, function(status) {
    console.warn("Setlist references a missing song file: " + song.file + " (status " + status + ")");
  });
}

// ============================================================
// Print booklet: the "stack every song" pattern, but only ever feeding the
// hidden #setlistPrintBooklet (print-only), never the on-screen list.
// ============================================================

function buildSetlistPrintBooklet(name, songs, desc) {
  var container = document.getElementById("setlistPrintBooklet");
  if (!container) return;
  container.innerHTML = "";
  var exportBooklet = document.getElementById("exportBooklet");
  if (exportBooklet) exportBooklet.innerHTML = "";

  var heading = document.createElement("DIV");
  heading.className = "setlist-view-title";
  heading.textContent = name;
  container.appendChild(heading);

  if (desc) {
    var cover = document.createElement("DIV");
    cover.className = "bookContent hideOnScreen setlist-cover";

    var coverTitle = document.createElement("H1");
    coverTitle.textContent = name;
    cover.appendChild(coverTitle);

    var coverDesc = document.createElement("P");
    coverDesc.textContent = desc;
    cover.appendChild(coverDesc);

    var qr = document.createElement("IMG");
    qr.src = "/images/songbook_qr.png";
    qr.height = 100;
    qr.width = 100;
    cover.appendChild(qr);

    container.appendChild(cover);
  }

  songs.forEach(function(song, index) {
    var n = index + 1;
    var titleId = "setlistPrintTitle-" + n;
    var chordId = "setlistPrintChord-" + n;
    var notationId = "setlistPrintNotation-" + n;

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

function printSetlistBooklet() {
  document.body.classList.add("export-booklet-mode");
  window.addEventListener("afterprint", function restore() {
    document.body.classList.remove("export-booklet-mode");
    window.removeEventListener("afterprint", restore);
  });
  window.print();
}

// ============================================================
// Personal setlist controls (create/import/rename/export/delete/add song)
// ============================================================

function downloadText(filename, text) {
  var blob = new Blob([text], { type: "text/plain" });
  var url = URL.createObjectURL(blob);
  var link = document.createElement("A");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function renderAddSongResults(query) {
  var resultsEl = document.getElementById("setlistAddSongResults");
  if (!resultsEl) return;
  resultsEl.innerHTML = "";
  if (!query) return;

  var matches = filterSongsByQuery(allSongs, query).slice(0, 8);
  matches.forEach(function(song) {
    var btn = document.createElement("BUTTON");
    btn.type = "button";
    btn.className = "rj-library-add-song-result";
    btn.textContent = song.name;
    btn.addEventListener("click", function() {
      addSongToPersonalSetlist(storage(), currentPersonalId, { file: song.file, key: "" });
      document.getElementById("setlistAddSongSearch").value = "";
      resultsEl.innerHTML = "";
      refreshOpenPersonalSetlist();
    });
    resultsEl.appendChild(btn);
  });
}

function initSetlistControls() {
  var backBtn = document.getElementById("setlistsBackBtn");
  if (backBtn) backBtn.addEventListener("click", showSetlistsHome);

  var newBtn = document.getElementById("newSetlistBtn");
  if (newBtn) {
    newBtn.addEventListener("click", function() {
      var nameInput = document.getElementById("newSetlistName");
      var name = (nameInput.value || "").trim() || "New setlist";
      var entry = createPersonalSetlist(storage(), name);
      nameInput.value = "";
      openPersonalSetlist(entry.id);
    });
  }

  var importInput = document.getElementById("importSetlistInput");
  if (importInput) {
    importInput.addEventListener("change", function() {
      var file = importInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function() {
        importPersonalSetlistText(storage(), String(reader.result), file.name.replace(/\.txt$/i, ""));
        renderSetlistsHome();
        importInput.value = "";
      };
      reader.readAsText(file);
    });
  }

  var nameInput = document.getElementById("setlistNameInput");
  if (nameInput) {
    nameInput.addEventListener("change", function() {
      if (!currentPersonalId) return;
      renamePersonalSetlist(storage(), currentPersonalId, nameInput.value.trim() || "Untitled setlist");
      refreshOpenPersonalSetlist();
    });
  }

  var printBtn = document.getElementById("setlistPrintBtn");
  if (printBtn) printBtn.addEventListener("click", printSetlistBooklet);

  var exportBtn = document.getElementById("setlistExportBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", function() {
      if (!currentPersonalId) return;
      var entry = getPersonalSetlist(storage(), currentPersonalId);
      var text = exportPersonalSetlistText(storage(), currentPersonalId);
      if (!text) return;
      var filename = (entry.name || "setlist").toLowerCase().replace(/[^a-z0-9]+/g, "_") + ".txt";
      downloadText(filename, text);
    });
  }

  var deleteBtn = document.getElementById("setlistDeleteBtn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", function() {
      if (!currentPersonalId) return;
      if (!window.confirm("Delete this setlist? This can't be undone.")) return;
      deletePersonalSetlist(storage(), currentPersonalId);
      showSetlistsHome();
    });
  }

  var addSearch = document.getElementById("setlistAddSongSearch");
  if (addSearch) {
    addSearch.addEventListener("input", function() {
      ensureSongsLoaded(function() {
        renderAddSongResults(addSearch.value.trim());
      });
    });
  }
}

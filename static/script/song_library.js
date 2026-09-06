"use strict";

import { renderSong, renderSongTextWithOverride, readFile, renderAbcFile, clearBookletPrintState } from "./render_abc.js";
import { parseSongIndex, groupSongsByLetter, filterSongsByQuery, songTitleSlug } from "./lib/song-index.js";
import { parseSetlistFile, isSetlistDivider } from "./lib/setlist-format.js";
import { extractKeyFromAbc, setlistTransposeSteps, formatSetlistKeyLabel, transposeKeyName, tempoBpmFromAbc } from "./lib/music-theory.js";
import { findInstrument, offsetForInstrument } from "./lib/instruments.js";
import {
  listPersonalSetlists,
  getPersonalSetlist,
  createPersonalSetlist,
  deletePersonalSetlist,
  renamePersonalSetlist,
  addSongToPersonalSetlist,
  removeSongFromPersonalSetlist,
  updateSongKeyInPersonalSetlist,
  addDividerToPersonalSetlist,
  updateDividerLabelInPersonalSetlist,
  setPersonalSetlistOrder,
  copyBandSetlistToPersonal,
  exportPersonalSetlistText,
} from "./lib/setlists-store.js";

var allSongs = []; // [{ name, file }] from index_of_songs.txt, shared by both tabs
var allSongsLoaded = false;
var setlistIndex = []; // [{ name, file }] from index_of_setlists.txt
var bandSetlistCache = {}; // file -> parsed setlist, so a re-render doesn't refetch

var activeTab = "library"; // "library" | "setlists"
var setlistsView = "home"; // "home" | "open"
var currentPersonalId = null; // set while an editable personal setlist is open
var currentOpenSongs = null; // songs array of the currently open setlist
var currentOpenSetlistName = ""; // its name, kept so a rebuild (e.g. instrument change) can reuse it
var currentOpenSetlistDesc = ""; // its optional `desc` cover blurb, same reason
var currentSongFile = null; // .abc file of the song currently in the sheet
var currentSetlistSongIndex = null; // its position in currentOpenSongs, when opened from the setlist list
var focusAddSongAfterRender = false; // return focus to the add-song box after a re-render
var addSongQuery = ""; // last add-a-song search text, re-applied after a re-render so a run of songs goes in with one search

function storage() {
  try {
    return window.localStorage;
  } catch (e) {
    return null;
  }
}

/*
   Funcion: initSongLibrary
   Bootstraps the library sidebar on the songs page: a Library tab
   (search-first full song list) and a Setlists tab (band + personal
   setlists, opening one shows its songs through the exact same interactive
   sheet a library song opens in — no more separate "dump everything" view).
   Which tab starts active is read from the page's own data-default-tab
   attribute (defaults to "library" when absent).
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
    currentSongFile = song.file;
    currentSetlistSongIndex = null;
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
  if (match) return match.name;
  // Not in the library index (e.g. a setlist referencing an unregistered
  // .abc): fall back to a readable form of the filename rather than the raw
  // "some_song.abc".
  return String(file || "")
    .replace(/\.abc$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, function(c) { return c.toUpperCase(); });
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

  // Home view has no top toolbar — the "New setlist" button sits at the foot
  // of the Yours list (buildNewSetlistButton) and opens #setlistModal.
  var setlistTools = document.getElementById("setlistTools");
  if (setlistTools) setlistTools.hidden = true;

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
  listEl.appendChild(buildNewSetlistButton());
}

/*
   A single "New setlist" button at the foot of the Yours list. It opens the
   New-setlist modal (buildNewSetlistButton -> openSetlistModal), which is
   where the name and the "start from" choice (empty / remix another setlist
   / upload a .txt) are settled — a name is only ever needed at the moment
   you make one, so the home list stays a clean shelf of setlists.
*/
function buildNewSetlistButton() {
  var btn = document.createElement("BUTTON");
  btn.type = "button";
  btn.className = "rj-library-new-setlist-btn";
  btn.innerHTML =
    '<span class="fa-solid fa-plus" aria-hidden="true"></span>' +
    '<span>New setlist</span>';
  btn.addEventListener("click", openSetlistModal);
  return btn;
}

// ============================================================
// New-setlist modal (#setlistModal) — name + one of three starting points:
//   empty  — a blank personal setlist
//   remix  — seed it with a band or personal setlist's songs
//   upload — import a .txt export (this device's or one carried over)
// Created setlists are always personal and always editable; a created one
// opens straight away in the same sheet a Library song opens in.
// ============================================================

var modalChoice = "empty"; // "empty" | "remix" | "upload"

function setModalChoice(choice) {
  modalChoice = choice;
  var choices = document.getElementById("setlistModalChoices");
  if (choices) {
    choices.querySelectorAll(".rj-modal-choice").forEach(function(btn) {
      var on = btn.dataset.choice === choice;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
    });
  }
  var remix = document.getElementById("setlistModalRemix");
  var upload = document.getElementById("setlistModalUpload");
  if (remix) remix.hidden = choice !== "remix";
  if (upload) upload.hidden = choice !== "upload";
}

function populateModalSources() {
  var select = document.getElementById("setlistModalSource");
  if (!select) return;
  select.innerHTML = "";
  if (setlistIndex.length) {
    var bandGroup = document.createElement("OPTGROUP");
    bandGroup.label = "From the band";
    setlistIndex.forEach(function(entry) {
      var opt = document.createElement("OPTION");
      opt.value = "band:" + entry.file;
      opt.textContent = entry.name;
      bandGroup.appendChild(opt);
    });
    select.appendChild(bandGroup);
  }
  var mine = listPersonalSetlists(storage());
  if (mine.length) {
    var mineGroup = document.createElement("OPTGROUP");
    mineGroup.label = "Yours";
    mine.forEach(function(entry) {
      var opt = document.createElement("OPTION");
      opt.value = "mine:" + entry.id;
      opt.textContent = entry.name;
      mineGroup.appendChild(opt);
    });
    select.appendChild(mineGroup);
  }
  if (!select.options.length) {
    var opt = document.createElement("OPTION");
    opt.value = "";
    opt.textContent = "No setlists to remix";
    opt.disabled = true;
    select.appendChild(opt);
  }
}

function openSetlistModal() {
  var overlay = document.getElementById("setlistModal");
  if (!overlay) return;
  var nameInput = document.getElementById("setlistModalName");
  var fileInput = document.getElementById("setlistModalFile");
  if (nameInput) nameInput.value = "";
  if (fileInput) fileInput.value = "";
  populateModalSources();
  setModalChoice("empty");
  overlay.hidden = false;
  if (nameInput) nameInput.focus();
}

function closeSetlistModal() {
  var overlay = document.getElementById("setlistModal");
  if (overlay) overlay.hidden = true;
}

function openCreatedSetlist(entry) {
  closeSetlistModal();
  openPersonalSetlist(entry.id);
}

function createFromModal() {
  var name = (document.getElementById("setlistModalName").value || "").trim();

  if (modalChoice === "upload") {
    var fileInput = document.getElementById("setlistModalFile");
    var file = fileInput && fileInput.files[0];
    if (!file) { if (fileInput) fileInput.click(); return; }
    var reader = new FileReader();
    reader.onload = function() {
      var parsed = parseSetlistFile(String(reader.result));
      openCreatedSetlist(copyBandSetlistToPersonal(storage(), {
        name: name || parsed.name || file.name.replace(/\.txt$/i, ""),
        desc: parsed.desc,
        songs: parsed.songs,
      }));
    };
    reader.readAsText(file);
    return;
  }

  if (modalChoice === "remix") {
    var source = document.getElementById("setlistModalSource").value;
    if (!source) return;
    if (source.indexOf("mine:") === 0) {
      var src = getPersonalSetlist(storage(), source.slice(5));
      if (!src) return;
      openCreatedSetlist(copyBandSetlistToPersonal(storage(), {
        name: name || (src.name + " copy"),
        desc: src.desc,
        songs: src.songs,
      }));
      return;
    }
    var bandFile = source.slice(5); // "band:"
    loadBandSetlist(bandFile, function(parsed) {
      openCreatedSetlist(copyBandSetlistToPersonal(storage(), {
        name: name || parsed.name || bandFile.replace(/\.txt$/i, ""),
        desc: parsed.desc,
        songs: parsed.songs,
      }));
    });
    return;
  }

  openCreatedSetlist(createPersonalSetlist(storage(), name || "New setlist"));
}

function initSetlistModal() {
  var overlay = document.getElementById("setlistModal");
  if (!overlay) return;

  overlay.addEventListener("click", function(e) {
    if (e.target === overlay) closeSetlistModal();
  });
  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape" && !overlay.hidden) closeSetlistModal();
  });

  var closeBtn = document.getElementById("setlistModalClose");
  var cancelBtn = document.getElementById("setlistModalCancel");
  if (closeBtn) closeBtn.addEventListener("click", closeSetlistModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeSetlistModal);

  var choices = document.getElementById("setlistModalChoices");
  if (choices) {
    choices.querySelectorAll(".rj-modal-choice").forEach(function(btn) {
      btn.addEventListener("click", function() { setModalChoice(btn.dataset.choice); });
    });
  }

  var createBtn = document.getElementById("setlistModalCreate");
  if (createBtn) createBtn.addEventListener("click", createFromModal);

  var nameInput = document.getElementById("setlistModalName");
  if (nameInput) {
    nameInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter") { e.preventDefault(); createFromModal(); }
    });
  }

  var fileInput = document.getElementById("setlistModalFile");
  if (fileInput) {
    fileInput.addEventListener("change", function() {
      if (fileInput.files[0]) setModalChoice("upload");
    });
  }
}

function buildEmptyRow(text) {
  var empty = document.createElement("DIV");
  empty.className = "song-list-empty";
  empty.textContent = text;
  return empty;
}

function songCountLabel(n) {
  return n + (n === 1 ? " song" : " songs");
}

// Song items only — set dividers ("breaks") don't count toward the total.
function countSetlistSongs(items) {
  return (items || []).filter(function(item) {
    return !isSetlistDivider(item);
  }).length;
}

// Fetch + parse a band setlist .txt once, then serve it from an in-memory
// cache — the home list asks for every band setlist's song count on each
// render, and opening one asks again.
function loadBandSetlist(file, onLoad, onError) {
  if (bandSetlistCache[file]) {
    onLoad(bandSetlistCache[file]);
    return;
  }
  readFile("/setlists/" + file, function(text) {
    var parsed = parseSetlistFile(text);
    bandSetlistCache[file] = parsed;
    onLoad(parsed);
  }, onError);
}

function buildSetlistRow(title, count, onOpen, onDelete) {
  var row = document.createElement("DIV");
  row.className = "song-list-item setlist-row";

  var main = document.createElement("BUTTON");
  main.type = "button";
  main.className = "setlist-row-main";
  main.textContent = title;
  main.addEventListener("click", onOpen);
  row.appendChild(main);

  var meta = document.createElement("SPAN");
  meta.className = "setlist-row-meta";
  if (count != null) meta.textContent = songCountLabel(count);
  row.appendChild(meta);

  // Personal setlists carry a trash icon on their overview row — deleting one
  // is a home-view action, not something buried inside the open setlist.
  if (onDelete) {
    var del = document.createElement("BUTTON");
    del.type = "button";
    del.className = "setlist-row-delete";
    del.title = "Delete setlist";
    del.setAttribute("aria-label", "Delete setlist “" + title + "”");
    del.innerHTML = '<span class="fa-solid fa-trash-can" aria-hidden="true"></span>';
    del.addEventListener("click", function(e) {
      e.stopPropagation();
      onDelete();
    });
    row.appendChild(del);
  }

  return { row: row, meta: meta };
}

function buildBandSetlistRow(entry) {
  var built = buildSetlistRow(entry.name, null, function() {
    openBandSetlist(entry.file, entry.name);
  });
  loadBandSetlist(entry.file, function(parsed) {
    built.meta.textContent = songCountLabel(countSetlistSongs(parsed.songs));
  });
  return built.row;
}

function buildPersonalSetlistRow(entry) {
  return buildSetlistRow(entry.name, countSetlistSongs(entry.songs), function() {
    openPersonalSetlist(entry.id);
  }, function() {
    if (!window.confirm("Delete “" + entry.name + "”? This can't be undone.")) return;
    deletePersonalSetlist(storage(), entry.id);
    if (currentPersonalId === entry.id) currentPersonalId = null;
    renderSetlistsHome();
  }).row;
}

// ============================================================
// Setlists tab: an open setlist (band = read-only, personal = editable)
// ============================================================

function openBandSetlist(file, fallbackName) {
  loadBandSetlist(file, function(setlist) {
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
  currentOpenSetlistName = name;
  currentOpenSetlistDesc = desc || "";

  var isPersonal = !!personalEntry;
  if (!isPersonal) addSongQuery = "";

  var setlistTools = document.getElementById("setlistTools");
  var backBtn = document.getElementById("setlistsBackBtn");
  var openTools = document.getElementById("openSetlistTools");
  var titleRow = document.getElementById("setlistTitleRow");
  var titleText = document.getElementById("setlistTitleText");
  var nameInput = document.getElementById("setlistNameInput");
  var renameBtn = document.getElementById("setlistRenameBtn");
  var exportBtn = document.getElementById("setlistExportBtn");

  if (setlistTools) setlistTools.hidden = false;
  if (backBtn) backBtn.hidden = false;
  if (openTools) openTools.hidden = false;

  // The title drops below the "Print …" group, sitting directly on top of
  // the song list — for band setlists and for personal ones (whose title
  // carries the editable field + pencil/export cluster) alike.
  if (titleRow && openTools) openTools.append(titleRow);

  // The name reads as a plain heading; the pencil (personal only), or a
  // double-click on it, swaps in the edit field — see initSetlistControls.
  if (titleText) {
    titleText.hidden = false;
    titleText.textContent = name;
  }
  if (nameInput) nameInput.hidden = true;
  if (renameBtn) renameBtn.hidden = !isPersonal;
  if (exportBtn) exportBtn.hidden = !isPersonal;

  var listEl = document.getElementById("songList");
  listEl.innerHTML = "";

  // A setlist can be split into sets by "break" dividers (Set 1 before the
  // first break, Set 2 after it, …). When there's at least one, song numbers
  // restart at 1 in each set and a "Set N" heading precedes each block;
  // without any, numbering is a single flat 1..n as before.
  var hasDividers = songs.some(isSetlistDivider);
  if (hasDividers && !(songs.length > 0 && isSetlistDivider(songs[0]))) {
    listEl.appendChild(buildSetHeaderRow("Set 1"));
  }
  var setNumber = 1;
  var songInSet = 0;
  songs.forEach(function(item, index) {
    if (isSetlistDivider(item)) {
      setNumber += 1;
      songInSet = 0;
      listEl.appendChild(buildSetlistDividerRow(item, index, personalEntry, setNumber));
      return;
    }
    songInSet += 1;
    listEl.appendChild(buildSetlistSongRow(item, index, personalEntry, hasDividers ? songInSet : index + 1));
  });

  if (songs.length === 0) {
    listEl.appendChild(buildEmptyRow(isPersonal ? "No songs yet — add one below." : "This setlist has no songs."));
  }

  if (isPersonal) {
    listEl.appendChild(buildAddSongRow());
    if (focusAddSongAfterRender) {
      focusAddSongAfterRender = false;
      var addSearch = document.getElementById("setlistAddSongSearch");
      if (addSearch) {
        addSearch.value = addSongQuery;
        addSearch.focus();
        if (addSongQuery) {
          ensureSongsLoaded(function() { renderAddSongResults(addSongQuery); });
        }
      }
    }
    if (focusHandleAfterRender != null) {
      var handles = listEl.querySelectorAll(".setlist-drag-handle");
      if (handles[focusHandleAfterRender]) handles[focusHandleAfterRender].focus();
      focusHandleAfterRender = null;
    }
  }

  buildSetlistPrintBooklet(name, songs, desc);

  highlightCurrentSetlistSong();
}

// A drag handle (personal setlists) plus a remove button — the shared tail
// of a setlist song row and a set-divider row. Reorder by dragging the
// handle (mouse or touch, see beginRowDrag) or, with it focused, the up/down
// arrow keys.
function appendRowControls(row, index, personalEntry) {
  var handle = document.createElement("BUTTON");
  handle.type = "button";
  handle.className = "setlist-drag-handle";
  handle.title = "Drag to reorder";
  handle.setAttribute("aria-label", "Reorder — drag, or use the arrow keys");
  handle.innerHTML = '<span class="fa-solid fa-grip-vertical" aria-hidden="true"></span>';
  handle.addEventListener("pointerdown", function(e) {
    beginRowDrag(e, handle, row, personalEntry.id);
  });
  handle.addEventListener("keydown", function(e) {
    var step = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (!step) return;
    e.preventDefault();
    nudgeRow(row, personalEntry.id, step);
  });
  row.insertBefore(handle, row.firstChild);

  var removeBtn = document.createElement("BUTTON");
  removeBtn.type = "button";
  removeBtn.className = "setlist-song-btn setlist-song-remove";
  removeBtn.textContent = "×";
  removeBtn.title = "Remove";
  removeBtn.setAttribute("aria-label", "Remove");
  removeBtn.addEventListener("click", function() {
    removeSongFromPersonalSetlist(storage(), personalEntry.id, index);
    refreshOpenPersonalSetlist();
  });
  row.appendChild(removeBtn);
}

// ============================================================
// Drag-to-reorder for an open personal setlist. Pointer events (not the
// HTML5 drag API) so it works on touch as well as mouse. Song rows and
// divider rows carry data-setlist-index (their position in the stored
// `songs` array); the drag physically relocates the row among its siblings
// as the pointer moves and renumbers live, then on drop reads the rows'
// data-setlist-index back in DOM order to persist the new arrangement.
// ============================================================

var rowDrag = null;
var focusHandleAfterRender = null; // draggable-row index to re-focus after a keyboard nudge

function draggableRows() {
  var listEl = document.getElementById("songList");
  return listEl
    ? Array.prototype.slice.call(listEl.querySelectorAll(".setlist-song-row, .setlist-divider-row"))
    : [];
}

// Rewrites the "1, 2, 3 …" badges (and each divider's "Set N" placeholder)
// straight from the current DOM order — used mid-drag, where no re-render
// has happened yet. Mirrors renderOpenSetlist: numbers restart each set
// when the list has any dividers, otherwise run 1..n across the whole list.
function renumberOpenSetlist() {
  var listEl = document.getElementById("songList");
  if (!listEl) return;
  var rows = listEl.querySelectorAll(".setlist-song-row, .setlist-divider-row, .setlist-set-heading");
  var hasDividers = listEl.querySelector(".setlist-divider-row, .setlist-set-heading") != null;
  var n = 0, songInSet = 0, setNumber = 1;
  rows.forEach(function(row) {
    if (row.classList.contains("setlist-song-row")) {
      n += 1;
      songInSet += 1;
      var numEl = row.querySelector(".setlist-song-number");
      if (numEl) numEl.textContent = hasDividers ? songInSet : n;
    } else {
      songInSet = 0;
      if (row.classList.contains("setlist-divider-row")) {
        setNumber += 1;
        var input = row.querySelector(".setlist-divider-input");
        if (input) input.placeholder = "Set " + setNumber;
      }
    }
  });
}

// Keyboard equivalent of a one-slot drag: swap `row` with its neighbour one
// step up or down (a divider counts as a position — nudging "past" one
// crosses into the next set), then re-focus its handle where it landed.
function nudgeRow(row, personalId, step) {
  var rows = draggableRows();
  var from = rows.indexOf(row);
  var to = from + step;
  if (from === -1 || to < 0 || to >= rows.length) return;
  var order = rows.map(function(_row, i) { return i; });
  order.splice(from, 1);
  order.splice(to, 0, from);
  focusHandleAfterRender = to;
  setPersonalSetlistOrder(storage(), personalId, order.map(function(i) {
    return Number(rows[i].dataset.setlistIndex);
  }));
  refreshOpenPersonalSetlist();
}

function beginRowDrag(e, handle, row, personalId) {
  if (e.button != null && e.button !== 0) return;
  e.preventDefault();
  rowDrag = { personalId: personalId, row: row, moved: false };
  row.classList.add("setlist-row-dragging");
  document.body.classList.add("setlist-dragging");
  // Capture keeps the move/up stream coming even when the finger or cursor
  // slides off the handle; the events still bubble to these window listeners.
  try { handle.setPointerCapture(e.pointerId); } catch (_e) { /* not fatal */ }
  window.addEventListener("pointermove", onRowDragMove);
  window.addEventListener("pointerup", endRowDrag, { once: true });
  window.addEventListener("pointercancel", endRowDrag, { once: true });
}

function onRowDragMove(e) {
  if (!rowDrag) return;
  var dragged = rowDrag.row;
  var others = draggableRows().filter(function(r) { return r !== dragged; });
  if (others.length === 0) return;

  var before = null; // the sibling the dragged row should sit in front of
  for (var i = 0; i < others.length; i++) {
    var box = others[i].getBoundingClientRect();
    if (e.clientY < box.top + box.height / 2) { before = others[i]; break; }
  }
  var anchor = before || others[others.length - 1].nextSibling;
  if (anchor !== dragged && dragged.nextSibling !== anchor) {
    dragged.parentNode.insertBefore(dragged, anchor);
    rowDrag.moved = true;
    renumberOpenSetlist();
  }
}

function endRowDrag() {
  window.removeEventListener("pointermove", onRowDragMove);
  if (!rowDrag) return;
  var drag = rowDrag;
  rowDrag = null;
  drag.row.classList.remove("setlist-row-dragging");
  document.body.classList.remove("setlist-dragging");
  if (!drag.moved) return;
  var order = draggableRows().map(function(r) { return Number(r.dataset.setlistIndex); });
  setPersonalSetlistOrder(storage(), drag.personalId, order);
  refreshOpenPersonalSetlist();
}

// A "Set N" band-style heading in the song list (read-only band setlists,
// and the implicit "Set 1" above the first break).
function buildSetHeaderRow(text) {
  var row = document.createElement("DIV");
  row.className = "song-list-letter setlist-set-heading";
  row.textContent = text;
  return row;
}

// A set divider: a plain heading for band setlists, an editable label +
// drag/remove controls for personal ones.
function buildSetlistDividerRow(item, index, personalEntry, setNumber) {
  if (!personalEntry) {
    return buildSetHeaderRow(item.divider || ("Set " + setNumber));
  }

  var row = document.createElement("DIV");
  row.className = "song-list-item setlist-divider-row";
  row.dataset.setlistIndex = index;

  var label = document.createElement("INPUT");
  label.type = "text";
  label.className = "setlist-divider-input";
  label.placeholder = "Set " + setNumber;
  label.value = item.divider || "";
  label.addEventListener("change", function() {
    updateDividerLabelInPersonalSetlist(storage(), personalEntry.id, index, label.value.trim());
    refreshOpenPersonalSetlist();
  });
  row.appendChild(label);

  appendRowControls(row, index, personalEntry);
  return row;
}

// Turns a semitone-override value (what personal setlists now store) into
// the plain digits shown in the stepper — blank for none, and blank for a
// legacy key-name override, which the number field can't represent (the
// stored value is left intact until the musician sets a number).
function semitoneFieldValue(raw) {
  var trimmed = String(raw == null ? "" : raw).trim();
  return /^[+-]?\d+$/.test(trimmed) && parseInt(trimmed, 10) !== 0 ? String(parseInt(trimmed, 10)) : "";
}

function buildSetlistSongRow(song, index, personalEntry, displayNumber) {
  var row = document.createElement("DIV");
  row.className = "song-list-item setlist-song-row";
  row.dataset.setlistIndex = index;
  row.dataset.songFile = song.file;

  var number = document.createElement("SPAN");
  number.className = "setlist-song-number";
  number.textContent = displayNumber;
  row.appendChild(number);

  var title = document.createElement("BUTTON");
  title.type = "button";
  title.className = "setlist-song-title";
  title.textContent = songNameFor(song.file);
  title.addEventListener("click", function() {
    openSetlistSong(song, index);
  });
  row.appendChild(title);

  if (personalEntry) {
    var stInput = document.createElement("INPUT");
    stInput.type = "number";
    stInput.className = "setlist-song-semitones";
    stInput.min = "-12";
    stInput.max = "12";
    stInput.step = "1";
    stInput.placeholder = "0";
    stInput.title = "Transpose, in semitones";
    stInput.setAttribute("aria-label", "Transpose " + songNameFor(song.file) + ", in semitones");
    stInput.value = semitoneFieldValue(song.key);
    stInput.addEventListener("change", function() {
      var n = parseInt(stInput.value, 10);
      var stored = Number.isFinite(n) && n !== 0 ? String(n) : "";
      updateSongKeyInPersonalSetlist(storage(), personalEntry.id, index, stored);
      refreshOpenPersonalSetlist();
    });
    row.appendChild(stInput);

    appendRowControls(row, index, personalEntry);
  } else {
    var badgeText = formatSetlistKeyLabel(song.key);
    if (badgeText) {
      var keyBadge = document.createElement("SPAN");
      keyBadge.className = "setlist-song-key-badge";
      keyBadge.textContent = badgeText;
      row.appendChild(keyBadge);
    }
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
function openSetlistSong(song, index) {
  currentSongFile = song.file;
  currentSetlistSongIndex = index == null ? null : Number(index);
  highlightCurrentSetlistSong();
  readFile("/songs/" + song.file, function(text) {
    var extraTransposeSteps = setlistTransposeSteps(song.key, extractKeyFromAbc(text));
    renderSongTextWithOverride(text, extraTransposeSteps);
  }, function(status) {
    console.warn("Setlist references a missing song file: " + song.file + " (status " + status + ")");
  });
}

/*
   Funcion: stepSetlistSong
   Open the previous (dir < 0) or next (dir > 0) song of the open setlist in
   the sheet, skipping set-break dividers and clamping at both ends. Wired to
   the up/down arrow keys while a setlist is open (see initSetlistControls),
   so a musician can walk the set without reaching for the mouse.
*/
function stepSetlistSong(dir) {
  if (setlistsView !== "open" || !currentOpenSongs || !currentOpenSongs.length) return;
  var songs = currentOpenSongs;
  var songIndexes = [];
  songs.forEach(function(item, i) {
    if (!isSetlistDivider(item)) songIndexes.push(i);
  });
  if (!songIndexes.length) return;

  var pos = songIndexes.indexOf(currentSetlistSongIndex);
  var next;
  if (pos === -1) {
    next = dir > 0 ? songIndexes[0] : songIndexes[songIndexes.length - 1];
  } else {
    var np = pos + dir;
    if (np < 0 || np >= songIndexes.length) return; // clamp at the ends
    next = songIndexes[np];
  }

  openSetlistSong(songs[next], next);
  var listEl = document.getElementById("songList");
  var row = listEl && listEl.querySelector('.setlist-song-row[data-setlist-index="' + next + '"]');
  if (row) row.scrollIntoView({ block: "nearest" });
}

/*
   Funcion: highlightCurrentSetlistSong
   Marks the row in the open setlist's song list that matches the song
   currently shown in the sheet, so a musician can see where they are in the
   set. Matches by .abc file; when the sheet was opened from a specific
   setlist row, narrows to that exact position (a song can appear twice).
*/
function highlightCurrentSetlistSong() {
  var listEl = document.getElementById("songList");
  if (!listEl) return;
  listEl.querySelectorAll(".setlist-song-row").forEach(function(row) {
    var isCurrent = !!currentSongFile &&
      row.dataset.songFile === currentSongFile &&
      (currentSetlistSongIndex == null ||
        Number(row.dataset.setlistIndex) === currentSetlistSongIndex);
    row.classList.toggle("is-current-song", isCurrent);
    if (isCurrent) row.setAttribute("aria-current", "true");
    else row.removeAttribute("aria-current");
  });
}

// ============================================================
// Printing an open setlist. One hidden container (#setlistPrintBooklet,
// print-only) holds everything; a body class picks which of the three
// printed forms actually shows:
//   - "Print setlist"   -> just the numbered song list (stage list)
//   - "Print chordbook"  -> every song's title + chord grid (no staves)
//   - "Print songbook"   -> every song's title + chords + staff notation
// Chordbook and songbook share the exact same stacked DOM; chordbook simply
// hides the notation in CSS (body.export-mode-chordbook .notation).
// ============================================================

function buildBookletSetHeading(text) {
  var el = document.createElement("DIV");
  el.className = "setlist-booklet-set-heading pageBreakBefore";
  el.textContent = text;
  return el;
}

function selectedInstrumentValue() {
  var sel = document.getElementById("instrument");
  return sel ? sel.value : "concert_pitch";
}

// Label of the instrument the sheet is currently set to — the whole booklet
// is engraved (and transposed) for it, so it's named on the front-matter page.
function selectedInstrumentLabel() {
  var found = findInstrument(selectedInstrumentValue());
  return found ? found.label : "Concert pitch";
}

// True when the selected instrument reads in a different key from concert
// (trumpet, clarinet, saxes, sousaphone). Concert pitch, Concert + Roman and
// trombone all read concert, so the stage list shows a single key column.
function exportInstrumentTransposes() {
  return offsetForInstrument(selectedInstrumentValue()) !== 0;
}

// The front-matter line naming what the export is engraved for.
function exportInstrumentLine() {
  var value = selectedInstrumentValue();
  if (value === "concert_pitch" || value === "concert_+_roman") return "Concert pitch";
  if (exportInstrumentTransposes()) return "Transposed for " + selectedInstrumentLabel();
  return selectedInstrumentLabel() + " — concert pitch"; // e.g. trombone (bass clef, no transpose)
}

/*
   Per-song facts the printed forms show, resolved once the .abc has loaded,
   with keys spelled out ("B♭") and always shown — even for C — since on stage
   you call the key, not a semitone offset:
     concert    — the tune's K: plus the setlist's per-song override only
     instrument — also folds in the selected instrument's offset (what that
                  player reads; matches the engraved chordbook / songbook)
     bpm        — the tune's Q: tempo
   Both keys fall back to the raw override badge with no readable K:.
*/
function resolvedExportSongMeta(abcText, song) {
  var bpm = tempoBpmFromAbc(abcText);
  var nativeKey = extractKeyFromAbc(abcText);
  if (!nativeKey) {
    var fallback = formatSetlistKeyLabel(song.key);
    return { concert: fallback, instrument: fallback, bpm: bpm };
  }
  var overrideSteps = setlistTransposeSteps(song.key, nativeKey);
  return {
    concert: transposeKeyName(nativeKey, overrideSteps),
    instrument: transposeKeyName(nativeKey, overrideSteps + offsetForInstrument(selectedInstrumentValue())),
    bpm: bpm,
  };
}

// Fills the per-song slots for song `n` once its .abc file has loaded: the
// stage table's Concert / instrument / tempo cells, and the front-matter
// index (which tracks the charts, so it gets the instrument key).
function fillBookletSongMeta(n, meta) {
  function set(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value || "";
  }
  set("setlistStageConcert-" + n, meta.concert);
  set("setlistStageInstr-" + n, meta.instrument);
  set("setlistStageTempo-" + n, meta.bpm ? (meta.bpm + " bpm") : "");
  set("setlistIndexKey-" + n, meta.instrument);
}

/*
   The "Print setlist" form: a table of song titles for taping to a music
   stand, numbered per set. Columns: number, title, a "Concert" key column
   and — only when the export is for a transposing instrument — that
   instrument's own key column (headed by its name), then tempo. The key/tempo
   cells (ids setlistStage{Concert,Instr,Tempo}-<n>, <n> matching the booklet
   body's per-song counter) are filled once each .abc loads.
*/
function buildSetlistStageList(container, songs) {
  var list = document.createElement("DIV");
  list.className = "setlist-stage-list";

  var showInstrCol = exportInstrumentTransposes();
  var columns = ["num", "song", "concert"];
  if (showInstrCol) columns.push("instr");
  columns.push("tempo");
  var headings = {
    num: "", song: "", concert: "Concert",
    instr: selectedInstrumentLabel(), tempo: "bpm",
  };

  var table = document.createElement("TABLE");
  table.className = "setlist-stage-table";

  var thead = document.createElement("THEAD");
  var headRow = document.createElement("TR");
  columns.forEach(function(col) {
    var th = document.createElement("TH");
    th.className = "stage-c-" + col;
    th.textContent = headings[col];
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  var tbody = document.createElement("TBODY");

  function appendSetRow(label) {
    var tr = document.createElement("TR");
    tr.className = "setlist-stage-set-row";
    var th = document.createElement("TH");
    th.setAttribute("colspan", String(columns.length));
    th.textContent = label;
    tr.appendChild(th);
    tbody.appendChild(tr);
  }

  var hasDividers = songs.some(isSetlistDivider);
  var setNumber = 1;
  var songInSet = 0;
  var n = 0; // matches the booklet body's per-song counter

  if (hasDividers && !(songs.length > 0 && isSetlistDivider(songs[0]))) {
    appendSetRow("Set 1");
  }

  songs.forEach(function(song) {
    if (isSetlistDivider(song)) {
      setNumber += 1;
      songInSet = 0;
      appendSetRow(song.divider || ("Set " + setNumber));
      return;
    }
    n += 1;
    songInSet += 1;
    var tr = document.createElement("TR");

    var numCell = document.createElement("TD");
    numCell.className = "stage-c-num";
    numCell.textContent = songInSet + ".";
    tr.appendChild(numCell);

    var nameCell = document.createElement("TD");
    nameCell.className = "stage-c-song";
    nameCell.textContent = songNameFor(song.file);
    tr.appendChild(nameCell);

    var concertCell = document.createElement("TD");
    concertCell.className = "stage-c-concert";
    concertCell.id = "setlistStageConcert-" + n;
    concertCell.textContent = formatSetlistKeyLabel(song.key); // provisional
    tr.appendChild(concertCell);

    if (showInstrCol) {
      var instrCell = document.createElement("TD");
      instrCell.className = "stage-c-instr";
      instrCell.id = "setlistStageInstr-" + n;
      tr.appendChild(instrCell);
    }

    var tempoCell = document.createElement("TD");
    tempoCell.className = "stage-c-tempo";
    tempoCell.id = "setlistStageTempo-" + n;
    tr.appendChild(tempoCell);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  list.appendChild(table);
  container.appendChild(list);
}

// Front-matter page for the chordbook / songbook exports: setlist name, which
// form it is, the instrument it's transposed for, the date, and a numbered
// index of the songs (per-set numbering, same as the body). Hidden by CSS for
// the plain "Print setlist" form.
function buildSetlistBookletFrontMatter(name, songs) {
  var fm = document.createElement("DIV");
  fm.className = "setlist-booklet-frontmatter";

  var title = document.createElement("H1");
  title.className = "setlist-booklet-fm-title";
  title.textContent = name;
  fm.appendChild(title);

  var sub = document.createElement("DIV");
  sub.className = "setlist-booklet-fm-sub";
  sub.id = "setlistBookletFmSub";
  sub.textContent = "Songbook"; // set per-mode by printSetlist()
  fm.appendChild(sub);

  var meta = document.createElement("DIV");
  meta.className = "setlist-booklet-fm-meta";
  var instr = document.createElement("DIV");
  instr.textContent = exportInstrumentLine();
  meta.appendChild(instr);
  var when = document.createElement("DIV");
  when.textContent = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  meta.appendChild(when);
  fm.appendChild(meta);

  var index = document.createElement("DIV");
  index.className = "setlist-booklet-index";
  var hasDividers = songs.some(isSetlistDivider);
  var setNumber = 1;
  var n = 0;
  var songInSet = 0;
  var ol = document.createElement("OL");

  function indexHeading(text) {
    var h = document.createElement("DIV");
    h.className = "setlist-booklet-index-heading";
    h.textContent = text;
    return h;
  }

  if (hasDividers && !(songs.length > 0 && isSetlistDivider(songs[0]))) {
    index.appendChild(indexHeading("Set 1"));
  }
  index.appendChild(ol);
  songs.forEach(function(song) {
    if (isSetlistDivider(song)) {
      setNumber += 1;
      songInSet = 0;
      index.appendChild(indexHeading(song.divider || ("Set " + setNumber)));
      ol = document.createElement("OL");
      index.appendChild(ol);
      return;
    }
    n += 1;
    songInSet += 1;
    var li = document.createElement("LI");
    li.value = hasDividers ? songInSet : n;
    var nm = document.createElement("SPAN");
    nm.className = "setlist-booklet-index-name";
    nm.textContent = songNameFor(song.file);
    li.appendChild(nm);
    var k = document.createElement("SPAN");
    k.className = "setlist-booklet-index-key";
    k.id = "setlistIndexKey-" + n;
    li.appendChild(k);
    ol.appendChild(li);
  });
  fm.appendChild(index);
  return fm;
}

function buildSetlistPrintBooklet(name, songs, desc) {
  var container = document.getElementById("setlistPrintBooklet");
  if (!container) return;
  container.innerHTML = "";

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

  // Front matter first — every form opens with it. The stage list is appended
  // last (see below) so it sits immediately after the front matter for "Print
  // setlist" (the hidden chart stack between them collapses to nothing), while
  // leaving the front matter directly adjacent to the first chart for the
  // chordbook's `frontmatter + heading` page-break rule.
  container.appendChild(buildSetlistBookletFrontMatter(name, songs));

  var hasDividers = songs.some(isSetlistDivider);
  var setNumber = 1;
  var n = 0; // unique across the whole booklet — drives the element ids
  var songInSet = 0; // restarts each set — the number shown before the title
  // A "Set N" heading opens the page; the song right under it must not then
  // start its own new page, so the break moves onto the heading instead.
  var headingLeadsPage = false;
  if (hasDividers && !(songs.length > 0 && isSetlistDivider(songs[0]))) {
    container.appendChild(buildBookletSetHeading("Set 1"));
    headingLeadsPage = true;
  }
  songs.forEach(function(song) {
    if (isSetlistDivider(song)) {
      setNumber += 1;
      songInSet = 0;
      container.appendChild(buildBookletSetHeading(song.divider || ("Set " + setNumber)));
      headingLeadsPage = true;
      return;
    }
    n += 1;
    songInSet += 1;
    var slotN = n; // captured by the async readFile callback below (n itself keeps mutating)
    var songNumber = hasDividers ? songInSet : n; // captured by the async readFile callback below
    var titleId = "setlistPrintTitle-" + n;
    var chordId = "setlistPrintChord-" + n;
    var notationId = "setlistPrintNotation-" + n;

    var songEl = document.createElement("DIV");
    songEl.className = "setlist-booklet-song";
    if (!headingLeadsPage) songEl.classList.add("pageBreakBefore");
    headingLeadsPage = false;

    var titleEl = document.createElement("DIV");
    titleEl.id = titleId;
    titleEl.classList.add("songtitle");
    songEl.appendChild(titleEl);

    var chordEl = document.createElement("DIV");
    chordEl.id = chordId;
    chordEl.classList.add("chordtable");
    songEl.appendChild(chordEl);

    var notationEl = document.createElement("DIV");
    notationEl.id = notationId;
    notationEl.classList.add("notation");
    songEl.appendChild(notationEl);

    container.appendChild(songEl);

    readFile("/songs/" + song.file, function(text) {
      var extraTransposeSteps = setlistTransposeSteps(song.key, extractKeyFromAbc(text));
      renderAbcFile(text, notationId, chordId, titleId, songNumber + ". ", false, extraTransposeSteps);
      fillBookletSongMeta(slotN, resolvedExportSongMeta(text, song));
    }, function(status) {
      console.warn("Setlist references a missing song file: " + song.file + " (status " + status + ")");
    });
  });

  // Appended after the (hidden-in-setlist-mode) chart stack: for "Print
  // setlist" the stack collapses and this lands right under the front matter.
  buildSetlistStageList(container, songs);
}

var SETLIST_PRINT_MODES = ["setlist", "chordbook", "songbook"];

var SETLIST_PRINT_MODE_LABELS = { setlist: "Setlist", chordbook: "Chordbook", songbook: "Songbook" };

function printSetlist(mode) {
  var body = document.body;
  clearBookletPrintState(); // drop any stale mode a prior print left behind
  var sub = document.getElementById("setlistBookletFmSub");
  if (sub) sub.textContent = SETLIST_PRINT_MODE_LABELS[mode] || "Songbook";
  body.classList.add("export-booklet-mode");
  SETLIST_PRINT_MODES.forEach(function(m) {
    body.classList.toggle("export-mode-" + m, m === mode);
  });
  window.addEventListener("afterprint", function restore() {
    body.classList.remove("export-booklet-mode");
    SETLIST_PRINT_MODES.forEach(function(m) {
      body.classList.remove("export-mode-" + m);
    });
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
  resultsEl.classList.toggle("is-open", !!query);
  if (!query) return;

  var matches = filterSongsByQuery(allSongs, query).slice(0, 8);
  if (matches.length === 0) {
    var empty = document.createElement("DIV");
    empty.className = "rj-library-add-song-empty";
    empty.textContent = "No songs match “" + query + "”";
    resultsEl.appendChild(empty);
    return;
  }
  matches.forEach(function(song) {
    var btn = document.createElement("BUTTON");
    btn.type = "button";
    btn.className = "rj-library-add-song-result";
    btn.innerHTML = '<span class="fa-solid fa-plus" aria-hidden="true"></span>';
    var name = document.createElement("SPAN");
    name.className = "rj-library-add-song-result-name";
    name.textContent = song.name;
    btn.appendChild(name);
    btn.addEventListener("click", function() {
      addSongToPersonalSetlist(storage(), currentPersonalId, { file: song.file, key: "" });
      focusAddSongAfterRender = true; // keeps addSongQuery's results up for the next add
      refreshOpenPersonalSetlist();
    });
    resultsEl.appendChild(btn);
  });
}

/*
   The compose zone at the foot of an open personal setlist's song list
   (inside the scroll area) rather than in the top toolbar — you grow the
   list where it ends, not away from it. A labelled tray holding a
   search-to-add field (results open in flow below it) and, set apart as a
   lighter dashed button, "Add a set break". Rebuilt on every render, so its
   handlers are wired here.
*/
function buildAddSongRow() {
  var wrap = document.createElement("DIV");
  wrap.className = "rj-library-add-song rj-library-add-song-inline";

  var label = document.createElement("DIV");
  label.className = "rj-library-add-label";
  label.textContent = "Add to setlist";
  wrap.appendChild(label);

  var field = document.createElement("DIV");
  field.className = "rj-library-add-song-field";

  var inputWrap = document.createElement("DIV");
  inputWrap.className = "rj-library-add-song-inputwrap";
  inputWrap.innerHTML = '<span class="fa-solid fa-magnifying-glass" aria-hidden="true"></span>';

  var search = document.createElement("INPUT");
  search.type = "search";
  search.id = "setlistAddSongSearch";
  search.placeholder = "Search songs to add…";
  search.autocomplete = "off";
  search.addEventListener("input", function() {
    addSongQuery = search.value.trim();
    ensureSongsLoaded(function() {
      renderAddSongResults(addSongQuery);
    });
  });
  inputWrap.appendChild(search);
  field.appendChild(inputWrap);

  var results = document.createElement("DIV");
  results.id = "setlistAddSongResults";
  results.className = "rj-library-add-song-results";
  field.appendChild(results);
  wrap.appendChild(field);

  var breakBtn = document.createElement("BUTTON");
  breakBtn.type = "button";
  breakBtn.className = "rj-library-add-break";
  breakBtn.innerHTML =
    '<span class="fa-solid fa-plus" aria-hidden="true"></span>' +
    '<span class="rj-library-add-break-label">Add a set break</span>';
  breakBtn.addEventListener("click", function() {
    if (!currentPersonalId) return;
    addDividerToPersonalSetlist(storage(), currentPersonalId);
    refreshOpenPersonalSetlist();
  });
  wrap.appendChild(breakBtn);

  return wrap;
}

function initSetlistControls() {
  var backBtn = document.getElementById("setlistsBackBtn");
  if (backBtn) backBtn.addEventListener("click", showSetlistsHome);

  // The "New setlist" button is rendered per-view at the foot of the Yours
  // list (buildNewSetlistButton) and opens the modal wired by initSetlistModal
  // below; "Add song"/"Add break" live at the foot of an open setlist
  // (buildAddSongRow) — so those handlers are wired there, not here.
  initSetlistModal();

  initSetlistRename();

  // Up/down arrows walk the open setlist song-by-song — but only when the
  // focus isn't in a field that wants the arrows itself (the Key/Tempo/
  // semitone steppers, the instrument or divider inputs) or on a drag handle
  // (arrows there reorder the row).
  document.addEventListener("keydown", function(e) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    if (setlistsView !== "open") return;
    var el = e.target;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" || el.isContentEditable ||
        (el.closest && el.closest(".setlist-drag-handle")))) return;
    e.preventDefault();
    stepSetlistSong(e.key === "ArrowDown" ? 1 : -1);
  });

  [
    ["printSetlistBtn", "setlist"],
    ["printChordbookBtn", "chordbook"],
    ["printSongbookBtn", "songbook"]
  ].forEach(function(pair) {
    var btn = document.getElementById(pair[0]);
    if (btn) btn.addEventListener("click", function() { printSetlist(pair[1]); });
  });

  // The print booklet is engraved and transposed for whichever instrument the
  // sheet is on. render_abc.js already re-renders the on-screen sheet when the
  // instrument changes; do the same for the (off-screen) booklet so a later
  // "Print …" reflects the current instrument, not the one selected on open.
  var instrumentSelect = document.getElementById("instrument");
  if (instrumentSelect) {
    instrumentSelect.addEventListener("change", function() {
      if (setlistsView === "open" && currentOpenSongs) {
        buildSetlistPrintBooklet(currentOpenSetlistName, currentOpenSongs, currentOpenSetlistDesc);
      }
    });
  }

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

}

/*
   The setlist name shows as a plain heading; a double-click on it, or the
   pencil button beside it, swaps in an edit field. Enter or a blur commits,
   Escape backs out. renderOpenSetlist re-asserts the heading/field
   visibility on every (re)render, so this only has to handle the toggle.
*/
function initSetlistRename() {
  var titleText = document.getElementById("setlistTitleText");
  var nameInput = document.getElementById("setlistNameInput");
  var renameBtn = document.getElementById("setlistRenameBtn");
  if (!titleText || !nameInput) return;

  function enterEdit() {
    if (!currentPersonalId) return;
    nameInput.value = titleText.textContent;
    titleText.hidden = true;
    if (renameBtn) renameBtn.hidden = true;
    nameInput.hidden = false;
    nameInput.focus();
    nameInput.select();
  }

  function leaveEdit() {
    nameInput.hidden = true;
    titleText.hidden = false;
    if (renameBtn) renameBtn.hidden = false;
  }

  function commit() {
    if (!currentPersonalId) return;
    renamePersonalSetlist(storage(), currentPersonalId, nameInput.value.trim() || "Untitled setlist");
    refreshOpenPersonalSetlist();
  }

  titleText.addEventListener("dblclick", enterEdit);
  if (renameBtn) renameBtn.addEventListener("click", enterEdit);
  nameInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter") { e.preventDefault(); nameInput.blur(); }
    else if (e.key === "Escape") { e.preventDefault(); leaveEdit(); }
  });
  nameInput.addEventListener("blur", function() {
    if (nameInput.hidden) return; // already backed out via Escape
    commit();
  });
}

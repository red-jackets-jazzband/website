"use strict";

import { renderAbcFile, readFile, createInstrumentDropdown, initPrintLink } from "./render_abc.js";
import { parseSongIndex, filterSongsByQuery } from "./lib/song-index.js";
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

var setlistIndex = []; // [{ name, file }] parsed from index_of_setlists.txt
var allSongs = []; // [{ name, file }] parsed from index_of_songs.txt, lazily loaded
var allSongsLoaded = false;
var currentPersonalId = null; // set while viewing/editing a personal setlist, else null

function storage() {
  try {
    return window.localStorage;
  } catch (e) {
    return null;
  }
}

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

// ============================================================
// Home: band list + my list
// ============================================================

function renderHomeList() {
  var listEl = document.getElementById("bandSetlistList");
  if (!listEl) return;
  listEl.innerHTML = "";

  if (setlistIndex.length === 0) {
    listEl.appendChild(emptyRow("No setlists published yet."));
    return;
  }

  setlistIndex.forEach(function(entry) {
    var row = document.createElement("DIV");
    row.className = "setlists-row setlists-row-band";

    var openBtn = document.createElement("BUTTON");
    openBtn.type = "button";
    openBtn.className = "setlists-row-main";
    openBtn.textContent = entry.name;
    openBtn.addEventListener("click", function() {
      openBandSetlist(entry.file, entry.name);
    });

    var copyBtn = document.createElement("BUTTON");
    copyBtn.type = "button";
    copyBtn.className = "setlists-row-copy";
    copyBtn.textContent = "Copy to mine";
    copyBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      readFile("/setlists/" + entry.file, function(text) {
        var parsed = parseSetlistFile(text);
        copyBandSetlistToPersonal(storage(), {
          name: parsed.name || entry.name,
          desc: parsed.desc,
          songs: parsed.songs,
        });
        renderMyList();
      });
    });

    row.appendChild(openBtn);
    row.appendChild(copyBtn);
    listEl.appendChild(row);
  });
}

function renderMyList() {
  var listEl = document.getElementById("myList");
  if (!listEl) return;
  listEl.innerHTML = "";

  var mine = listPersonalSetlists(storage());
  if (mine.length === 0) {
    listEl.appendChild(emptyRow("No personal setlists yet on this device."));
    return;
  }

  mine.forEach(function(entry) {
    var row = document.createElement("BUTTON");
    row.type = "button";
    row.className = "setlists-row";
    row.textContent = entry.name + " · " + entry.songs.length + (entry.songs.length === 1 ? " song" : " songs");
    row.addEventListener("click", function() {
      openPersonalSetlist(entry.id);
    });
    listEl.appendChild(row);
  });
}

function emptyRow(text) {
  var empty = document.createElement("DIV");
  empty.className = "setlists-empty";
  empty.textContent = text;
  return empty;
}

// ============================================================
// Opening a setlist (band, read-only / personal, editable)
// ============================================================

function openBandSetlist(file, fallbackName) {
  readFile("/setlists/" + file, function(text) {
    var setlist = parseSetlistFile(text);
    currentPersonalId = null;
    showSetlistView(setlist.name || fallbackName, setlist.songs, null, setlist.desc);
  }, function(status) {
    console.warn("Could not load setlist " + file + " (status " + status + ")");
  });
}

function openPersonalSetlist(id) {
  var entry = getPersonalSetlist(storage(), id);
  if (!entry) return;
  currentPersonalId = id;
  showSetlistView(entry.name, entry.songs, entry, entry.desc);
}

function showSetlistView(name, songs, personalEntry, desc) {
  var home = document.getElementById("setlistsHome");
  var view = document.getElementById("setlistView");
  if (home) home.hidden = true;
  if (view) view.hidden = false;

  var editor = document.getElementById("setlistEditor");
  if (editor) editor.hidden = !personalEntry;

  if (personalEntry) {
    ensureSongsLoaded(function() {
      renderEditor(personalEntry);
    });
  }

  renderSetlistSongs(name, songs, desc);
}

/*
   Funcion: renderSetlistSongs
   Renders the on-screen heading, a print-only booklet cover page (name +
   desc, shown only when the setlist has a desc — this is what replaced the
   old Songbook page's cover), then each song via the same
   renderAbcFile(..., add_link=false) reuse pattern render_book.js used to.
*/
function renderSetlistSongs(name, songs, desc) {
  var songsEl = document.getElementById("setlistSongs");
  songsEl.innerHTML = "";

  var heading = document.createElement("DIV");
  heading.className = "setlist-view-title";
  heading.textContent = name;
  songsEl.appendChild(heading);

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

    songsEl.appendChild(cover);
  }

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
  currentPersonalId = null;
  renderMyList();
}

// ============================================================
// Personal setlist editor
// ============================================================

function refreshOpenPersonalSetlist() {
  if (!currentPersonalId) return;
  var entry = getPersonalSetlist(storage(), currentPersonalId);
  if (!entry) {
    showHome();
    return;
  }
  renderEditor(entry);
  renderSetlistSongs(entry.name, entry.songs, entry.desc);
}

function renderEditor(entry) {
  var nameInput = document.getElementById("setlistNameInput");
  if (nameInput && document.activeElement !== nameInput) nameInput.value = entry.name;

  var rowsEl = document.getElementById("setlistSongEditRows");
  rowsEl.innerHTML = "";

  entry.songs.forEach(function(song, index) {
    var row = document.createElement("DIV");
    row.className = "setlists-edit-row";

    var titleSpan = document.createElement("SPAN");
    titleSpan.className = "setlists-edit-row-title";
    titleSpan.textContent = songNameFor(song.file);
    row.appendChild(titleSpan);

    var keyInput = document.createElement("INPUT");
    keyInput.type = "text";
    keyInput.className = "setlists-edit-row-key";
    keyInput.placeholder = "key";
    keyInput.value = song.key || "";
    keyInput.addEventListener("change", function() {
      updateSongKeyInPersonalSetlist(storage(), entry.id, index, keyInput.value.trim());
      refreshOpenPersonalSetlist();
    });
    row.appendChild(keyInput);

    var upBtn = document.createElement("BUTTON");
    upBtn.type = "button";
    upBtn.className = "setlists-edit-row-btn";
    upBtn.textContent = "↑";
    upBtn.disabled = index === 0;
    upBtn.addEventListener("click", function() {
      moveSongInPersonalSetlist(storage(), entry.id, index, -1);
      refreshOpenPersonalSetlist();
    });
    row.appendChild(upBtn);

    var downBtn = document.createElement("BUTTON");
    downBtn.type = "button";
    downBtn.className = "setlists-edit-row-btn";
    downBtn.textContent = "↓";
    downBtn.disabled = index === entry.songs.length - 1;
    downBtn.addEventListener("click", function() {
      moveSongInPersonalSetlist(storage(), entry.id, index, 1);
      refreshOpenPersonalSetlist();
    });
    row.appendChild(downBtn);

    var removeBtn = document.createElement("BUTTON");
    removeBtn.type = "button";
    removeBtn.className = "setlists-edit-row-btn setlists-edit-row-remove";
    removeBtn.textContent = "×";
    removeBtn.title = "Remove";
    removeBtn.addEventListener("click", function() {
      removeSongFromPersonalSetlist(storage(), entry.id, index);
      refreshOpenPersonalSetlist();
    });
    row.appendChild(removeBtn);

    rowsEl.appendChild(row);
  });
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
    btn.className = "setlists-add-song-result";
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

function initPersonalSetlistControls() {
  var newBtn = document.getElementById("newSetlistBtn");
  if (newBtn) {
    newBtn.addEventListener("click", function() {
      var nameInput = document.getElementById("newSetlistName");
      var name = (nameInput.value || "").trim() || "New setlist";
      var entry = createPersonalSetlist(storage(), name);
      nameInput.value = "";
      renderMyList();
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
        renderMyList();
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
      renderMyList();
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

  var deleteBtn = document.getElementById("setlistDeleteBtn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", function() {
      if (!currentPersonalId) return;
      if (!window.confirm("Delete this setlist? This can't be undone.")) return;
      deletePersonalSetlist(storage(), currentPersonalId);
      showHome();
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

  var backBtn = document.getElementById("setlistBackBtn");
  if (backBtn) backBtn.addEventListener("click", showHome);
}

createInstrumentDropdown();
initPrintLink();
initPersonalSetlistControls();
renderMyList();

readFile("/setlists/index_of_setlists.txt", function(data) {
  setlistIndex = parseSongIndex(data);
  renderHomeList();
});

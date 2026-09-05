---
title: "Red Jackets Jazzband"
tagline: "Setlists"
date: 2026-09-05T00:00:00+02:00
---

<script src="/script/abcjs_midi_6.6.3-min.js" type="text/javascript"></script>
<script src="/script/tonal.4.6.9-min.js" type="text/javascript"></script>
<script type="module" src="/script/render_setlists.js"></script>

<div id="sheetmenu" class="hideOnprint">
<a id="printLink" title="Print this page" href="#">Print</a> |
</div>

<div id="setlistsHome">
  <div class="setlists-section-title">Band setlists</div>
  <div class="setlists-list" id="bandSetlistList"></div>

  <div class="setlists-section-title">My setlists</div>
  <div class="setlists-my-hint">Saved only in this browser, on this device. Export one to carry it to another device, or import a file someone sent you.</div>
  <div class="setlists-list" id="myList"></div>
  <div class="setlists-my-actions">
    <input type="text" id="newSetlistName" placeholder="New setlist name" autocomplete="off">
    <button id="newSetlistBtn" type="button" class="setlists-action-btn">+ Create</button>
    <label class="setlists-action-btn setlists-import-label">
      Import&hellip;
      <input type="file" id="importSetlistInput" accept=".txt" hidden>
    </label>
  </div>
</div>

<div id="setlistView" hidden>
  <button id="setlistBackBtn" type="button" class="hideOnprint setlists-back">&larr; Setlists</button>

  <div id="setlistEditor" class="setlists-editor hideOnprint" hidden>
    <div class="setlists-editor-row">
      <input type="text" id="setlistNameInput" class="setlists-name-input">
      <button id="setlistExportBtn" type="button" class="setlists-action-btn">Export</button>
      <button id="setlistDeleteBtn" type="button" class="setlists-action-btn setlists-action-danger">Delete</button>
    </div>
    <div class="setlists-editor-row">
      <input type="search" id="setlistAddSongSearch" placeholder="Add a song&hellip;" autocomplete="off">
    </div>
    <div id="setlistAddSongResults" class="setlists-add-song-results"></div>
    <div id="setlistSongEditRows" class="setlists-song-edit-rows"></div>
  </div>

  <div id="setlistSongs"></div>
</div>

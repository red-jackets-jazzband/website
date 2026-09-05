---
title: "Red Jackets Jazzband"
tagline: "Songs"
date: 2019-03-16T16:26:50+01:00
---

<script src="/script/abcjs_midi_6.6.3-min.js" type="text/javascript"></script>
<script src="/script/tonal.4.6.9-min.js" type="text/javascript"></script>
<script type="module">
    import { loadSongs } from "/script/render_abc.js";
    import { initSongLibrary } from "/script/song_library.js";
    import { initExportPanel } from "/script/export_panel.js";
    window.addEventListener("load", function () {
        loadSongs();
        initSongLibrary();
        initExportPanel();
    });
</script>

<div class="rj-songs-layout" data-default-tab="library">

<div id="rjLibrary" class="rj-library hideOnprint">
  <div class="rj-library-masthead">
    <img src="/images/quedlinburg_back.jpg" alt="Red Jackets Jazzband parade" />
    <div class="rj-library-masthead-overlay">
      <img class="rj-library-logo" src="/images/redjackets_logo_small.png" alt="" />
      <div>
        <div class="rj-library-title">Fakebook</div>
        <div class="rj-library-count" id="songCount"></div>
      </div>
    </div>
  </div>
  <div class="rj-library-tabs" id="libraryTabs">
    <button type="button" class="rj-library-tab" data-tab="library">Library</button>
    <button type="button" class="rj-library-tab" data-tab="setlists">Setlists</button>
  </div>

  <div class="rj-library-search" id="librarySearchRow">
    <input type="search" id="songSearch" placeholder="Search lead sheets" autocomplete="off" aria-label="Search lead sheets" />
  </div>

  <div class="rj-library-setlist-tools" id="setlistTools" hidden>
    <button type="button" class="rj-library-tool-btn rj-library-back-btn" id="setlistsBackBtn" hidden>&larr; All setlists</button>
    <div class="rj-library-new-setlist" id="newSetlistRow">
      <input type="text" id="newSetlistName" placeholder="New setlist name" autocomplete="off">
      <button type="button" id="newSetlistBtn" class="rj-library-tool-btn">+ Create</button>
      <label class="rj-library-tool-btn rj-library-import-label">
        Import&hellip;
        <input type="file" id="importSetlistInput" accept=".txt" hidden>
      </label>
    </div>
    <div class="rj-library-open-setlist" id="openSetlistTools" hidden>
      <input type="text" id="setlistNameInput" class="rj-library-name-input" hidden>
      <button type="button" id="setlistPrintBtn" class="rj-library-tool-btn">Print booklet</button>
      <button type="button" id="setlistCopyBtn" class="rj-library-tool-btn" hidden>Copy to mine</button>
      <button type="button" id="setlistExportBtn" class="rj-library-tool-btn" hidden>Export</button>
      <button type="button" id="setlistDeleteBtn" class="rj-library-tool-btn rj-library-tool-danger" hidden>Delete</button>
    </div>
    <div class="rj-library-add-song" id="addSongRow" hidden>
      <input type="search" id="setlistAddSongSearch" placeholder="Add a song&hellip;" autocomplete="off">
      <div id="setlistAddSongResults" class="rj-library-add-song-results"></div>
    </div>
  </div>

  <div class="rj-library-body">
    <div class="rj-library-list" id="songList"></div>
    <div class="rj-library-rail" id="songRail"></div>
  </div>
  <div class="rj-library-profile">
    <div class="rj-library-profile-label">Your instrument</div>
    <div id="rjLibraryProfile"></div>
  </div>
</div>

<div id="rjSheet" class="rj-sheet">

<button id="sheetBackBtn" class="rj-sheet-back hideOnprint" type="button">&larr; Songs</button>
<!-- <img src="/images/redjackets_logo.png" id="printLogo" class="printLogo hideOnScreen" /> -->
<div id="sheetmenu" class="hideOnprint">
  <div id="sheetStatus" class="sheet-status"></div>

  <div class="sheet-stepper" id="keyStepper" title="Key">
    <button type="button" id="keyDownBtn" class="sheet-stepper-btn" aria-label="Lower key">&minus;</button>
    <div class="sheet-stepper-value">
      <input type="number" id="transpose" name="quantity" value="0" min="-12" max="12" aria-label="Key, in semitones from concert pitch">
      <span class="sheet-stepper-label">key</span>
    </div>
    <button type="button" id="keyUpBtn" class="sheet-stepper-btn" aria-label="Raise key">&plus;</button>
  </div>

  <div class="sheet-stepper" id="tempoStepper" title="Tempo">
    <button type="button" id="tempoDownBtn" class="sheet-stepper-btn" aria-label="Slower">&minus;</button>
    <div class="sheet-stepper-value">
      <span id="tempoValueLabel">100%</span>
      <span class="sheet-stepper-label">tempo</span>
    </div>
    <button type="button" id="tempoUpBtn" class="sheet-stepper-btn" aria-label="Faster">&plus;</button>
  </div>

  <button id="playPauseBtn" class="sheet-play-btn" disabled title="Play"><i class="fa-solid fa-play"></i></button>

  <span id="inspirationSlot"></span>

  <button id="overflowToggle" class="sheet-overflow-toggle" type="button" title="More options" aria-haspopup="true" aria-expanded="false">More</button>
  <div id="overflowMenu" class="sheet-overflow-menu" hidden>
    <button id="melodyOffBtn" class="overflow-toggle-row" type="button" disabled>Mute melody</button>
    <div class="overflow-divider"></div>
    <a id="printLink" class="overflow-action" title="Print this page" href="#">Print</a>
    <button id="exportOpenBtn" type="button" class="overflow-action overflow-link-btn">Export&hellip;</button>
    <button id="stopBtn" class="overflow-action overflow-link-btn" disabled title="Stop and reset to the start">Stop</button>
    <span class="audio-loading" id="audioLoadingLabel">...</span>
  </div>
</div>
<div id="abc-player-container" style="display:none;"></div>

<div class="rj-sheet-paper">
<div id="songtitle" class="songtitle"></div>
<div id="chordtable" class="chordtable"></div>
<div id="notation" class="notation"></div>
<div id="lyrics" class="lyrics"></div>
</div>

<div id="songPrintFooter" class="songPrintFooter hideOnScreen">
Retrieved from www.redjackets.nl - <span id="instrumentText"></span>
</div>

</div>
</div>

<div id="exportPanel" class="export-panel hideOnprint" hidden>
  <div class="export-panel-inner">
    <div class="export-panel-header">
      <div class="export-panel-title">Export</div>
      <button id="exportCloseBtn" type="button" class="export-close-btn" aria-label="Close">&times;</button>
    </div>
    <div class="export-panel-body">
      <div class="export-format-row">
        <label><input type="radio" name="exportFormat" value="chart" checked> This chart</label>
        <label><input type="radio" name="exportFormat" value="booklet"> Booklet (multiple songs)</label>
      </div>
      <div id="exportSongPicker" class="export-song-picker" hidden>
        <div class="export-song-picker-hint">Pick the songs to include.</div>
        <input type="search" id="exportSongSearch" placeholder="Search lead sheets" autocomplete="off" aria-label="Search lead sheets to add to the booklet">
        <div id="exportSongList" class="export-song-list"></div>
        <div id="exportSelectedCount" class="export-selected-count"></div>
      </div>
      <label class="export-option-row"><input type="checkbox" id="exportIncludeLyrics" checked> Include lyrics</label>
    </div>
    <div class="export-panel-footer">
      <button id="exportCancelBtn" type="button" class="export-btn-secondary">Cancel</button>
      <button id="exportRunBtn" type="button" class="export-btn-primary">Export</button>
    </div>
  </div>
</div>
<div id="exportBooklet" class="hideOnScreen"></div>
<div id="setlistPrintBooklet" class="hideOnScreen"></div>

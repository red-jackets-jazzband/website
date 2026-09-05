---
title: "Red Jackets Jazzband"
tagline: "Songs"
date: 2019-03-16T16:26:50+01:00
aliases: ["/setlists/", "/songbook/"]
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
      <span class="sheet-stepper-label">semitones</span>
    </div>
    <button type="button" id="keyUpBtn" class="sheet-stepper-btn" aria-label="Raise key">&plus;</button>
  </div>

  <div class="sheet-stepper" id="tempoStepper" title="Tempo">
    <button type="button" id="tempoDownBtn" class="sheet-stepper-btn" aria-label="Slower">&minus;</button>
    <div class="sheet-stepper-value">
      <span id="tempoValueLabel">120</span>
      <span class="sheet-stepper-label">bpm</span>
    </div>
    <button type="button" id="tempoUpBtn" class="sheet-stepper-btn" aria-label="Faster">&plus;</button>
  </div>

  <div class="sheet-transport">
    <button id="playPauseBtn" class="sheet-play-btn" disabled title="Play" aria-label="Play"><span class="fa-solid fa-play" aria-hidden="true"></span></button>
    <button id="stopBtn" class="sheet-icon-btn" type="button" disabled title="Stop and reset to the start" aria-label="Stop and reset to the start"><span class="fa-solid fa-stop" aria-hidden="true"></span></button>
    <button id="melodyOffBtn" class="sheet-icon-btn" type="button" disabled title="Mute melody" aria-label="Mute melody"><span class="fa-solid fa-volume-high" aria-hidden="true"></span></button>
  </div>

  <div id="inspirationSlot"></div>

  <div class="sheet-actions" id="sheetActions">
    <a id="printLink" class="sheet-icon-btn" href="#" title="Print this page" aria-label="Print this page"><span class="fa-solid fa-print" aria-hidden="true"></span></a>
    <button id="exportOpenBtn" class="sheet-icon-btn" type="button" title="Export&hellip;" aria-label="Export"><span class="fa-solid fa-file-export" aria-hidden="true"></span></button>
  </div>
  <span class="audio-loading" id="audioLoadingLabel">...</span>
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

<div id="inspirationPanel" class="inspiration-panel hideOnprint" hidden>
  <div class="inspiration-panel-header" id="inspirationPanelHeader">
    <span class="fa-solid fa-grip-lines inspiration-panel-grip" aria-hidden="true"></span>
    <span class="inspiration-panel-title" id="inspirationPanelTitle">Inspiration</span>
    <a id="inspirationExpandBtn" class="inspiration-panel-icon-btn" href="#" target="_blank" rel="noopener" title="Open on YouTube" aria-label="Open on YouTube"><span class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></span></a>
    <button type="button" id="inspirationCloseBtn" class="inspiration-panel-icon-btn" aria-label="Close">&times;</button>
  </div>
  <div class="inspiration-panel-video">
    <iframe id="inspirationVideoFrame" src="" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Inspiration video" loading="lazy"></iframe>
  </div>
</div>

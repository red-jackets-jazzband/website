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

<div class="rj-songs-layout">

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
  <div class="rj-library-search">
    <input type="search" id="songSearch" placeholder="Search lead sheets" autocomplete="off" aria-label="Search lead sheets" />
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
  <button id="playPauseBtn" class="sheet-play-btn" disabled title="Play"><i class="fa-solid fa-play"></i></button>
  <button id="overflowToggle" class="sheet-overflow-toggle" type="button" title="More options" aria-haspopup="true" aria-expanded="false">&#8942;</button>
  <div id="overflowMenu" class="sheet-overflow-menu" hidden>
    <a id="printLink" title="Print this page" href="#">Print</a>
    <button id="exportOpenBtn" type="button" class="overflow-link-btn">Export&hellip;</button>
    <div class="overflow-row">
      <label for="transpose">Transpose</label>
      <input type="number" id="transpose" name="quantity" value="0" min="-12" max="12">
    </div>
    <div class="overflow-row">
      <button id="stopBtn" class="audio-btn-inline" disabled title="Stop"><i class="fa-solid fa-stop"></i></button>
      <button id="melodyOffBtn" class="audio-btn-inline" disabled title="Mute melody"><span class="fa-stack"><i class="fa-solid fa-music fa-stack-1x"></i><i class="fa-solid fa-slash fa-stack-1x"></i></span></button>
      <span class="audio-loading" id="audioLoadingLabel">...</span>
    </div>
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

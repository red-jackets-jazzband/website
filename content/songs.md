---
title: "Red Jackets Jazzband"
tagline: "Songs"
date: 2019-03-16T16:26:50+01:00
---

<script src="/script/abcjs_midi_6.6.3-min.js" type="text/javascript"></script>
<script src="/script/tonal.4.6.9-min.js" type="text/javascript"></script>
<script type="module">
    import { loadSongs } from "/script/render_abc.js";
    window.addEventListener("load", loadSongs);
</script>

<!-- <img src="/images/redjackets_logo.png" id="printLogo" class="printLogo hideOnScreen" /> -->
<div id="abc_menu" class="hideOnprint"></div>
<div id="sheetmenu" class="hideOnprint">
<a id="printLink" title="Print this page" href="#">Print</a> |
Transpose
<input type="number" id="transpose" name="quantity" value="0" min="-12" max="12">
<span id="audioControls" style="display:none;">|
<button id="playPauseBtn" class="audio-btn-inline" disabled title="Play"><i class="fa-solid fa-play"></i></button>
<button id="stopBtn" class="audio-btn-inline" disabled title="Stop"><i class="fa-solid fa-stop"></i></button>
<button id="melodyOffBtn" class="audio-btn-inline" disabled title="Mute melody"><span class="fa-stack"><i class="fa-solid fa-music fa-stack-1x"></i><i class="fa-solid fa-slash fa-stack-1x"></i></span></button>
<span class="audio-loading" id="audioLoadingLabel">...</span>
</span> | 
</div>
<div id="abc-player-container" style="display:none;"></div>

<div id="songtitle" class="songtitle"></div>
<div id="chordtable" class="chordtable"></div>
<div id="notation" class="notation"></div>
<div id="lyrics" class="lyrics"></div>

<div id="songPrintFooter" class="songPrintFooter hideOnScreen">
Retrieved from www.redjackets.nl - <span id="instrumentText"></span>
</div>


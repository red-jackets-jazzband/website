---
title: "Songbook"
tagline: "Songbook"
date: 2019-03-16T16:26:50+01:00
---

<script src="/script/abcjs_midi_5.6.5-min.js" type="text/javascript"></script>
<script src="/script/render_book.js" type="text/javascript"></script>
<script src="/script/render_abc.js" type="text/javascript"></script>

<div id="sheetmenu" class="hideOnprint">
<a id="printBookLink" title="Get the book" href="#" onclick="renderBook()">Generate the Book!</a> | 
<a id="printLink" title="Print this page" href="#" onclick="window.print();return false;">Print</a> | 
</div>
<div id="book">
    <div class="container">
    <img src="/images/songbook_cover.png" class="bookCover"/>
    <div class="text-block">
        <span id="instrumentTextCover"></span>
    </div>
    </div>
    <div class="bookContent">
    <div class="bookContent pageBreakBefore">
        <h1>Red Jackets Jazzband Songbook</h1>
        This book was created to enable other musicians to learn the joy of New Orleans jazz. These songs are some of the favorites
        amongst the traditional Jazzbands from Bergen op Zoom and we love playing them. If you have any comments or remarks, please contact us through www.redjackets.nl.
        <br>
        This book contains the sheet music for the <span id="instrumentText"></span>. If you would like these songs for a different
        instrument, generate your book at www.redjackets.nl/songbook.
    </div>
    <img src="/images/songbook_qr.png"/>
    <div class="bookContent pageBreakBefore">
        <h1>Songs</h1>
        <ul id="bookIndexList" class="bookIndexList"><ul>
    </div>
    <div id="songs"></div>
    </div>
</div>

<script type="text/javascript">
    createInstrumentDropdown();
    document.getElementById("instrument").onchange = "";
</script>

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
        <img src="/images/redjackets_logo.png" id="printLogo" class="printLogo" />
        <h1>N.O.A.D.S. Songbook</h1>
        Eind 2009, aan een keukentafel ergens aan één van de Bergse Singels, herrees uit de as van de vroegere MLC Jazzband een nieuw straatorkest, de Red Jackets Jazzband. Dat is 10 jaar geleden en wie jarig is trakteert! Dit boek is gemaakt ter gelegenheid van het 10 jarig bestaan van de Red Jackets Jazzband en is een geschenk aan alle Bergse Straatorkesten. Daarnaast is dit boek bedoeld om andere muzikanten kennis te laten maken met New Orleans (aan de Schelde) Jazz.
<br><br>
         Bergen op Zoom en jazz horen van oudsher bij elkaar. De stad kent een unieke rijke traditie en een ongekende hoeveelheid aan straatorkesten. Bergen op Zoom wordt dan ook wel met recht ‘New Orleans Aan de Schelde’ genoemd. De straatorkesten zijn in de basis hetzelfde, maar elke band is op geheel eigen wijze uniek. Deze eigen(wijs)heid leidt tot een mooi pallet aan songs die we hebben gebundeld in dit N.O.A.D.S. Songbook. De songs in het N.O.A.D.S. Songbook behoren tot de favorieten van de huidige traditionele Bergse straatorkesten. Ze zijn voor het eerst gebundeld en het boek is daarmee een uniek document.
<br><br>
        Dit boek bevat de bladmuziek voor de <span id="instrumentText"></span>. Als je deze songs voor een ander instrument wilt, genereer je boek op www.redjackets.nl/songbook.
<br><br>
        Heb je vragen of opmerkingen naar aanleiding van het N.O.A.D.S. Songbook, neem dan contact met ons op via www.redjackets.nl.
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

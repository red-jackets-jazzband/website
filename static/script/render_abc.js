"use strict";

var current_song = null;
var transpose_halfsteps = 0;

/* Fix for IE that does not implement forEach 
   see https://tips.tutorialhorizon.com/2017/01/06/object-doesnt-support-property-or-method-foreach/
*/
(function() {
  if (typeof NodeList.prototype.forEach === "function") return false;
  NodeList.prototype.forEach = Array.prototype.forEach;
})();

function renderBook() {

  document.getElementById("book").innerHTML = "";
  readFile("index_of_songbook.txt", renderAllSongs);

}

function renderAllSongs(data) {
  var songList = data.split("\n");

  /*Hide normal song */
  var songtitle = document.getElementById("songtitle");
  songtitle.innerHTML = "";
  var chordtable = document.getElementById("chordtable");
  chordtable.innerHTML = "";
  var notation = document.getElementById("notation");
  notation.innerHTML = "";
  notation.style = "";
  notation.classList.remove("abcjs-container");

  /* Add generic stuff */
  var book = document.getElementById("book");

  var cover = document.createElement("IMG");
  cover.src = "/images/songbook_cover.png";
  cover.classList.add("bookCover");
  book.appendChild(cover);

  var indexDiv = document.createElement("DIV");
  indexDiv.innerHTML = "<h1>Songs</h1>";
  indexDiv.classList.add("bookIndex");
  indexDiv.classList.add("pageBreakBefore");
  var index = document.createElement("UL");
  index.classList.add("bookIndexList");
  indexDiv.appendChild(index);
  book.appendChild(indexDiv);

  /* Add each song to the book */
  var i = 0;
  for (; i < songList.length; ++i) {

    var song_parts = songList[i].split(",");
    var song_name = song_parts[0];
    var song_path = song_parts[1];
    var song_title = song_path ? song_path.split(".")[0] : "";

    var indexItem = document.createElement("LI");
    var titlePrefix = String(i+1) + ". ";
    indexItem.innerHTML = titlePrefix + song_name;
    index.appendChild(indexItem);

    var songTitleElt = document.createElement("DIV");
    songTitleElt.id = "songtitle-".concat(song_title);
    songTitleElt.classList.add("songtitle");
    songTitleElt.classList.add("pageBreakBefore");
    book.appendChild(songTitleElt);
    var chordTableElt = document.createElement("DIV");
    chordTableElt.id = "chordtable-".concat(song_title);
    chordTableElt.classList.add("chordtable");
    book.appendChild(chordTableElt);
    var notationElt = document.createElement("DIV");
    notationElt.id = "notation-".concat(song_title);
    notationElt.classList.add("notation");
    book.appendChild(notationElt);
/*
    var footer = document.createElement("DIV");
    footer.innerHTML = "Retrieved from www.redjackets.nl";
    footer.id = "footer-".concat(song_title);
    footer.classList.add("songPrintFooter");
    footer.classList.add("hideOnScreen");*/
    //book.appendChild(footer);

    notationElt = notationElt.id;
    chordTableElt = chordTableElt.id;
    songTitleElt = songTitleElt.id;

    var f = new XMLHttpRequest();
    f.onreadystatechange = function() {
      if (f.readyState === 4) {
        if (f.status === 200 || f.status === 0) {
          renderAbcFile(f.responseText, notationElt, chordTableElt, songTitleElt, titlePrefix);
        }
      }
    };
    f.open("GET", song_path, false); // TODO: make async
    f.send();
  }

}

function renderSong(path) {
  document.getElementById("transpose").value = 0;
  document.getElementById("book").innerHTML = "";
  readFile(path, renderAbcFile);
}

function rerenderFile() {
  if (window.current_song !== undefined) {
    renderAbcFile(window.current_song);
  }
}

function change_cleff_for_instrument(instrument, text) {
  switch (instrument) {
    case "sousaphone":
    case "trombone":
      text = text.replace(/(K:\s*\w+)/g, "$1 clef=bass middle=D");
      break;
    default:
      text = text.replace(/clef=bass\ middle=D/g, "");
      break;
  }

  return text;
}

function offset_for_instrument(instrument) {
  var steps = 0;

  switch (instrument) {
    case "alto_saxophone":
      steps = 9;
      break;
    case "tenor_saxophone":
    case "sousaphone":
    case "trumpet":
    case "clarinet_bb":
      steps = 2;
      break;
    default:
      steps = 0;
      break;
  }

  return steps;
}

/*
   Funcion: renderAbcFile
   Render a song from a abc text
   Parameters:
       text - String containing (valid) abc file
*/
function renderAbcFile(text, notationElt, chordTableElt, songTitleElt, titlePrefix) {

  notationElt = (typeof notationElt !== 'undefined') ?  notationElt : "notation";
  chordTableElt = (typeof chordTableElt !== 'undefined') ?  chordTableElt : "chordtable";
  songTitleElt = (typeof songTitleElt !== 'undefined') ?  songTitleElt : "songtitle";
  titlePrefix = (typeof titlePrefix !== 'undefined') ?  titlePrefix : "";

  var transpose_steps = document.getElementById("transpose").value;
  // Don't use valueAsNumber to let IE users also enjoy transposing
  transpose_steps = Number(transpose_steps);
  var instrument = document.getElementById("instrument").value;

  text = change_cleff_for_instrument(instrument, text);
  transpose_steps += offset_for_instrument(instrument);

  window.current_song = text;
  var song = string_to_abc_tune(text, transpose_steps);
  var chords = parse_chord_scheme(song);

  add_inspiration_link(song.metaText.url);

  var abcParams = {
    visualTranspose: transpose_steps,
    responsive: "resize",
    paddingTop: 0,
    paddingBottom: 0,
    add_classes: true,
    format: {
      headerfont: "MuseJazzText",
      gchordfont: "MuseJazzText",
      infofont: "MuseJazzText",
      composerfont: "MuseJazzText",
      titlefont: "MuseJazzText 4 bold",
      vocalfont: "MuseJazzText",
      partsfont: "MuseJazzText",
      tempofont: "MuseJazzText",
      wordfont: "MuseJazzText",
      footerfont: "MuseJazzText",
      voicefont: "MuseJazzText"
    }
  };

  ABCJS.renderAbc(notationElt, text, abcParams);

  /* Hide title below chord table */
  document
    .getElementById(notationElt)
    .querySelectorAll(".abcjs-title")
    .forEach(function(el) {
      el.setAttribute("display", "none");
    });

  var chordtable = document.getElementById(chordTableElt);
  create_chord_table(chords, chordtable);

  /* Add own title, above chordTable */
  var songtitle = document.getElementById(songTitleElt);
  songtitle.innerHTML = titlePrefix.concat(song.metaText.title);
}

/*
   Funcion: readFile
   Read a file from an address
   Parameters:
       file - Path to file to read
       callback - Function to call with data if loaded succesfully
*/
function readFile(file, callback) {
  var f = new XMLHttpRequest();
  f.onreadystatechange = function() {
    if (f.readyState === 4) {
      if (f.status === 200 || f.status === 0) {
        callback(f.responseText);
      }
    }
  };
  f.open("GET", file, true);
  f.send(null);
}

/*
   Funcion: create_song_link
   From a entry in index_of_songs.txt parse the fields and add link to page
   Parameters:
       song - A string containing line from index_of_songs.txt
*/
function create_song_link_text(song) {
  var song_parts = song.split(",");
  var song_name = song_parts[0];
  var song_path = song_parts[1];
  var song_title = song_path ? song_path.split(".")[0] : "";

  if (song_title != "") {
    return (
      '<a href="#s=' +
      song_title +
      '" onclick="renderSong(\'' +
      song_path +
      "')\" >" +
      song_name +
      "</a>"
    );
  }

  return "";
}

function string_to_abc_tune(text, transpose_steps) {
  var tunes = ABCJS.parseOnly(text, { visualTranspose: transpose_steps });
  return tunes[0];
}

/*
   Funcion: replace_accidental_with_utf8_char
   Replaces the sharp and flat signs with the official unicode chars
   Parameters:
       note - A string containing # or b signs
   Returns:
       note - with the b and # replaced
*/
function replace_accidental_with_utf8_char(note) {
  return note.replace("b ", "♭").replace("#", "♯");
}

/*
   Funcion: parse_chord_scheme
   Reads the chords from the song in abcjs intermediate format into a list per measure with the chords
   Returns:
       chords - A list of lists with the chords per measure
*/
function parse_chord_scheme(song) {
  var chords = [];
  var current_measure = [];

  var parsed_valid_chord = false;
  var did_not_parse_chord_in_this_measure = true;
  var in_alternative_ending = false;

  for (var i = 0; i < song.lines.length; i += 1) {

    // Subtitle is added to song.lines, don't break when line has no staff
    if (song.lines[i].staff !== undefined) {
      var line = song.lines[i].staff[0].voices[0];

      for (var line_idx = 0; line_idx < line.length; line_idx += 1) {
        var element = line[line_idx];

        if (element.el_type === "bar") {
          if (element.startEnding !== undefined) {
            if (element.startEnding > 1) {
              in_alternative_ending = true;
            }
          } else {
            if (element.endEnding !== undefined && in_alternative_ending) {
              in_alternative_ending = false;
            }
          }

          if (!in_alternative_ending) {
            if (did_not_parse_chord_in_this_measure && parsed_valid_chord) {
              current_measure.push(" % ");
            }

            if (current_measure.length > 0) {
              chords.push(current_measure.slice(0));
              current_measure = [];
            }

            did_not_parse_chord_in_this_measure = true;
          }
        }

        if (!in_alternative_ending) {
          if (element.chord !== undefined) {
            var chord = replace_accidental_with_utf8_char(element.chord[0].name);
            current_measure.push(chord);
            did_not_parse_chord_in_this_measure = false;
            parsed_valid_chord = true;
          }
        }
      }
    }
  }

  // Prevent returning only % % % % % ....
  if (!parsed_valid_chord) {
    chords = [];
  }
  return chords;
}

/*
   Funcion: create_chord_table
   Create a table from a list of chords
   Returns:
       chords - A list of lists with the chords per measure
*/
function create_chord_table(chords, chordtable) {
  var table = document.createElement("TABLE");
  table.border = "1";

  var cols = 4;
  if (chords.length > 4 * 4) {
    cols = 8;
  }
  var rows = Math.ceil(chords.length / cols);

  for (var y = 0; y < rows; y++) {
    var row = table.insertRow(-1);
    for (var x = 0; x < cols; x++) {
      var chord_idx = x + y * cols;
      if (chord_idx < chords.length) {
        var cell = row.insertCell(-1);
        cell.innerHTML = chords[chord_idx];
        cell.classList.add("chordCell");
      }
    }
  }

  chordtable.innerHTML = "";
  chordtable.appendChild(table);
}

/*
   Funcion: add_inspiration_link
   Adds a link to the sheetmenu if anabc tune contains a F field
*/
function add_inspiration_link(url) {
  if (url !== undefined) {
    var link = document.getElementById("inspirationLink");
    if (link !== null) {
      link.href = url;
    } else {
      link = document.createElement("A");
      link.innerHTML = "| inspiration";
      link.href = url;
      link.target = "_blank";
      link.id = "inspirationLink";
      var menu = document.getElementById("sheetmenu");
      menu.appendChild(link);
    }
  } else {
    var link = document.getElementById("inspirationLink");
    if (link !== null) {
      link.parentNode.removeChild(link);
    }
  }
}

/*
   Funcion: parse_song_from_hash
   Parse which song os the currently selected song and render that (usefull for sharing)
   Returns:
       hash - Hash of the window.location
*/
function parse_song_from_hash(hash) {
  var hash2Obj = parseQueryString(hash.substring(1));

  renderSong(hash2Obj.s + ".abc");
}

function parseQueryString(queryString) {
  var params = {},
    queries,
    temp,
    i,
    l;
  // Split into key/value pairs
  queries = queryString.split("&");
  // Convert the array of strings into an object
  for (i = 0, l = queries.length; i < l; i++) {
    temp = queries[i].split("=");
    params[temp[0]] = temp[1];
  }
  return params;
}

function loadSongs() {
  createInstrumentDropdown();
  readFile("index_of_songs.txt", createAllDropdowns);

  if (window.location.hash) {
    parse_song_from_hash(window.location.hash);
  }
}

function createInstrumentDropdown() {
  var div = document.createElement("DIV");
  div.classList.add("dropdown");

  var select = document.createElement("SELECT");
  select.classList.add("dropbtn");
  select.innerText = "Instrument";
  select.id = "instrument";
  select.onchange = rerenderFile;
  div.appendChild(select);

  var instruments = [
    "Concert pitch",
    "Alto Saxophone",
    "Clarinet Bb",
    "Sousaphone",
    "Tenor Saxophone",
    "Trombone",
    "Trumpet"
  ];
  var i;
  for (i = 0; i < instruments.length; i++) {
    var option = document.createElement("OPTION");
    option.innerHTML = instruments[i].toUpperCase();
    option.value = instruments[i].toLowerCase().replace(" ", "_");
    select.appendChild(option);
  }

  var abc_menu = document.getElementById("sheetmenu");
  abc_menu.appendChild(div);
}

function createAllDropdowns(data) {
  var songs = data.split("\n");

  var songMap = createMapFromSongList(songs);

  for (var letter in songMap) {
    createLetterDropDown(letter, songMap[letter]);
  }
}

function createMapFromSongList(songList) {
  var songMap = {};
  var i = 0;
  for (; i < songList.length; ++i) {
    if (songMap[songList[i].charAt(0)] === undefined) {
      songMap[songList[i].charAt(0)] = [songList[i]];
    } else {
      songMap[songList[i].charAt(0)].push(songList[i]);
    }
  }

  return songMap;
}

function createLetterDropDown(letter, songs) {
  var div = document.createElement("DIV");
  div.classList.add("dropdown");

  var btn = document.createElement("BUTTON");
  btn.classList.add("dropbtn");
  btn.innerText = letter;
  div.appendChild(btn);

  var contentDiv = document.createElement("DIV");
  contentDiv.classList.add("dropdown-content");

  var i;
  for (i = 0; i < songs.length; i++) {
    contentDiv.innerHTML += create_song_link_text(songs[i]);
  }

  div.appendChild(contentDiv);

  var abc_menu = document.getElementById("abc_menu");
  abc_menu.appendChild(div);
}

window[addEventListener ? "addEventListener" : "attachEvent"](
  addEventListener ? "load" : "onload",
  loadSongs
);

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

function renderSong(path) {
  document.getElementById("transpose").value = 0;
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
function renderAbcFile(text, notationElt, chordTableElt, songTitleElt, titlePrefix, add_link) {

  notationElt = (typeof notationElt !== 'undefined') ?  notationElt : "notation";
  chordTableElt = (typeof chordTableElt !== 'undefined') ?  chordTableElt : "chordtable";
  songTitleElt = (typeof songTitleElt !== 'undefined') ?  songTitleElt : "songtitle";
  titlePrefix = (typeof titlePrefix !== 'undefined') ?  titlePrefix : "";
  add_link = (typeof add_link !== 'undefined') ?  add_link : true;

  var transpose_steps = document.getElementById("transpose");
  transpose_steps = (transpose_steps !== null) ? transpose_steps.value : 0;

  // Don't use valueAsNumber to let IE users also enjoy transposing
  transpose_steps = Number(transpose_steps);
  var instrumentSelect = document.getElementById("instrument");
  document.getElementById("instrumentText").innerHTML = instrumentSelect.options[instrumentSelect.selectedIndex].text.toLowerCase();

  // Check if there are voice definitions with instrument-related attributes
  const hasInstrumentVoices = text.match(/^V:\d+.*(clef=|transpose=|name=)/gm);

  if (!hasInstrumentVoices) {
    text = change_cleff_for_instrument(instrumentSelect.value, text);
    transpose_steps += offset_for_instrument(instrumentSelect.value);
  }

  window.current_song = text;
  var song = string_to_abc_tune(text, transpose_steps);
  var chords = parse_chord_scheme(song);

  if (add_link) {
    add_inspiration_link(song.metaText.url);
    add_irealpro_link(song, chords);
  }

  var abcParams = {
    visualTranspose: transpose_steps,
    responsive: "resize",
    staffwidth:1000,
    paddingTop: 0,
    paddingBottom: 0,
    add_classes: true,
    jazzchords:true,
    oneSvgPerLine:false,
    format: {
      annotationfont: "MuseJazzText italic",
      composerfont: "MuseJazzText",
      footerfont: "MuseJazzText",
      gchordfont: "MuseJazzText",
      headerfont: "MuseJazzText",
      historyfont: "MuseJazzText",
      infofont: "MuseJazzText",
      measurefont: "MuseJazzText",
      partsfont: "MuseJazzText italic",
      repeatfont: "MuseJazzText",
      subtitlefont: "MuseJazzText",
      tabgracefont: "MuseJazzText",
      tablabelfont: "MuseJazzText",
      tabnumberfont: "MuseJazzText",
      tempofont: "MuseJazzText",
      textfont: "MuseJazzText",
      titlefont: "MuseJazzText 4",
      tripletfont: "MuseJazzText",
      vocalfont: "MuseJazzText",
      voicefont: "MuseJazzText",
      wordsfont: "MuseJazzText",
    }
  };

  var compingSelect = document.getElementById("comping");
  var compingRhythm = compingSelect ? compingSelect.value : "none";
  if (compingRhythm !== "none" && chords.length > 0) {
    var abcCompingTune = generate_comping(chords, song, compingRhythm);
    // Chord/key data from parseOnly is already in the instrument key; no re-transposition needed.
    var compingParams = {
      visualTranspose: 0,
      responsive: "resize",
      staffwidth: 1000,
      paddingTop: 0,
      paddingBottom: 0,
      add_classes: true,
      jazzchords: true,
      oneSvgPerLine: false,
      format: abcParams.format
    };
    ABCJS.renderAbc(notationElt, abcCompingTune, compingParams);
    // Color the Root / Third / Fifth voice-name labels to match the note colors
    var voiceColors = {'Root': '#222222', 'Third': '#e29d0f', 'Fifth': '#CA486d'};
    document.getElementById(notationElt).querySelectorAll('text').forEach(function(el) {
      var txt = (el.textContent || '').trim();
      if (voiceColors[txt]) el.style.fill = voiceColors[txt];
    });
  } else {
    ABCJS.renderAbc(notationElt, text, abcParams);
  }

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
   Function: generate_comping
   Generates ABC notation for chord-tone comping using the selected rhythm.
   Three voices (root, third, fifth) share one staff, each colored by CSS.
   Voice names are taken from their chord-position in bar 1.
*/
function generate_comping(chords, song, rhythm) {
  // `chords` and `song` come from ABCJS.parseOnly called with visualTranspose,
  // so all chord names and key data are already in the instrument's key.
  // No additional transposition is needed here.

  // Patterns in L:1/8 (4/4 = 8 slots per bar).
  // twobar1/twobar2: bar 1 and bar 2 of the classic 2-bar figure (8 slots each).
  // half: 4-slot fragment used when 2 chords share one bar.
  // Pattern functions receive up to 4 ABC note strings: n (main), nd (scale
  // step down), nu (scale step up), nu2 (two scale steps up).  Patterns that
  // don't need step notes simply ignore the extra arguments.
  // All durations are in L:1/8 units; one bar = 8 slots in 4/4.
  var PATTERNS = {
    // 1: Hits on beat 2 & 4, bar 2 ends on syncopated long note
    'on_2_and_4':     { twobar1: function(n)        { return "z2 "+n+"2 z2 "+n+"2"; },
                        twobar2: function(n)        { return n+" z z "+n+"-"+n+"4"; },
                        half:    function(n)        { return "z2 "+n+"2"; } },
    // 2: Bar 1 whole note tied into bar 2 dotted half
    'hold_over':      { twobar1: function(n)        { return n+"8-"; },
                        twobar2: function(n)        { return n+"6 z2"; },
                        half:    function(n)        { return n+"4"; } },
    // 3: Quick hits then step-down walk
    'walk_down_a':    { twobar1: function(n,nd)     { return n+" z z "+n+"-"+n+"2 z2"; },
                        twobar2: function(n,nd)     { return n+" "+n+" "+nd+" "+n+" z4"; },
                        half:    function(n,nd)     { return n+" z z "+n; } },
    // 4: Step both ways around the main note
    'cross_step':     { twobar1: function(n,nd,nu)  { return "z2 "+n+" z z "+n+" z2"; },
                        twobar2: function(n,nd,nu)  { return n+" z z "+n+"-"+n+" "+nu+" "+nd+" z"; },
                        half:    function(n,nd,nu)  { return "z2 "+n+" z"; } },
    // 5: Syncopated walk with step down
    'walk_down_b':    { twobar1: function(n,nd)     { return "z2 "+n+" z "+nd+" "+n+"2 "+nd; },
                        twobar2: function(n,nd)     { return n+" "+n+" "+nd+" "+n+" z4"; },
                        half:    function(n,nd)     { return "z2 "+n+" z"; } },
    // 6: Single hit then long hold, same each bar
    'hit_and_hold':   { twobar1: function(n)        { return n+" z z "+n+"-"+n+"4"; },
                        twobar2: function(n)        { return n+" z z "+n+"-"+n+"4"; },
                        half:    function(n)        { return n+" z z "+n; } },
    // 7: Two quick hits, rest, then varied hits
    'double_hit':     { twobar1: function(n)        { return n+" "+n+" z2 z4"; },
                        twobar2: function(n)        { return n+" "+n+" z "+n+" z "+n+"3"; },
                        half:    function(n)        { return n+" "+n+" z2"; } },
    // 8: Whole note tied over both bars
    'whole_note':     { twobar1: function(n)        { return n+"8-"; },
                        twobar2: function(n)        { return n+"8"; },
                        half:    function(n)        { return n+"4"; } },
    // 9: Bar 1 whole note, bar 2 steps down only
    'whole_then_step':{ twobar1: function(n,nd)     { return n+"8"; },
                        twobar2: function(n,nd)     { return nd+" z z "+nd+" z4"; },
                        half:    function(n,nd)     { return n+"4"; } },
    // 10: Step-down then step-up approach, bar 2 resolves on step-up note
    'step_approach':  { twobar1: function(n,nd,nu)  { return n+" "+nd+" z2 "+nu+" "+nd+" z2"; },
                        twobar2: function(n,nd,nu)  { return nu+"3 "+nd+" z4"; },
                        half:    function(n,nd,nu)  { return n+" "+nd+" z2"; } },
    // 11: Double hit, then bar 2 uses step-up and step-down
    'double_then_step':{ twobar1: function(n,nd,nu) { return n+" "+n+" z2 "+n+" "+n+" z2"; },
                         twobar2: function(n,nd,nu) { return n+" z "+nu+" "+nd+" z4"; },
                         half:    function(n,nd,nu) { return n+" "+n+" z2"; } },
    // 12: 8th-note walk alternating n and nd
    'walk_eighths':   { twobar1: function(n,nd)     { return n+" "+n+" "+nd+" "+nd+" "+n+" "+n+" "+nd+" "+nd; },
                        twobar2: function(n,nd)     { return n+" z z "+n+"-"+n+"4"; },
                        half:    function(n,nd)     { return n+" "+n+" "+nd+" "+nd; } },
    // 13: Full walking line through all step notes
    'full_walk':      { twobar1: function(n,nd,nu)  { return n+" "+n+" "+nd+" "+n+" "+nu+" "+n+" "+nd+" "+n; },
                        twobar2: function(n,nd,nu)  { return nd+" z z "+n+"-"+n+"4"; },
                        half:    function(n,nd,nu)  { return n+" "+n+" "+nd+" "+n; } },
    // 14: Bar 1 approaches from below, bar 2 from two steps above
    'third_approach': { twobar1: function(n,nd,nu,nu2) { return n+" "+nd+" z "+nd+"-"+n+"4"; },
                        twobar2: function(n,nd,nu,nu2) { return nu2+" "+nd+" z "+nd+"-"+n+"4"; },
                        half:    function(n,nd,nu,nu2) { return n+" "+nd+" z "+nd; } },
    // 15: Step-down then step-up neighbor, long resolve
    'step_neighbor':  { twobar1: function(n,nd,nu)  { return n+" "+nd+" z "+nu+"-"+n+"4"; },
                        twobar2: function(n,nd,nu)  { return n+" "+nd+" z "+nu+" z "+n+"3"; },
                        half:    function(n,nd,nu)  { return n+" "+nd+" z "+nu; } },
    // 16: Sparse hits, bar 2 ties step-up note then resolves to main
    'hold_and_rise':  { twobar1: function(n,nd,nu)  { return "z2 "+n+" z z "+n+" z2"; },
                        twobar2: function(n,nd,nu)  { return n+" z z "+nu+"-"+nu+"3 "+n; },
                        half:    function(n,nd,nu)  { return "z2 "+n+" z"; } }
  };
  var pat = PATTERNS[rhythm] || PATTERNS['charleston'];

  var key = song.lines[0].staff[0].key;

  // Build the diatonic scale for the key so step-motion patterns can find
  // the neighbour note one (or two) scale degrees above/below a chord tone.
  var modeAliases = {"": "major", "maj": "major", "m": "minor", "min": "minor",
    "dor": "dorian", "phr": "phrygian", "lyd": "lydian",
    "mix": "mixolydian", "aeo": "aeolian", "loc": "locrian"};
  var keyNote = key.root + (key.acc || "");
  var keyMode = modeAliases[(key.mode || "").toLowerCase()] || "major";
  var keyScale = Tonal.Scale.get(keyNote + " " + keyMode).notes;
  if (!keyScale.length) keyScale = Tonal.Scale.get(keyNote + " major").notes;

  // Convert a Tonal pitch class (e.g. "C", "Bb") to an ABC pitch token.
  function toAbc(noteName) {
    if (!noteName) return "z";
    var cOrHigher = noteName.charCodeAt(0) >= 'C'.charCodeAt(0);
    var abcNote = Tonal.AbcNotation.scientificToAbcNotation(noteName + "4");
    return cOrHigher ? abcNote.toLowerCase() : abcNote;
  }

  // Returns [n, nd, nu, nu2]: the main chord note as ABC plus its diatonic
  // neighbours one and two scale degrees away.  Each step note is chosen at
  // the octave that minimises the interval to the main note, so no large jumps
  // occur regardless of which octave toAbc placed the main note in.
  function noteArgs(pc) {
    var mainAbc  = toAbc(pc);
    // Recover the actual MIDI of the placed note so steps are relative to it.
    var mainSci  = Tonal.AbcNotation.abcToScientificNotation(mainAbc);
    var mainMidi = (mainSci && Tonal.Note.midi(mainSci)) || Tonal.Note.midi(pc + "4") || 60;

    function stepAbc(delta) {
      var sign = delta > 0 ? 1 : -1;
      var idx = keyScale.indexOf(pc);
      var candidates = [];

      if (idx !== -1) {
        // Diatonic note: target is exactly |delta| scale degrees away.
        var stepPc = keyScale[((idx + delta) % keyScale.length + keyScale.length) % keyScale.length];
        for (var oct = 2; oct <= 6; oct++) {
          var m = Tonal.Note.midi(stepPc + oct);
          if (m) candidates.push({note: stepPc + oct, dist: sign * (m - mainMidi)});
        }
      } else {
        // Chromatic note (not in key scale): use the nearest key-scale note
        // in the requested direction so the voice still has meaningful motion
        // instead of repeating the same pitch.
        for (var si = 0; si < keyScale.length; si++) {
          for (var o = 2; o <= 6; o++) {
            var ms = Tonal.Note.midi(keyScale[si] + o);
            if (ms) candidates.push({note: keyScale[si] + o, dist: sign * (ms - mainMidi)});
          }
        }
      }

      candidates = candidates.filter(function(c) { return c.dist > 0; });
      if (!candidates.length) return mainAbc;
      candidates.sort(function(a, b) { return a.dist - b.dist; });
      return Tonal.AbcNotation.scientificToAbcNotation(candidates[0].note);
    }

    return [mainAbc, stepAbc(-1), stepAbc(1), stepAbc(2)];
  }

  // Build the half-bar ABC fragment (4 slots) used when 2 chords share a bar.
  function barFragment(noteName) {
    return pat.half.apply(null, noteArgs(noteName));
  }

  // Resolve chord names to Tonal note arrays (3 notes each)
  function extractChordNotes(chords) {
    var result = [];
    var last = "C";
    for (var bar = 0; bar < chords.length; bar++) {
      var barRow = [];
      for (var ci = 0; ci < chords[bar].text.length; ci++) {
        var ch = chords[bar].text[ci].toString();
        if (ch.trim() === "%") ch = last;
        ch = ch.split("/")[0];
        last = ch;
        var notes = Tonal.Chord.get(ch).notes.slice(0, 3);
        while (notes.length < 3) notes.push(notes[0] || "C");
        barRow.push(notes);
      }
      result.push(barRow);
    }
    return result;
  }

  // Voice-lead: for each bar, choose the inversion that minimises movement
  // from the previous chord. Returns same structure as input.
  function voiceLead(chordNotes) {
    if (!chordNotes.length || !chordNotes[0].length) return chordNotes;
    // Seed: use the first chord of bar 0 as-is, then remove it from the queue
    var seed = chordNotes[0][0];
    chordNotes[0] = chordNotes[0].slice(1);
    var sorted = [[seed]];

    function semitones(a, b) {
      var up   = Tonal.Interval.semitones(Tonal.Interval.distance(a, b));
      var dn   = Tonal.Interval.semitones(Tonal.Interval.distance(b, a));
      return Math.min(up, dn);
    }

    for (var bar = 0; bar < chordNotes.length; bar++) {
      var currentBar = [];
      for (var ci = 0; ci < chordNotes[bar].length; ci++) {
        var prev = sorted[sorted.length - 1].slice(-1)[0];
        var curr = chordNotes[bar][ci];
        var iR = [], iS = [], iT = [];
        for (var n = 0; n < 3; n++) {
          iR[n] = semitones(prev[0], curr[n]);
          iS[n] = semitones(prev[1], curr[n]);
          iT[n] = semitones(prev[2], curr[n]);
        }
        var list = iR.concat(iS).concat(iT);
        var rI = 0, sI = 1, tI = 2;
        for (var p = 0; p < 3; p++) {
          var mi = Math.min.apply(Math, list);
          var ix = list.indexOf(mi);
          if      (ix < 3) { rI = ix;     list.fill(100, 0, 3); }
          else if (ix < 6) { sI = ix - 3; list.fill(100, 3, 6); }
          else             { tI = ix - 6; list.fill(100, 6, 9); }
          list[ix % 3] = list[(ix % 3) + 3] = list[(ix % 3) + 6] = 100;
        }
        currentBar.push([curr[rI], curr[sI], curr[tI]]);
      }
      if (currentBar.length) sorted.push(currentBar);
    }
    return sorted;
  }

  var rawNotes  = extractChordNotes(chords);
  var voicedBars = voiceLead(rawNotes);

  // Only show a chord annotation when the original bar had an explicit chord
  // name — bars with % (repeat) get no annotation, matching the original song.
  function getChordAnn(barIdx, chordIdx) {
    if (!chords[barIdx] || !chords[barIdx].text) return "";
    var ci = Math.min(chordIdx, chords[barIdx].text.length - 1);
    var raw = (chords[barIdx].text[ci] || "").toString().trim();
    if (!raw || raw === "%") return "";
    return '"' + raw.replace(/"/g, '') + '"';
  }

  // Replace visible rests (z) with invisible rests (x) — used for Third/Fifth
  // voices so only the Root voice shows rest symbols.
  function hideRests(s) { return s.replace(/z(\d*)/g, "x$1"); }

  // Build one ABC bar fragment per voice; V:1 gets chord annotations.
  // Single-chord bars alternate between twobar1 (even bars) and twobar2 (odd
  // bars) to produce the classic 2-bar comping figures from jazz textbooks.
  var v1_bars = [], v2_bars = [], v3_bars = [];
  for (var bar = 0; bar < voicedBars.length; bar++) {
    var cb = voicedBars[bar];
    if (cb.length === 1) {
      var patFn = (bar % 2 === 0) ? pat.twobar1 : pat.twobar2;
      var ann = getChordAnn(bar, 0);
      v1_bars.push(ann + patFn.apply(null, noteArgs(cb[0][0])));
      v2_bars.push(hideRests(patFn.apply(null, noteArgs(cb[0][1]))));
      v3_bars.push(hideRests(patFn.apply(null, noteArgs(cb[0][2]))));
    } else if (cb.length === 2) {
      var ann0 = getChordAnn(bar, 0);
      var ann1 = getChordAnn(bar, 1);
      v1_bars.push(ann0 + barFragment(cb[0][0]) + " " + ann1 + barFragment(cb[1][0]));
      v2_bars.push(hideRests(barFragment(cb[0][1]) + " " + barFragment(cb[1][1])));
      v3_bars.push(hideRests(barFragment(cb[0][2]) + " " + barFragment(cb[1][2])));
    } else {
      // 3+ chords per bar: quarter notes
      v1_bars.push(cb.map(function(c, i){ return getChordAnn(bar, i) + toAbc(c[0]) + "2"; }).join(" "));
      v2_bars.push(cb.map(function(c){ return toAbc(c[1]) + "2"; }).join(" "));
      v3_bars.push(cb.map(function(c){ return toAbc(c[2]) + "2"; }).join(" "));
    }
  }

  var posNames = ["Root","Third","Fifth"];

  // Split bars into lines matching the original song's line structure
  var lineCounts = barsPerLine(song, voicedBars.length);

  function voiceLines(bars) {
    var lines = [];
    var idx = 0;
    for (var l = 0; l < lineCounts.length && idx < bars.length; l++) {
      var line = [];
      for (var b = 0; b < lineCounts[l] && idx < bars.length; b++, idx++) {
        line.push(bars[idx]);
      }
      lines.push(line.join("|") + "|");
    }
    return lines.join("\n");
  }

  var rhythmNames = {
    'on_2_and_4':      'On 2 and 4',
    'hold_over':       'Hold over',
    'walk_down_a':     'Walk down A',
    'cross_step':      'Cross step',
    'walk_down_b':     'Walk down B',
    'hit_and_hold':    'Hit and hold',
    'double_hit':      'Double hit',
    'whole_note':      'Whole note',
    'whole_then_step': 'Whole then step',
    'step_approach':   'Step approach',
    'double_then_step':'Double then step',
    'walk_eighths':    'Walk eighths',
    'full_walk':       'Full walk',
    'third_approach':  'Third approach',
    'step_neighbor':   'Step neighbor',
    'hold_and_rise':   'Hold and rise'
  };
  var rhythmLabel = rhythmNames[rhythm] || rhythm;

  return [
    "X:0",
    "L:1/8",
    "M:4/4",
    "T: " + song.metaText.title + " (comping - " + rhythmLabel + ")",
    "K: " + key.root + (key.acc || ""),
    "%%score (1 2 3)",
    "V:1 stem=up   name=\"" + posNames[0] + "\"",
    "V:2 stem=up   name=\"" + posNames[1] + "\"",
    "V:3 stem=down name=\"" + posNames[2] + "\"",
    "V:1",
    voiceLines(v1_bars),
    "V:2",
    voiceLines(v2_bars),
    "V:3",
    voiceLines(v3_bars)
  ].join("\n");
}

/*
   Function: barsPerLine
   Returns an array with the bar count for each staff line of the original song,
   so the comping output can mirror the same line structure.
*/
function barsPerLine(song, totalBars) {
  var counts = [];
  var inAlt = false;
  for (var i = 0; i < song.lines.length; i++) {
    if (song.lines[i].staff === undefined) continue;
    var voice = song.lines[i].staff[0].voices[0];
    var n = 0, hasNote = false;
    for (var j = 0; j < voice.length; j++) {
      var el = voice[j];
      if (el.el_type === "note") hasNote = true;
      if (el.el_type === "bar") {
        if (el.startEnding !== undefined && el.startEnding > 1) inAlt = true;
        if (el.endEnding   !== undefined && inAlt)              inAlt = false;
        if (!inAlt && hasNote) { n++; hasNote = false; }
      }
    }
    if (n > 0) counts.push(n);
  }
  var total = counts.reduce(function(a, b) { return a + b; }, 0);
  if (total !== totalBars) {
    // Fallback: equal distribution matching original line count
    var nLines = Math.max(counts.length, 1);
    var perLine = Math.ceil(totalBars / nLines);
    counts = [];
    var rem = totalBars;
    while (rem > 0) { var k = Math.min(perLine, rem); counts.push(k); rem -= k; }
  }
  return counts;
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
  return note.replace("b ", "♭").replace("#", "♯").replace("dim", "Ø");
}

/*
   Funcion: parse_chord_scheme
   Reads the chords from the song in abcjs intermediate format into a list per measure with the chords
   Returns:
       chords - A list of lists with the chords per measure
*/
function parse_chord_scheme(song) {
  var chords = [];
  var current_measure = {};
  current_measure.text = [];

  var validChord = /^[A-Ga-g]([#♯b♭])?(maj|m|min|dim|aug|sus|add)?(Ø)?(\d)?([#♯b♭])?(\d)?(\/[A-Ga-g]([#♯b♭])?(\d)?)?$/;
  var parsed_valid_chord = false;
  var did_not_parse_chord_in_this_measure = true;
  var in_alternative_ending = false;
  var note_or_rest_in_measure = false;

  for (var i = 0; i < song.lines.length; i += 1) {

    // Subtitle is added to song.lines, don't break when line has no staff
    if (song.lines[i].staff !== undefined) {
      var line = song.lines[i].staff[0].voices[0];

      for (var line_idx = 0; line_idx < line.length; line_idx += 1) {
        var element = line[line_idx];

        if (element.el_type === "note") {
          note_or_rest_in_measure = true;
        }

        if (element.el_type === "bar") {
          if (element.type === "bar_left_repeat") {
            current_measure.leftRepeat = true;
          }
          else if (element.type === "bar_right_repeat") {
            current_measure.rightRepeat = true;
          }
          else if (element.type === "bar_thin_thin") {
            if (note_or_rest_in_measure && parsed_valid_chord) {
              current_measure.doubeThinBarRight = true;
            } else {
              current_measure.doubeThinBarLeft = true;
            }
          }

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
            if (did_not_parse_chord_in_this_measure &&
                parsed_valid_chord &&
                note_or_rest_in_measure) {
              current_measure.text.push(" % ");
            }

            if (current_measure.text.length > 0) {
              current_measure.text = current_measure.text.slice(0);

              chords.push(current_measure);
              current_measure = {};
              current_measure.text = [];
              note_or_rest_in_measure = false;
            }

            did_not_parse_chord_in_this_measure = true;
          }
        }

        if (!in_alternative_ending) {
          if (element.chord !== undefined && validChord.test(element.chord[0].name)) {
            current_measure.text.push(element.chord[0].name);
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
   Funcion: simplify_blues
   Checks if it is a 12-bar blues scheme, if so, check if all chords are repeated, and just return the 12-bar blues.
   Returns:
       chords - A list of lists with the chords per measure
*/
function simplify_blues(chords) {
  return simplify_song(chords, 12)
}

/*
   Funcion: simplify_song
   Checks if it is a count-bar scheme, if so, check if all chords are repeated, and just return the 12-bar blues.
   Returns:
       chords - A list of lists with the chords per measure
*/
function simplify_song(chords, count) {

  if (chords.length === 0 || chords.length % count !== 0) {
    return chords;
  }

  var repeats = chords.length / count;

  // Check each measure in the blues
  for (var i = 0; i < count; i++) {
    var first = chords[i].text;

    for (var r = 1; r < repeats; r++) {
      var second = chords[i + count * r].text;

      // Are there the same amount of chords in the measure?
      if (first.length != second.length) {
        return chords;
      }

      for (var c = 0; c < first.length; c++) {
        if (first[c] !== second[c]) {
          return chords;
        }
      }
    }
  }

  // Its a scheme that repeats! Dump any bars or repeats
  for (var c = 0; c < count; c++) {
    if (chords[c].leftRepeat !== undefined) {
      delete chords[c].leftRepeat;
    }
    if (chords[c].rightRepeat !== undefined) {
      delete chords[c].rightRepeat;
    }
    if (chords[c].doubeThinBarLeft !== undefined) {
      delete chords[c].doubeThinBarLeft;
    }
    if (chords[c].doubeThinBarRight !== undefined) {
      delete chords[c].doubeThinBarRight;
    }
  }

  return chords.slice(0, count);
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

  chords = simplify_blues(chords);
  chords = simplify_song(chords, 8);

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
        var chordDiv = document.createElement("DIV");
        chordDiv.classList.add("chordDiv");
        chordDiv.innerHTML = chords[chord_idx].text.map(replace_accidental_with_utf8_char).join(" ");
        cell.appendChild(chordDiv);
        cell.classList.add("chordCell");

        if (chords[chord_idx].doubeThinBarLeft !== undefined) {
          cell.classList.add("chordCellDoubleThinBarLeft");
        }
        if (chords[chord_idx].doubeThinBarRight !== undefined) {
          cell.classList.add("chordCellDoubleThinBarRight");
        }

        if (chords[chord_idx].rightRepeat !== undefined) {
          cell.classList.add("chordCellRightRepeat");
          var span = document.createElement("span");
          span.classList.add("chordRightRepeatSign");
          span.innerHTML = ":";
          chordDiv.appendChild(span);
        }
        if (chords[chord_idx].leftRepeat !== undefined) {
          cell.classList.add("chordCellLeftRepeat");
          var span = document.createElement("span");
          span.classList.add("chordLeftRepeatSign");
          span.innerHTML = ":";
          chordDiv.insertBefore(span, chordDiv.childNodes[0]);
        }
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
      link.innerHTML = " | inspiration";
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
   Funcion: add_irealpro_link
   Adds a link to the sheetmenu for devices that could have irealpro
*/
function add_irealpro_link(song, chords) {

  var couldHaveIrealPro = /iPhone|iPad|iPod|Android|Macintosh/i.test(navigator.userAgent);
  if (couldHaveIrealPro && (chords.length > 0)) {
    var url = irealProFromAbc(song, chords);
    var link = document.getElementById("iRealPro");
    if (link !== null) {
      link.href = url;
    } else {
      link = document.createElement("A");
      link.innerHTML = " | irealpro";
      link.href = url;
      link.target = "_blank";
      link.id = "iRealPro";
      var menu = document.getElementById("sheetmenu");
      menu.appendChild(link);
    }
  }
}

/*
   Funcion: irealProFromAbc
   Creates an irealpro compatible link from ABC
*/
function irealProFromAbc(song, chords) {

  var key = song.lines[0].staff[0].key.root + song.lines[0].staff[0].key.acc;
  var num = song.lines[0].staff[0].meter.value[0].num;
  var denom = song.lines[0].staff[0].meter.value[0].den;


  var title = song.metaText.title;
  var composer = (song.metaText.composer !== undefined) ? song.metaText.composer : "Unknown";
  var style = "Second Line";

  var irealProHeader = title + '=' + composer + '=' + style + '=' + key + '=n=T' + num + denom;
  var irealProText = '';
  for (var i = 0; i < chords.length; i++) {

    if (chords[i].leftRepeat !== undefined) {
      irealProText += '{';
    }
    else if (chords[i].doubeThinBarLeft !== undefined) {
      irealProText += '[';
    }
    else if (i == 0)
    {
      irealProText += '|';
    }

    var cell = chords[i].text.toString().replace(/,/g, ' ,');
    var spaceCount = ((cell || '').match(/\ /g) || []).length;
    irealProText += cell;

    switch(spaceCount) {
      case 0:
        irealProText += "   ";
        break;
      case 1:
        irealProText += " ";
        break;
      default:
        break;
    }

    if (chords[i].rightRepeat !== undefined) {
      irealProText += '}';
    }
    else if (chords[i].doubeThinBarRight !== undefined) {
      irealProText += 'ZY|';
    }
    else
    {
      irealProText += '|';
    }

  }

  irealProText = irealProText.replace(/Ø/g, 'h').replace(/m/g, '-').replace(/%/g, 'x ').replace(/♭/g, "b").replace(/♯/g, "#").replace(/\|$/,"Z");

  return 'irealbook://' + encodeURIComponent(irealProHeader) + encodeURIComponent(irealProText);
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
  createCompingDropdown();
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

function createCompingDropdown() {
  var div = document.createElement("DIV");
  div.classList.add("dropdown");

  var select = document.createElement("SELECT");
  select.classList.add("dropbtn");
  select.id = "comping";
  select.onchange = rerenderFile;
  div.appendChild(select);

  var offOption = document.createElement("OPTION");
  offOption.innerHTML = "COMPING: OFF";
  offOption.value = "none";
  select.appendChild(offOption);

  var groups = [
    {
      label: "BASE PATTERNS",
      rhythms: [
        { label: "On 2 and 4",       value: "on_2_and_4" },
        { label: "Hold over",        value: "hold_over" },
        { label: "Hit and hold",     value: "hit_and_hold" },
        { label: "Double hit",       value: "double_hit" },
        { label: "Whole note",       value: "whole_note" }
      ]
    },
    {
      label: "STEP DOWN",
      rhythms: [
        { label: "Walk down A",      value: "walk_down_a" },
        { label: "Walk down B",      value: "walk_down_b" },
        { label: "Whole then step",  value: "whole_then_step" },
        { label: "Walk eighths",     value: "walk_eighths" }
      ]
    },
    {
      label: "STEP UP & DOWN",
      rhythms: [
        { label: "Cross step",       value: "cross_step" },
        { label: "Step approach",    value: "step_approach" },
        { label: "Double then step", value: "double_then_step" },
        { label: "Full walk",        value: "full_walk" },
        { label: "Third approach",   value: "third_approach" },
        { label: "Step neighbor",    value: "step_neighbor" },
        { label: "Hold and rise",    value: "hold_and_rise" }
      ]
    }
  ];

  for (var g = 0; g < groups.length; g++) {
    var grp = document.createElement("OPTGROUP");
    grp.label = groups[g].label;
    var rhythms = groups[g].rhythms;
    for (var i = 0; i < rhythms.length; i++) {
      var option = document.createElement("OPTION");
      option.innerHTML = rhythms[i].label.toUpperCase();
      option.value = rhythms[i].value;
      grp.appendChild(option);
    }
    select.appendChild(grp);
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

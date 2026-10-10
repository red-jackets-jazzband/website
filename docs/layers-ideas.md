# Layers: ideas for future layers

The Layers panel on `/songs/` (see **Layers panel** in [CLAUDE.md](../CLAUDE.md)) ships with two layers: **Fingerings** and **Named progressions**. This file collects candidates for later, so the next one can be picked up without starting from scratch. The original design, with its suggested groups, is on the design canvas: https://claude.ai/artifact/LmVyFj1ovor1haxyPanyWm

Nothing here is a commitment. The "Effort" column is a rough guess at the size of the change.

## How a layer is built (the short version)

A layer is one entry in `LAYERS` in [static/script/lib/music/layers.js](../static/script/lib/music/layers.js), plus a small preview image in a `<template id="layerPreview-<id>">` in [content/songs.md](../content/songs.md):

```js
{
  id: "chord-tones",            // persisted as rj.layer.chord-tones
  group: "Melody",              // the panel heading it sits under
  label: "Chord tones",
  hint: "1, 3, 5, ♭7, 9 under each note",
  availableFor: () => true,     // false greys the row out for that instrument
  annotate(song, context) {     // -> [{ startChar, text }]
    return [];                  // "_…" below the staff, "^…" above it
  },
}
```

Things the first two layers taught us:

- **Use plain ABC annotations wherever possible.** ABCjs makes room for them, spaces them and prints them, and they work on every browser. Draw on the SVG afterwards (in [songs/layers/overlays.js](../static/script/songs/layers/overlays.js)) only for what an annotation can't do, such as a band spanning several bars.
- **Above the staff is crowded.** An `^annotation` shares its row with the chord symbols and pushes some of them up. Below the staff works well. Rows stack in the order they're written, which `annotateLayers`' `writeOrder` controls (fingerings sit closest to the notes, then the progression band).
- **Match the SVG to the music by melody-note index, not by source offset.** Inserting annotations shifts every offset after them, so an index into the first voice's notes is the reliable link.
- **The `song` passed in is the tune as printed** (instrument transposition and clef already applied). Anything about pitch has to read where the note is *drawn* (`verticalPos`); see `noteMidi` in [fingerings.js](../static/script/lib/music/fingerings.js).
- **A layer must never change `plan.abcText`.** `rerender()` reads it again, and the comping and solo generators parse it.

## Harmony

| Layer | What it shows on the sheet | Building blocks already in the repo | Effort |
|---|---|---|---|
| **Roman numerals** | I, VI7, II7, V7… under each chord change, in the key | `convertChordsToRoman` in [music-theory.js](../static/script/lib/music/music-theory.js) already powers the "Concert + Roman" chord table; a per-chord version only needs the chord's position in the melody (already worked out for progressions) | S |
| **Form (A / B / C sections)** | A soft tint per section, the same shade wherever that section comes back, plus a small "B · 8 bars" label at its start | `P:` parts are parsed already; `stepShades` in [sheet.js](../static/script/songs/sheet/sheet.js) gives the form strip its greys | S–M |
| **More named progressions** | More of Pops Coffee's names as bands | `PROGRESSIONS` in [progressions.js](../static/script/lib/music/progressions.js) takes a new entry in one line. Candidates: **Sweet Sue** (an opening pattern from Post 41; its chords weren't confirmed when the first version was written), and anything else from Posts 41, 286 and 569 ("Traditional jazz comes in four-bar blocks"). Check each against the blog before adding it, as was done for Sunshine (Post 565) | S each |
| **Lego bricks + joins** | Conrad Cork's "bricks" (familiar chord chunks) as boxes behind the chord row, with a marker where two bricks join | The progression matcher already walks chord segments with lengths. The brick and join names need a real source (Cork's *Harmony with Lego Bricks*) before they go on screen; the design canvas used placeholder names | M |
| **Turnarounds and approach chords** | A light mark on the I–VI–II–V turnaround at the end of a section, and on chromatic approach chords (A♭7 → G7) | The progression matcher already detects approach chords and skips over them; it only needs to report them | S |
| **12-bar blues map** | "Blues · bar 1 of 12" markers, with the IV in bar 5 and the turnaround highlighted | `simplifyBlues` in [chords.js](../static/script/lib/music/chords.js) already recognises a repeating 12-bar scheme | S–M |
| **Key changes** | A clear mark where the key changes (e.g. the Trio of a march) | Key changes are already tracked per bar (`measure.key` in `parseChordScheme`) | S |

## Melody

| Layer | What it shows on the sheet | Building blocks already in the repo | Effort |
|---|---|---|---|
| **Chord tones** | 1, 3, 5, ♭7, 9… under each note relative to the chord sounding over it: filled for chord tones, outlined for tensions, a dot for passing notes (as on the design canvas) | `noteMidi` gives each note's pitch; the progression code knows which chord is sounding at each note's time; Tonal (already loaded) can spell the chord | M |
| **Scale degree** | Each note's degree in the key (3, 6, 1…) | `noteMidi` plus the key tonic (`keyTonic` in progressions.js) | S |
| **Guide tones** | Highlights the 3rd and 7th of each chord, the notes that outline the changes, as a practice target for improvisers | Shares its maths with Chord tones | S once Chord tones exists |
| **Target notes on strong beats** | Marks the chord tone that lands on beat 1 or 3 | Note times are already summed in `collectHarmony` | S |
| **Blue notes** | A small mark on ♭3, ♭5 and ♭7 against the key | Same as Scale degree | S |
| **Range check** | Flags notes outside a comfortable range for the chosen instrument, e.g. above a high C on trumpet | The fingering charts already define each brass range; the reeds would need their own | S |

## Rhythm

| Layer | What it shows on the sheet | Building blocks already in the repo | Effort |
|---|---|---|---|
| **Beat counts** | "1 + 2 + …" under syncopated bars only, for reading practice | Note durations and bar positions are already summed for progressions, and `lint-abc.js` has its own bar-position walk | M |
| **Pickups and stop-time breaks** | Marks the pickup into each section, and bars where the band stops (an `N.C.` chord or written rests) | `BREAK_CHORD` (`N.C.`) is already recognised in chords.js | S |

## Performance (instrument helpers)

The design keeps this group open on purpose. The dashed "more helpers will appear here" slot in the panel is where these go.

| Layer | What it shows on the sheet | Notes | Effort |
|---|---|---|---|
| **Alternate fingerings** | A second, smaller fingering where a common alternative exists (low D 1-3 on trumpet, 4th position on trombone) | Extends the existing charts in [fingerings.js](../static/script/lib/music/fingerings.js) | S |
| **Trombone glissando marks** | Shows the slide distance of a tailgate smear between two notes | Uses the slide positions already in the chart | S–M |
| **Clarinet / saxophone fingerings** | Key diagrams or register keys | Woodwind fingerings don't fit in a one-line number, so this needs small inline diagrams drawn on the SVG; a different technique from the brass layer | L |
| **Banjo / guitar chord shapes** | A small chord box above each chord change | Like woodwinds, it needs drawn diagrams; for space reasons maybe only in the chord table, not on the staff | L |
| **Bass-line hints** | Root and 5th under each chord for sousaphone/bass ("two-beat") playing | The comping generator already voices root/3rd/5th (`buildCompingTune`) | M |
| **Breathing marks** | A suggested breath at phrase ends (rests ≥ a beat, ends of 2- and 4-bar phrases) | Heuristic, so it needs listening tests with the band | M |

## Band and arrangement

| Layer | What it shows on the sheet | Notes | Effort |
|---|---|---|---|
| **Who plays when** | The `W:` form table ("trumpet lead, clarinet joins…") shown at the section it applies to, not only in the strip above the sheet | `parseFormStep` in [words-table.js](../static/script/lib/music/words-table.js) already parses it | M |
| **Polyphony roles** | Lead / counter-melody / bass roles in New Orleans ensemble passages | Needs a convention in the ABC files first | L |
| **Ending and tag cues** | Marks for the last-chorus tag, "out chorus" and coda | Partly in the `W:` tables already | S–M |

## Learning and memory

| Layer | What it shows on the sheet | Notes | Effort |
|---|---|---|---|
| **Fade the melody** | Hides every other bar (or more) of the melody so you play it from memory, with the chords kept | Done by the render plan, not as an annotation; a "subtractive" layer is a new kind | M |
| **Hide the chords** | Ear-training: hides chord symbols, with the progression names optionally kept | Same "subtractive" mechanism | M |

## Panel features deferred from the first version

- **Presets** (Beginner, Brass player, Improviser). Not worth it with only two layers; sensible once there are four or five.
- **Peek on hover**: showing a switched-off layer faintly on the sheet while you hover its row. Each peek would need a full re-engrave of the sheet; worth it only if that can be made cheap, e.g. by toggling a CSS class on annotations that are always drawn.
- **Overlay on mid-size desktops**: at around 1440 px the open panel leaves the sheet quite narrow, because the split layout's content column is narrow already. It could overlay instead of pushing below a certain content width.
- **Real Safari check**: the code stays within the Safari-12 rules, but the panel has only been tested in Chromium so far.

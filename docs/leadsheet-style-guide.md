# Lead sheet style guide

House rules for the ABC lead sheets in `static/songs/`. Written to be used as a
checklist when **writing** a transcription and when **reviewing** one.

Sources: the rules below marked **(new)** were agreed for this guide; the rest are
collected from `CLAUDE.md` and `.claude/skills/transcribe-song/references/abc-style.md`
(which has the long-form reasoning and war stories for most of them).

Each rule is tagged with how it is checked:

- **lint** — enforced by `npm run lint:abc` / `lint:catalog` (CI fails)
- **review** — nothing checks it automatically; a reviewer has to look

Always verify the result with `npm run lint` and by rendering the tune the way the
site does (`node .claude/skills/transcribe-song/scripts/render_site.mjs <file>.abc out.png`)
and reading the image back — most of the review-only rules can only be seen there.

## 1. Files and header

| Rule | Check |
|---|---|
| One tune per file in `static/songs/`, filename lowercase, `_`-joined, short (`washington_and_lee.abc`). | review |
| Every file is listed in `static/songs/index_of_songs.txt` as `Title,file.abc`, in alphabetical order. The same file may be listed under several alias titles for searchability. | lint (a dead entry fails; a missing entry is only a note) |
| Header field order: `X:1`, `T:`, `C:` (composer and year), then any of `F:` / `R:` / `N:`, then `M:`, `L:`, `Q:`, `K:`. | review |
| `M:` is read off the source, never assumed. | review |
| `L:1/4` by default, `L:1/8` for busy tunes. | review |
| `Q:` only if the source prints a tempo. It seeds the Tempo stepper's bpm. | review |
| `F:` links are absolute `http(s)` URLs (YouTube, Spotify, SoundCloud embed in the Inspiration panel; anything else, e.g. SecondHandSongs, becomes an "open in new tab" button). | lint |
| The header `K:` is the key the tune opens in (the setlist key badges are computed from it). | review |

## 2. Parts and bar lines

| Rule | Check |
|---|---|
| **(new)** Parts are separated by a **double bar line** (`\|\|`; `\|]` for the very last bar; a repeat sign `:\|` already counts). | lint |
| Mark every part with a `P:` line (`P:Intro`, `P:A`, `P:B`, …). The site draws the part boxes from it. | review |
| Last bar of the tune ends `\|]`. | review |
| Repeats: `\|:` … `:\|`; 1st/2nd endings as `\|1 … :\|2 … \|\|`. A repeat that is **written out** on the sheet is written out in the ABC; use repeat signs only if the sheet does. | review |
| A whole note tied into the 1st ending can only be tied once in ABC. If the sheet also ties into the 2nd ending, tie only into the first and say so in the PR. | review |
| Dashed "break" spans on the sheet: put `"^Break"` next to the chord on the first bar of each span and list the spans in an `N:` line. | review |

## 3. Pickup bars

| Rule | Check |
|---|---|
| **(new)** A pickup (anacrusis) is written as the notes only. **No rests in front of it.** The first bar is allowed to be short. | lint |
| A short first bar, or a short bar right before/after a `P:` change, is exempt from the bar-length check. A tune's closing bar is exempt too. | lint |
| A pickup is followed by `\|\|` when it is a real anacrusis (`F G A \|\|`). | review |

## 4. Chord symbols

Chords go in quotes right before the note: `"Bb"`, `"F7"`, `"Cm7"`, `"C7#5"`, `"N.C."`.

| Rule | Check |
|---|---|
| **(new)** The **first bar of every part** carries a chord, even if it repeats the previous part's last chord. | lint |
| **(new)** The **first bar of every printed line of music** carries a chord. That bar is also the first cell of its line in the chord table, so each line of the table starts with a chord. | lint |
| **(new)** Everywhere else, if a bar has exactly the same chord as the bar before it, **leave the chord out.** Write chords at each change only. | lint |
| Aim for a chord on beat 1 or on the exact midpoint (beat 3 in 4/4) when the source's harmonic rhythm is that simple. Beat 2/4 chords are fine when the source really has them (cadential approach chords, syncopated punches, three chords in one bar). Don't tie-split or overlay-hack a chord onto the beat 1/3 grid just because it's there. | review |
| A chord must not sit on the **first half of a tie whose continuation lands on beat 1 or the midpoint**. Move it to the continuation. If one long note spans the beat, split it into two tied notes of the same pitch and put the chord on the second. | lint |
| A chord change under one long note (a dotted half spanning beats 1–3) that has no note starting there: use an overlay with an invisible rest, `C6 & x4 "Bb7"x2`. | review |
| Spell chords so abcjs/Tonal understand them: `"Adim"` not `A°`; `7#5`, `mØ` style jazz extensions are fine; a rootless `"G5"` is fine. (The Roman-numeral analysis, the Comping generator and the Mixer's Bass/Chords channels are all driven by these names.) | review |
| If the sheet has both a boxed chord grid and chord labels over the staff, compare a few bars of each before transcribing. They are usually the same harmony, but can be two unrelated charts. | review |
| Chord labels printed over the middle of a bar on the source are usually just placement. Put the chord at the bar start unless the sheet really shows a change mid-bar. | review |

## 5. Notes, accidentals and ties

| Rule | Check |
|---|---|
| Every bar adds up to the meter. | lint |
| No parser warnings from abcjs. | lint |
| Accidentals persist to the end of the bar for the same pitch, as in print. Write an explicit natural (`=B`) when the second note is natural. A note tied across a barline keeps its accidental; the next same-letter note in the new bar does not. | review |
| Ties (`-`) only join notes of the same pitch. A note held over a barline is `F2- \| F …`. | review |
| Never change a pitch or a duration to satisfy a layout rule. Fix layout with tie-splitting and spacing only. | review |
| The `K:` must match the harmony. Needing an explicit accidental on nearly every occurrence of one letter, or chords that are mostly foreign to the key, means the key signature is wrong. Fix `K:`, not the accidentals. | review |
| A transposing-instrument sheet (staff chords and notes don't agree) is converted to concert pitch with a systematic shift against the *concert* key signature. Re-derive the accidentals, never copy a written sign across. | review |
| A diminished 7th chord is symmetric, so keep the chord grid's spelling. | review |

## 6. Beaming

ABC beams notes only when there is **no whitespace** between them (`DCDF` is one group,
`D C D F` is four flagged notes).

| Rule | Check |
|---|---|
| A beam group has at most 4 eighths. | lint |
| A group of exactly 4 only at the very start or end of the bar. | lint |
| A beam never crosses the bar's halfway point (not checked in odd-beat meters such as 3/4 or 9/8). | lint |
| A group entirely inside a tuplet is exempt. | lint |
| Otherwise match the source's own engraved beam groups. | review |

## 7. Key changes

| Rule | Check |
|---|---|
| Put an inline `K:` on its own line right after the section's `P:` line, written in the new key's own signature with no hand-spelled accidentals. | review |
| Keep the header `K:` as the opening key. | review |

## 8. Layout

| Rule | Check |
|---|---|
| Fit as many bars per line as stay readable, aiming for **8 bars per line**. Fall back to 6 or 4 if lyrics collide. Test on the actual render, not on arithmetic. | review |
| Break lines at part boundaries, otherwise pair whole phrases (group in 8s from the start of the part). | review |
| The sheet should print on a sensible number of pages (a recent Panama change reflowed it to 8 bars per line to fit 2 pages). | review |
| Join the lines only after the ABC is otherwise correct, then re-render. | review |

## 9. Lyrics (`w:` lines)

| Rule | Check |
|---|---|
| One syllable per note slot. Rests are skipped; the **second note of a tie consumes a slot** (use `_` there). | review |
| Syllable-joining hyphens have **no surrounding whitespace** (`Lou-eas-y`, never `Lou - eas - y`). A spaced hyphen is its own slot and silently shifts every later word. | review |
| Join the `w:` lines of merged music lines into ONE `w:` line (a second `w:` line means a second verse). | review |
| After any line with more than one hyphen, re-render and read the words back off the image. | review |

## 10. Things that bite on this site

These are not style as such, but a lead sheet that breaks one of them shows up as a bug on `/songs/`:

- A tune with chords gets an iReal Pro link, Comping, and the Mixer's Bass/Chords channels. They are all generated from the chord symbols, so a wrong or unparseable chord is audible and visible.
- The chord table has one cell per bar. Bar structure on the sheet (pickup, repeats, endings) therefore decides what the cells and the click-to-seek bar mapping look like.
- A `.abc` file that is not in the index is not shown in the library (only printed as a note by `lint:catalog`). That can be deliberate, but check it.

## Arrangement notes

Remarks about how the band plays this tune (the arrangement or "road map": intro, how many
choruses, singing, solos, breaks, outro, key changes) are written in the tune itself so a
band member sees them on the sheet. They are `W:` lines in the header, one remark per line,
printed as lines of text **below the music**:

```
W:Intro bass, 2x collective, singing, solos
W:After solos: 1xA (no rhythm), 1xA with rhythm, 1xB, 1xB stop in break
```

`W:` is ABC's standard "words printed after the tune" field; abcjs draws it at the bottom
of the sheet, and in the header it is safe for the Comping/Solo generators, which only read
the body. (A `%%text` line in the body would be drawn too, but those generators would read it
as music.) Keep each remark short and put the lines before the `K:` line, together with the other header
fields. Don't use them for sung lyrics: those are `w:` lines under the notes.

**Round-by-round form (who plays what, per round) is a `W:` pipe table**, not a `P:` header line:
one row per round, `W:| <round> | <what the band plays> |`, with `;`-separated asides
(`+Instrument` for someone joining in). The site draws it as an arrow strip under the chord
grid. Put an exception for a particular round (e.g. "final round: play the Outro instead of
A3") in that round's row, and keep the extra part itself as its own `P:` section at the end
of the music (`P:Outro`). Both the regular last part and the extra one end on `|]`, so the sheet shows the extra part is an alternative ending, not a continuation. A header `P:` line
(before `K:`) is only the plain order of the parts, e.g. `P:Intro A B A`. Don't add a second
table for the same tune: consecutive `W:|` lines merge into one table.

*Song form* is something else: the structure of the composition itself (12-bar blues, AABA,
32 bars). Use `N:` only for background that is not meant for the stage (an alternative
title, an arrangement credit, a source): abcjs reads `N:` but never draws it. Open
questions about a transcription belong in the PR description, not in the tune.

## Review checklist

1. `npm run lint` is green.
2. Rendered with `render_site.mjs` and compared to the source sheet, bar for bar.
3. Header order, `K:`, `M:`, `F:` links, and the index entry are correct.
4. `P:` marks on every part, double bar lines between parts, `|]` at the end.
5. Chord at the first bar of every part and every printed line; no repeated identical chords in between.
6. Pickup has no rests before it.
7. Beaming reads like the source; no tie-split or overlay tricks that aren't needed.
8. Lyrics (if any) read back correctly off the render.
9. Anything guessed or unreadable on the source is called out in the PR description (not in the tune).

## What the style lint checks, and what it leaves alone

The **(new)** rules above are enforced by `scripts/lint-abc-style.js` (part of `npm run lint:abc`),
on the voice that carries the chords. Deliberate gaps:

- Nothing is required before a tune's **first chord**: a chordless intro or lead-in has no
  chord to restate, and the linter won't invent one. (Those songs still need a chord adding
  by someone with the original chart.)
- A **melody-only** tune (no chord symbols at all) isn't checked.
- A **short pickup** first bar may hand the part's/line's chord to the bar after it.
- A **repeat sign or 1st/2nd ending** resets the chord in effect, so a chord restated right
  after one isn't flagged.
- The no-rests-before-a-pickup check only looks at a **single-voice** tune's first bar, and
  only when that bar is a full bar starting with rests and closed by a double or repeat bar
  line. In a multi-voice chart the first bar is a riff for every voice, not a pickup.
- "Line of music" means a line of the ABC source; joining or splitting lines changes which
  bars must carry a chord.

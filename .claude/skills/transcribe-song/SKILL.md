---
name: transcribe-song
description: >-
  Transcribe a lead sheet (PNG/JPG/GIF/PDF), a MIDI file, or any combination of
  them into ONE ABC-notation file in static/songs/ and register it in
  static/songs/index_of_songs.txt. Use whenever the user hands over sheet-music
  images/PDFs and/or a .mid and asks to "transcribe", "add a song", "make an
  ABC", or similar. Covers PDF->PNG conversion, OMR of the lead sheet, picking
  and transposing the lead track out of a multi-part MIDI, reading chord symbols,
  writing the file in the repo's house style, and validating the result by
  rendering it back and comparing to the source.
---

# Transcribe a song to ABC

Goal: produce a single clean `static/songs/<name>.abc` (melody + chord symbols, house
style) from whatever source material the user provides, and add it to
`static/songs/index_of_songs.txt`.

The lead sheet is always the primary source of truth. A MIDI is a **cross-check and
fallback**, never copied verbatim — it is usually a multi-part arrangement in a
different octave/key with improvised fills.

## Tools (usually already installed — check before you pip install)

| Tool | Where | Use |
|---|---|---|
| `midi2abc`, `abc2midi` | `/usr/bin` | quick MIDI dump; **validate** the final ABC |
| `homr` | `tools/OMR/.venv/bin/homr` | OMR: `homr scan.png` writes `scan.musicxml` beside it |
| `music21` | `tools/OMR/.venv` | parse MusicXML/MIDI, transpose, dump measures |
| `mscore` (MuseScore) | `/usr/bin/mscore` | render MusicXML/ABC to PNG for visual check |
| `pdftoppm`, PyMuPDF (`fitz`) | `/usr/bin`, venv | PDF -> PNG |
| Python + PIL + numpy (+ scipy) | venv | crop / zoom / annotate the scan, find barlines & chords |

Helper scripts live in `.claude/skills/transcribe-song/scripts/`. Set up shell vars:

```
VP=tools/OMR/.venv/bin/python3            # venv Python — run every script with this
SK=.claude/skills/transcribe-song/scripts
```

**If `tools/OMR/.venv` doesn't exist** (seen on a fresh Claude Code on the web / remote
container — this table describes the common case, not a guarantee): the `_staff.py`/
`zoom.py`/`crop_systems.py`/`chord_map.py`/`notehead.py` family needs only `pip install
pillow numpy` (or a plain `python3` if those are already present) — run them with that,
not `$VP`, and skip the `VP=` var entirely for this half of the toolkit. For real OMR,
`pip install homr music21` works from a scratch venv (`python3 -m venv /tmp/omrvenv &&
/tmp/omrvenv/bin/pip install --upgrade pip setuptools wheel` **before** `pip install
homr` — an old setuptools fails building `antlr4-python3-runtime` with a cryptic
`install_layout` AttributeError), then `/tmp/omrvenv/bin/homr --init` once to download
its three models (~130MB total, one-time). Use that venv's `python3`/`homr` in place of
`$VP`/`homr` throughout. `render_site.mjs` needs Playwright too, and it resolves the package from the current
working directory first, then falls back to `~/.npm/_npx/*/node_modules/playwright` —
if neither has it, `cd` into a scratch dir, `npm install playwright --no-save` there,
and run `node <repo-path>/render_site.mjs ...` **from that scratch dir** so the cwd
lookup finds it. Pass `--browser` pointing at the environment's pre-installed browser
(commonly `$PLAYWRIGHT_BROWSERS_PATH/chromium-<rev>/chrome-linux/chrome` — `find
"$PLAYWRIGHT_BROWSERS_PATH" -iname chrome` to get the exact path; never `playwright
install`, the browser is already there) — the script forwards it straight to
`chromium.launch({ executablePath })`. None of this touches the repo's own
`node_modules` or `package.json`.

Scripts that save you doing it by hand (use them — hand-transposing and eyeballing every
bar is where the tokens go):

| Script | Does |
|---|---|
| `omr_to_abc.py` | homr MusicXML -> **draft ABC**, already transposed, key-signature-aware accidentals, lengths, barlines; warns on bars that don't sum to the meter and lists possible ties |
| `omr_staves.py` | homr's **per-staff log** -> draft ABC per staff, with per-staff `--keysig` / `--clef` fixes, confidence, bar-count and near-duplicate-staff warnings. Use it instead of `omr_to_abc.py` whenever the sheet has a key change, endings or a staff homr may have misread (see step 2) |
| `notehead.py` | ASCII close-up of a notehead in the original scan pixels: filled (quarter) vs hollow (half) when the rhythm is ambiguous |
| `crop_systems.py` | scan -> `head.png` (title + chord grid) + one 3x crop per staff system; Read only what you need. `--scale 6 --xrange 0.5-0.8` gives a big close-up of one horizontal slice |
| `render_site.mjs` | renders the ABC **exactly as the /songs/ sheet does** (same abcjs, `staffwidth: 1000` + responsive resize, MuseJazzText, one line per source line) to a PNG — the only faithful check of line density/readability; `--lyrics-off` drops `w:` lines. Uses `node`, not `$VP` |
| `check_abc.py` | diffs your finished ABC against the OMR **as text** (pitch/onset/duration per bar, ties resolved) and checks `w:` syllable counts vs notes |
| `abc_notes.mjs` | (used by `check_abc.py`) the ABC's real note stream via the repo's abcjs |

Do all scratch work in the session scratchpad dir, never in the repo tree.

## Procedure

### 1. Sort the inputs

Identify what was given: lead-sheet image(s), lead-sheet PDF, MIDI, or a mix.
- PDF -> PNG: `pdftoppm -png -r 300 in.pdf page` (or `$VP $SK/pdf_to_png.py in.pdf`). One PNG per page.
- Multi-page lead sheet: process each page, concatenate the measures in order.
- If **only** a MIDI is given, you still need the key — infer it from the MIDI or ask.
- A pasted image lives at `~/.claude/uploads/<session>/*.gif|png`; copy it to the scratchpad
  and convert with PIL (`Image.open(p).convert("RGB").save("scan.png")`) — homr wants PNG/JPG.
- Screen-grab scans are often ~600px wide. **Upscale 3x (LANCZOS) before homr** — it read
  a 596px sheet fine that way, with every note right except the items listed below.
  Keep the un-upscaled `scan.png` too: crops and `notehead.py` work on it, and its
  pixel coordinates are the ones to quote.
- **Read the layout before any OMR** (Read the whole scan once, `head.png` after
  `crop_systems.py`). Write down, per staff system: the key signature (a **natural sign
  cancelling a sharp/flat at the start of a system is a key change** — homr misses these),
  repeat signs `|:` `:|`, 1st/2nd endings, rehearsal words ("Intro"), a pickup bar, and
  systems that are written-out copies of each other. Also expand the boxed chord grid into
  one chord per bar (step 4). Most of the trouble below shows up here first, for free.
- **If there's both a boxed chord grid and chord labels over the staff, compare them now**,
  before transcribing a single note: read 3-4 grid cells and the labels for the same bars.
  Same chords → normal. A consistent transposition (e.g. grid says `Gm D7`, staff labels say
  `Am E7`, every pair a major 2nd apart) → the melody staff is written for a Bb instrument
  (see the transposing-instrument note in step 4) and you should transpose *while* transcribing,
  not discover it bar 30 in and redo everything. This 30-second check is cheap; finding out
  late is not.

### 2. OMR the lead sheet  (if any image/PDF)

```
$VP $SK/omr_dump.py scan.png       # runs homr, writes scan.musicxml, dumps it
$VP $SK/omr_dump.py scan.musicxml  # (re-dump an existing musicxml)
```

homr gives you: clef, key signature, bar count, and a per-measure note list.
homr does **not** give you: chord symbols, rehearsal marks, repeats/endings.
homr's typical mistakes: octave-off on ascending quarter-note runs, invented
chromatic passing tones, missed ties. Treat its output as a strong first draft.
More specific misses seen: **every tie is dropped** (the musicxml has none — read them
off the crops); a later same-pitch note in the bar is written without the accidental
that persists from earlier in the bar (`B♭ B` should be `B♭ B♭`); the note after a
tied-over accidental gets it or loses it inconsistently. Its pitches and rhythms were
otherwise right on a clean ~600px sheet, including a mid-bar flat on a lead-in eighth.
Ignore `Found title: G7` etc. — it OCRs chord text as a title.

**Where the merged MusicXML goes wrong** (all seen on the Bugle Boy March sheet; check
these against your layout notes and switch to the per-staff path below if any apply):
- **One key signature for the whole sheet.** It uses the first staff's; a mid-sheet key change
  (G major, then a natural sign, then C major) leaves every later note in the wrong key.
- **A treble staff read as bass clef** (`F4/0` in the log). The pitches come out two octaves
  and a sixth off, *and* the staff loses bars (it dropped two of eight).
- **Endings and repeats**: a 2nd-ending bar is treated as an extra bar, often garbled into a
  4-note chord `[E5 C5 G4 F#4]`; bar counts then no longer line up with the sheet.
- **Rests can be missing** from a staff's notes, and `homr`'s own per-staff line has none at all.

**Per-staff path** — `omr_staves.py` reads homr's log (one `Staff(G2/1 4/4 ...)` line per
staff: clef, key signature in sharps, bars) instead of the merged MusicXML:

```
$VP $SK/omr_staves.py scan3.png --interval M-2 --key F > staves.abc   # runs homr, saves scan3.homr.log
$VP $SK/omr_staves.py scan3.homr.log --interval M-2 --key F \
      --keysig 6:0,7:0,8:0,9:0 --clef 8:treble                        # re-run with per-staff fixes
```

Each staff comes out as its own commented line of bars, already in the target key. Read
its stderr: `distance > 0.5` means homr fell back to a poorer attempt for that staff; a staff
with fewer bars than its neighbours dropped one; "guessed leading rest" bars are short
because the log has no rests (move the `z` to where the scan puts it — it was trailing, not
leading, in the `c4 z4` first-ending bar); and **"staves N and M are 86% alike"** is the
written-out-repeat detector — where two copies differ, one is misread, so compare both to
the scan. When a bass-clef misread dropped bars, don't repair it: copy the identical twin
staff (or read that staff by eye). `--keysig` takes the *sheet's own* sharps count for that
staff (0 = none, -2 = two flats), i.e. before the `--interval` transposition.

**Draft the ABC straight from the OMR** instead of transcribing by hand (single-key sheets
with nothing from the list above; otherwise use `omr_staves.py`):

```
$VP $SK/omr_to_abc.py scan3.musicxml --interval M-2 --key Bb --title "Name" > draft.abc
$VP $SK/crop_systems.py scan.png --out crops     # head.png (grid) + sys1.png ...
```

`--interval` is the music21 interval that turns the sheet's written pitch into the
repo's concert key (see the transposing-instrument note in step 4; omit for a concert
sheet). The draft has pitches, octaves, accidentals, lengths and barlines; stderr
lists bars that don't sum to the meter (a misread rhythm — e.g. an eighth read as a
quarter made one bar 4.5 beats) and *possible ties*. The draft has no chords, ties or
lyrics yet.

**Then verify by eye, once** — the diff in step 6 only shows where your ABC departs
from the OMR, so it cannot tell you the OMR was right. Read `head.png` (chord grid) and
each `sysN.png` (3x, with chord labels above and lyrics below), comparing against the
draft's bars. You're looking for: ties (add `-`), chords, lyrics, any pitch/accidental
homr got wrong, and whatever the bar-sum warnings pointed at. Fix the draft as you go;
zoom 8x on any bar whose accidental or note height is unclear — e.g. two beamed notes
at the same height where only the first has a sharp are *both* sharp. When a bar is
wrong, also check whether a trailing eighth is a pickup into the next system or the
last beat of its bar (it was the latter throughout on the jelly-roll sheet: one
lead-in pickup, every later bar full).

**Rhythm you can't settle by eye** (three heads in a 4/4 bar, a half or a quarter?):
engraving software doesn't space notes in proportion to their length, so gaps between
heads prove nothing. Look at the head itself in the *original* pixels — `notehead.py scan.png
270,581 289,581 307,586` prints each head as ASCII (hollow = light hole in the middle,
`fill` ~65 vs ~96 for filled). Calibrate on a head you know from the same sheet, then
trust it over the eyeballed spacing. Musical sense breaks the remaining ties: the bar must
sum to the meter, and a phrase usually mirrors its twin phrase.

**If a phrase repeats elsewhere in the same piece, use the repeat as a second opinion.**
homr runs each staff system independently, so two systems that print the *identical* music
(a repeated A section, a bridge that echoes the intro) routinely come back with different
rhythm mistakes even though the pitches agree — one instance may read a bar overfull, another
underfull, a third clean. Dump the measures for all the repeated instances side by side
(`music21`: list each measure's `.notesAndRests` with `.duration.quarterLength`) rather than
puzzling over one occurrence in isolation. Where they disagree, the reading that (a) sums to
the meter and (b) matches what the *other* instances agree on for that position is almost
always right — three garbled OMR passes rarely agree on the same wrong answer, but they
frequently agree on the right one once you strip out each instance's own one-off slip. This
also catches the common "long tied note + short turn figure" duration error: a whole note
tied into a run that homr reads a beat too long/short in one occurrence often reads correctly
(or with a *different*, complementary slip) in another, and combining the correct fragments
from each gives a bar that actually sums right — cross-check the result against the chord
tones before trusting it.

**A resolved pitch is a chord tone (or an obvious step/chromatic neighbor to one) far more
often than not.** Once you know the bar's chord (from the grid/labels, step 4), check
whether homr's pitch is the root/3rd/5th/7th of it — a `G#` under an `E7`, an `F` under a
`Gm`, an `A` and `C#` outlining an `A7` on the way up. This is a real, cheap sanity check,
not just theory-flavored reassurance: it independently confirmed both pitches *and* the
overall transposition on a Bb-instrument sheet (every resolved note landed on a chord tone
only after transposing down a major 2nd; a handful were off by a 4th before that). When a
pixel-level reading and homr's reading disagree and you can't re-measure cleanly (a ~600px
scan gives only ~5px per staff step — genuinely too coarse to resolve line-vs-space by eye
some of the time), the one that lands on a chord tone is the one to trust.

**Accidentals in a passage the scan shows plainly but the OMR rendered wrong** (bare F natural
after a G-major staff, F♯ restored later in the bar): the printed signs are the truth, not the
key signature — an F♮ then F♯ in a one-sharp staff gets a natural sign, then a sharp sign.

### 3. The MIDI  (if any)

```
$VP $SK/midi_parts.py song.mid                       # list parts
$VP $SK/midi_parts.py song.mid --part N --transpose -2  # dump one part by measure
```

- The lead is usually the part named/patched as a melody instrument (Trumpet,
  Clarinet, Voice, Lead...) with a moderate note count — not the busiest part.
- Find the transposition: match one unambiguous early bar of that part to the
  lead sheet (e.g. MIDI bar 2 `E5 G5` vs lead-sheet bar 1 `B4 A4` under B♭ ->
  the MIDI is a whole step + octave high, verify on a second bar).
- `--transpose -N` (semitones) to line it up with the lead sheet's key/octave.
- Then compare **bar by bar** against the OMR melody. The MIDI resolves OMR
  ambiguities and catches OMR errors. But when a MIDI bar is busy/syncopated or
  sits at the end of a phrase, it is an improvised fill — keep the lead sheet's
  plain notes, not the MIDI's.
- MIDI-only fallback: take the lead part, `part.transpose` to target key, then
  quantize each note to the nearest notated value and drop grace/ornament notes.

### 4. Chord symbols  (lead sheet only)

homr ignores chord text, so read it yourself:

```
$VP $SK/chord_map.py scan.png      # per system: barline x's + chord-text x-spans
```

Map each chord's x to the bar it sits above. Cross-check against the changes
implied by the melody (a `G#` under an `A7` etc.). Zoom in on anything unclear:

```
$VP $SK/zoom.py scan.png --system 2                 # labelled staff crop -> Read it
$VP $SK/zoom.py scan.png --system 2 --xfrac 0.3-0.6 # just that horizontal slice
```

Staff geometry for a treble render: bottom staff line = E4, each half-line-
spacing = one diatonic step. `zoom.py` draws and labels the pitch guide lines;
if they miss the real staff, pass `--grey`/`--fill`/`--spacing`.

**A boxed chord grid on the sheet (bars with `%`/ditto cells) beats the labels over the
staff.** One cell = one bar, `%` = same chord as the cell before, a diagonally split cell
= two chords, half a bar each. Crop and Read the grid, expand it to one chord per bar,
and use that. The labels above the staff are placed loosely (often over beat 3-4, not at
the bar line), so use them only to cross-check which bar a chord belongs to.

**Transposing-instrument sheets.** If the melody's chord labels don't match the grid /
the house key (e.g. staff labelled C, D7, G7 while the grid says Bb, C7, F7), the staff is
written for a B♭ instrument, a whole step up. Concert = written down a major 2nd, and
the repo's files are concert. In `K:Bbmaj` the mapping is: written C→`B`, D→`c`, E→`d`,
F→`e`, G→`f`, A→`G`, B→`A` (a natural, no sign needed); written accidentals:
C♯→`=B`, D♯→`^c`, G♯→`^F`, E♭→`_d`, B♭→`_A`, A♭→`_G`. Octaves shift down with the
letter (written C5 = concert B♭4). Do the whole conversion bar by bar with beats
summed, and keep a written-key note of each bar handy for the final compare.
A diminished 7th chord is symmetric (Cdim ≡ Adim ≡ E♭dim ≡ G♭dim), so a grid's `Gdim`
and the staff's `Cdim` can both be correct — keep the grid's spelling.

### 5. Write the ABC — house style

Start from `draft.abc` (step 2) when there is one: fill in `C:`, add chords, ties,
lyrics and the fixes from your eyeball pass. Otherwise write it fresh. Either way, look
at 2-3 existing files first (`static/songs/when_youre_smiling.abc`,
`fly_me_to_the_moon.abc`, `bare_necessities.abc`) for house style.

- Header, in order: `X:1`, `T:Title`, `C:Composer(s) (year)`, then any of
  `F:youtube-url`, `R:style`, `N:performance note`, then `M:4/4`, `L:1/4`
  (`L:1/8` for busy tunes), `Q:1/2=NNN` if a tempo is on the sheet, `K:Bbmaj`.
- Chords inline in quotes right before their note: `"Bb"`, `"F7"`, `"Cm7"`,
  `"C7#5"`, `"N.C."`.
- Accidentals: `^`=sharp `_`=flat `=`=natural. In `K:Bbmaj`, bare `B` is B♭;
  write B natural as `=B`.
- Accidentals **persist to the end of the bar** in ABC for the same pitch, exactly as
  in print — so `^c c` is two C♯s. Write a natural explicitly (`^c =c`) if the second
  note really is natural. A note tied across a barline keeps its accidental, but the
  next same-letter note in the new bar does not (so `_d- | _d2 ... d` needs no `=`
  on the later `d` in bar 2 unless the key signature makes it flat).
- Ties `-` only between equal pitches; a note held over a barline is `F2- | F ...`.
- `P:A` / `P:B` part markers if the sheet has rehearsal letters and it helps (`P:Intro` for
  a labelled intro). Chords go at each *change*, not every bar — a `%` cell in the grid is
  just no chord written. **The first bar of every part always gets a chord** (`P:A`, `P:Intro`,
  a `|:` section start, ...), even when it is the same chord the previous part ended on — a
  part must be readable/playable on its own. For an intro with a pickup, that is the first
  *full* bar (the pickup itself needs none).
- **Repeats and endings.** `|:` … `:|` for repeat signs, and for 1st/2nd endings
  `… |[1 c4 z4 :|[2 c2 c2 c2 c2 ||` (see `basin_street.abc`, `all_the_girls.abc` for the
  older `|1 … :|2` spelling — both parse). A repeat that is **written out** on the sheet
  (two systems that are the same, as in Bugle Boy March's C section) is written out in the ABC
  too, not folded into a `|:` `:|`, unless the sheet itself marks it. A whole note tied into the
  first ending (`F8- |[1 F2 …`) can only tie once in ABC; if the sheet also ties it into the
  2nd ending, the tie is drawn only into the first — say so in the report.
- **Key changes mid-tune.** No song here uses an inline `[K:…]` (the Key stepper, chord
  analysis and comping all read the first `K:` only), so keep **one `K:`** — the key of the
  opening — and write the new key's accidentals out explicitly (`_E` for every E♭ in a
  B♭-major section of a `K:Fmaj` tune; remember the bar-persistence rule and put `=E` where
  the natural returns). Mention the key change in the report.
- Pickup bar: match the sheet — a real anacrusis is `F G A ||` before bar 1; a
  written-out "rest + pickup" full bar is `z F G A |`.
- **Fit as many bars per line as stay readable — aim for 8.** Each source line is one staff
  line on the site (the sheet engraves at a fixed 1000-wide staff and scales it; nothing is
  auto-wrapped), so 4-bar lines waste space and double the page length. Rules of thumb:
  - Lyric-free tunes: **8 bars per line**, even with 1/8-note runs (8 bars of eighths still
    reads fine). Only go lower when a bar is genuinely crammed (lots of 16ths, many chord
    symbols in one bar) or to keep a line break on a phrase boundary.
  - Tunes with `w:` lyrics: try 8 too — but look at the render: if syllables collide
    ("giveno-", "pieceof") fall back to 6, or to 4 if that is the natural phrase. Lyrics are
    the reason to go lower, not the notes.
  - Break lines at **part boundaries** (`P:` goes on its own line between two music lines, so
    a part never shares a line with the previous one) and otherwise **pair whole phrases**:
    group bars in 8s counted from the start of the part, so a line ends where a phrase ends.
    A part whose length is not a multiple of 8 ends on a shorter last line (a 36-bar part is
    four 8s + a 4) — do not squeeze the remainder onto the previous line.
  - A pickup/intro line, and lines with `[1 … :|[2 …` endings, may be short/long as the sheet
    dictates; the repeat sign stays at the bar where the sheet puts it.
  - **After the ABC is correct, do this pass explicitly**: join lines to reach the fewest
    lines that still render legibly, then re-render with `render_site.mjs` and Read it.
  - Join the `w:` lines of merged music lines into ONE `w:` line (a second `w:` line means a
    second verse, not a continuation).
- Last bar ends `|]`.
- Optional `w:` lyric line under a tune line (many files have them; add only if
  you have reliable lyrics). **Alignment:** one syllable per *note slot*; rests are
  skipped, but the **second note of a tie consumes a slot**, so put `_` there
  (`smi-ling, _` for `B2 B2- | B2`; confirmed against `when_youre_smiling.abc`).
  Count slots vs syllables per line before rendering — a miscount silently shifts
  every later word. Use `-` inside a word, `_` to hold, no `|` needed.
- Filename: lowercase, `_`-joined, short — `washington_and_lee.abc`.

### 6. Validate — do not skip

```
abc2midi out.abc -o /dev/null      # must be silent: no errors, no warnings
$VP $SK/render.py out.abc proof   # -> proof_1.png, proof_2.png ... (stitched, Read-sized)
npm run lint:abc                   # CI gate: abcjs parser warnings + every bar's length vs M:
$VP $SK/check_abc.py static/songs/<name>.abc --musicxml scan3.musicxml --interval M-2
```

`check_abc.py` compares your ABC's real note stream (abcjs flattener: accidentals, ties,
key and octave already resolved) against the OMR, bar by bar, and checks lyric syllable
counts against note slots. **Every line it reports should be something you changed on
purpose** — a tie you added shows as "absorbed into ties" (fine), a corrected pitch shows
as `PITCH` (confirm it was homr that was wrong, then move on), anything else is a slip.
Two known homr artefacts show up as noise: a misread bar length cascades within that
bar only, and a note tied across a barline loses its flat in the second bar
(`MISSING`/`PITCH` at the bar after the tie). Skip `--musicxml` for a MIDI-only or
from-scratch transcription — the lyrics check still runs.

**It only compares as far as the bar grids agree.** It aligns bars by number, so once a
sheet has 1st/2nd endings (the OMR counts the 2nd-ending bar as an extra bar) or a key
change the merged MusicXML mangles, every later bar is reported as a mismatch. Trust it up
to the first ending — on Bugle Boy March bars 1–20 came back clean — then, for the rest,
compare your ABC to `omr_staves.py`'s per-staff text by eye/diff and to the sheet via the
`proof_*.png` render. A wall of `MISSING`/`EXTRA` starting at one bar is this, not fifty slips.

`lint:abc` runs on every `static/songs/*.abc` in CI and fails on an overfull or
mid-tune underfull bar, so run it after saving into `static/songs/` (a bar-sum slip
you skipped in step 2 shows up here). It checks length, not pitch — the visual compare
below is still the only pitch check.

`render_site.mjs` is the layout check (`node $SK/render_site.mjs out.abc site.png --width 1100`,
then Read `site.png`): confirm the bars-per-line choice from step 5 — 8 bars across, chords
not colliding, lyrics legible, every part's first bar carrying a chord. It uses the same abcjs
options as the live sheet, so what you see is the on-site line count. Add `--browser
/path/to/chrome` if Playwright can't find a bundled browser on its own (see the Tools section
and the Playwright gotcha below).

Read the `proof_*.png` and compare bar by bar with the source scan: pitches,
accidentals, rhythm, chord placement. Fix every mismatch and re-render. Iterate
until it matches or the remaining differences are genuinely ambiguous in the
source.

### 7. Install & report

- Save to `static/songs/<name>.abc`.
- Add `Title,<name>.abc` to `static/songs/index_of_songs.txt`. Keep it roughly
  alphabetical (the site only buckets by first letter, so exact order is loose).
- Tell the user: what you used as primary source, and a short list of bars that
  are best-guesses (ambiguous scan, MIDI/OMR disagreement) so they can proof-play.

## Notes / gotchas

- The custom `omr` CLI in `tools/OMR/` is currently broken (no source, only
  `__pycache__`). Call `homr` directly and post-process with `music21` — that
  path works. See the `project-omr-tool` memory.
- homr may read flat/sharp glyphs from the chord chart or title area as note
  accidentals — always eyeball bar 1 and any bar whose accidental looks wrong.
- `mscore` needs `QT_QPA_PLATFORM=offscreen` in this headless environment; its
  PNG output can be huge (10k px) — downscale with PIL before Read.
- If homr misses the time signature, pass the meter through when parsing / when
  you rebar the flat note list.
- Invoking the venv Python by a relative `../../..` path prints a harmless
  `Unexpected value in sys.prefix` warning; run from the repo root with
  `VP=tools/OMR/.venv/bin/python3` as at the top to avoid it.
- `zoom.py`/`crop_systems.py`/`chord_map.py` auto-detect staff systems by finding rows of
  near-full-width dark pixels (`_staff.py`). A boxed chord grid's own table borders are the
  same kind of row, and if the grid sits within 20px of the first real staff (common — there's
  often little gap between the grid and the melody underneath it), one border line merges into
  that staff's group and becomes its (wrong) top line, throwing every guide-line/pitch label on
  that system off by however far the border sits from the real staff. `_staff.py` now picks the
  5-line window with the most uniform spacing out of any oversized group to filter this out; if
  a guide overlay still looks shifted relative to the printed staff lines near the top of a
  scan, suspect this before suspecting your own pitch reading.
- `render_site.mjs` resolves the Playwright package from the current working directory
  first, then `~/.npm/_npx/*/node_modules`, and looks for a browser under
  `~/.cache/ms-playwright` by default; a fresh/remote environment can have neither the
  package nor a browser there, which throws `playwright not found`. Don't `playwright
  install` (redundant download, can fail/be slow); instead `cd` into a scratch dir,
  `npm install playwright --no-save`, and invoke the script from that same scratch dir
  (so the cwd lookup finds the package) with `--browser /path/to/chrome` pointing at
  the environment's pre-installed browser — see the Tools section above. The script
  forwards `--browser` straight to `chromium.launch({ executablePath })`; no source
  edit is needed.
- **In the report, list the guesses you actually made**: ambiguous rhythms (and how you
  settled them), accidentals the scan didn't show (e.g. a natural 6th over a minor chord),
  ties ABC can't draw, a key change written out as accidentals, and chord cells taken from the
  grid rather than the labels above the staff.

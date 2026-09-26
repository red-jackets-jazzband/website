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

If any of `abc2midi`/`midi2abc`, `pdftoppm`, or `mscore` are missing (`which` them first — a
from-scratch remote environment can have none of the three): `sudo apt-get install -y abcmidi
poppler-utils musescore3` installs all of them; then `sudo ln -sf /usr/bin/mscore3 /usr/bin/mscore`
since that package ships the binary as `mscore3`. See the gotchas below for two `render.py` bugs
(transparent PNG background, auto-picked bass clef) that only surface once `mscore` is actually
installed and running for the first time.

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

**When the scan is ~600px or smaller, expect OMR to fail on most staves — go straight to
reading by eye.** On Original Dixieland One-Step (a 596x842 grab, 7 staff systems) `omr_staves.py`
flagged rhythm errors on most staves (bars 3-3.5 beats long, one staff at homr distance 0.48,
syncopated bars read as `z5 e2 c`), and its per-staff bar counts were off (9 bars for an 8-bar
staff). The fast path that worked, twice now (Original Dixieland One-Step; When You Wore a
Tulip, where OMR wasn't even attempted — a clean 4-bars-per-system quarter/half melody
read faster and more reliably by eye): skip `omr_staves.py` (at most one look at its
stderr), and cut every system into
left/right halves at 5x with `crop_systems.py` (it auto-finds every staff system; it needs
numpy, so run it with `$VP` — the system `python3` may not have it):

```
$VP $SK/crop_systems.py scan.png --out L --scale 5 --xrange 0-0.55   # left halves  L/sys1.png ...
$VP $SK/crop_systems.py scan.png --out R --scale 5 --xrange 0.45-1   # right halves R/sys1.png ...
```

The 10% overlap means no bar is split; Read `L/sysN.png` then `R/sysN.png` per system (a
note that shows up at the right edge of L and the left edge of R is the same note — don't
count it twice). Per bar, in this order: (1) the bar's *stems* (up/down), *flags* and
*beams* — not the notehead fill, which is unreliable at this resolution (every head looks
hollow, though on a clean 5x crop filled vs hollow is usually readable too); (2) the total
has to be 4 beats; (3) chord-tone check against the grid chord.
**Read pitch by pixel position, not by impression:** in each crop, note the y of the five
lines (bottom = E4 in treble), then a head at y sits `(y_bottom - y) / (line_gap / 2)`
steps above E4 — a head between two lines is a space note, on a line is a line note. The
crops are numbered/scaled the same, so you can do this from the pixel coordinates in what
you see rather than guessing "second space or third line".
**Use the lyrics to count notes per bar** when the sheet has them: syllables sit directly
under their notes, so "You made life" over a bar means 3 heads, "big ___ red" means a held
syllable across 3 heads (the underscore extender under a following note is a `_` slot in
`w:`, and so is the second note of a tie). It catches a dropped/duplicated head faster than
re-reading the staff, and doubles as the `w:` alignment check.
For a mixed "eighth + quarter + eighth + tied half" or "half + eighth rest + quarter + eighth"
bar, the note with the visible flag hook on its stem is the short one; the two candidate
readings both sum to the meter, so only the flag tells them apart (zoom ~14x on just that
bar).

**Third time this by-eye path was used (Shine, 32 bars, 8 systems): the whole job was 16 crop
Reads + one write, no OMR at all.** What made it right first time, so repeat it:
- Read L+R for one system, write its 4 bars immediately in *written* pitches, sum each to 4,
  and convert to concert straight away using the table in step 4 — don't batch all systems first.
- **Spot twin systems first.** Systems 1, 2 and 5 were the same music apart from the last bar
  (`c2 c c` vs `c c =B _B`). Once one is read, only the *differences* need a look, but still
  Read every twin's last bar — that is exactly where they diverge.
- Ties seen in this style: whole → quarter across the bar line (`B4- | B B c d`), dotted half →
  half (`B3- | B2 B B`), whole → dotted half + quarter rest at the very end (`e4- | e3 z |]`).
  Each shows as a slur arc crossing the bar line.
- A beamed **dotted eighth + sixteenth** is `d3/4c/4` (with `L:1/4`), glued with no space so it
  beams as one group. A flagged eighth with no partner beam is a single eighth
  (`d/ c A F3/2`) — don't pair it with its neighbour.
- Every bar summed to 4 on the first read and `lint:abc` had nothing to say — the real risk
  was pitch and accidentals (see the cross-bar gotcha in step 4), not length.
- Register in `index_of_songs.txt` just before any longer title with the same prefix
  (`Shine,shine.abc` goes above `Shine on me,...`).

**Fourth time this by-eye path was used (I'm Blue and Lonesome, 24 bars, 6 systems, another
~600px GIF, boxed grid + Bb-instrument staff): naked-eye line-vs-space judgment on a plain
high-scale crop is *not* reliable, even at scale 16-20, and the whole piece had to be redone
after the user caught a wrong starting note.** The first pass read a beamed note as sitting on
a staff line by eye, unaided; it actually sat in the space one step above. That single misread
propagated, because later notes were judged by "looks the same height as the bar 1 note" rather
than against the staff itself — a whole song's worth of notes inherited one bad reference point.
Worse, re-checking by eye a second time (still unaided) produced a *third* different answer for
the same note before the real fix was found. Three different guesses from the same eyeballing
method is the tell that eyeballing itself is the problem here, not the specific crop.
**What actually settled it, and should be step zero for every pitch from now on, not a fallback:**
draw the guide lines *onto* the crop instead of holding them in your head — `zoom.py` already
does exactly this (red = staff lines, blue = spaces, labelled), but its output was part of the
problem: it drew the guide lines on the image *before* cropping/scaling, then resized with
LANCZOS, so both the guide lines and the notation got smoothed together and a note's edge
against a line was genuinely blurry at the exact boundary that decides line-vs-space. **This was
a real bug, now fixed** — `zoom.py` resizes with `Image.NEAREST` instead, so lines and noteheads
stay crisp at any scale and a note's centre unambiguously sits on a line or between two. Use
`zoom.py scan.png --system N --xfrac lo-hi` narrowed to a handful of notes (not a whole system)
as the actual step zero for every pitch, not a fallback after eyeballing — re-run it on any
note you're about to commit without having looked at it through guide lines. Treat a plain
`crop_systems.py` crop with no drawn guide lines as insufficient evidence for a note whose
line-vs-space reading matters (i.e. every note that isn't unambiguously on the bottom line or in
ledger-line territory).
- Numpy row-scanning to find a notehead's y-centroid (average the dark-pixel rows in a narrow
  x-window) is a *useful cross-check once the x-window is right*, not a first resort and not
  a substitute for the guide-line crop. It's easy to mistarget the x-range entirely (a
  coordinate slip silently scanned the wrong note, or scanned a stem/ledger line with no
  notehead in the window at all and printed nothing, which looks like "no data" rather than an
  error) — always sanity-check the found blob's row-span against a *visual* crop of the same
  x,y box before trusting the computed centre.
- A small glyph before a note can be a flat sign or an eighth rest — they look near-identical at
  crop scale ~12 (both a small hooked stroke). One was mis-read as a flat at scale 12 and turned
  out to be a rest at scale 20. Don't commit an accidental from a crop scaled below ~16; re-crop
  tighter on that one glyph first.
- The chord-tone check (does the note match the chord printed above it?) is a good *consistency*
  check after a guide-line reading, and a strong tie-breaker between two close candidates, but
  don't let a plausible chord-tone story substitute for actually drawing the guide lines — a
  wrong note a step away from the right one is very often *also* a plausible chord tone (a 6th
  reads as fine as a 5th), so this check alone did not catch the original error here.
- Systems 1, 2 and 6 were melodically identical (same lyric-line rhythm) apart from one chord
  label in the final bar — worth spotting before transcribing note-by-note, the same way step 5's
  "spot twin systems" already recommends. But once one instance turns out to need a correction,
  re-verify *every* twin instance too, don't just propagate the fix by assumption — that's exactly
  the kind of unverified propagation that let the original error spread through this whole piece.

**If you draw your own pitch guide lines instead of calling `zoom.py` directly (e.g. to
overlay several hand-picked x/y crops from one Python session), it is very easy to get the
line-to-pitch mapping off by exactly one staff position** — `zoom.py`'s own formula is correct,
but a hand-rolled version of it produced guide lines that *looked* right (evenly spaced,
sensible labels) while every line was shifted one staff position from the real one, and every
pitch read off it came out one step wrong, consistently, until a numeric check caught it.
The fix that actually catches this: before trusting any hand-drawn guide overlay, sample the
image directly for the real staff-line rows (`np.array(Image.open(...).convert('L')) < 100`,
then find the y's that are dark across a wide, note-free x-range) and confirm your guide's
"line" y's land exactly on them — don't just eyeball that the spacing looks even. Prefer
calling `zoom.py scan.png --system N [--xfrac lo-hi]` itself over reimplementing its guide
math, precisely because it already got this right; only fall back to custom overlay code
when you need something `zoom.py`'s flags can't do (e.g. annotating one specific system by
its known staff-top y rather than by system index), and pressure-test that code the same way.

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

**A clean, computer-typeset PDF (exported from notation software, not a photo/scan of
paper) is a different case from everything else in this section and homr handles it very
well** — on a 300dpi PDF-to-PNG render of a "Voice" lead sheet (Do You Know What It Means
To Miss New Orleans), homr's pitches/rhythms matched a pixel-level manual re-check on
every bar but one, and that one miss (an eighth read where the source had a quarter) was
caught by cross-referencing the identical phrase repeated three times elsewhere in the
piece — the exact technique the "use the repeat as a second opinion" note below already
recommends. Don't assume a clean render needs the by-eye fallback path just because it's
still an image; try `omr_to_abc.py` first and reserve heavy pixel work for what it flags.

**Don't hand-count bars by splitting the draft's `|`-joined text yourself — query music21
per measure instead, directly against the `.musicxml`, once `omr_dump.py`/`homr` has
written it.** `omr_to_abc.py`'s own line-wrapping (`--bars-per-line`) and its pickup
handling make it easy to miscount which line/token corresponds to which real bar number by
one or more — on this tune, hand-counting produced a bar that looked identical to a much
*later* bar in the piece (same token shape, wrong bar), and the mistake wasn't caught until
a tie cross-check (next paragraph) landed on a pitch the hand-count said shouldn't be there.
Querying measures directly sidesteps this entirely and also surfaces key-signature changes
for free:
```python
import music21 as m21
s = m21.converter.parse('scan.musicxml')
for m in s.parts[0].getElementsByClass('Measure'):
    ks = m.getElementsByClass('KeySignature')
    if ks: print('measure', m.number, 'KEY CHANGE sharps=', ks[0].sharps)
    for n in m.notesAndRests:
        nm = n.nameWithOctave if not n.isRest else 'rest'
        print(' ', nm, n.duration.quarterLength)
```
Trust `m.number` as the ground truth for "which bar is this", not a position you counted
by eye in the draft text.

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

**"Sums to the meter" is necessary, not sufficient — don't stop there.** On Petit Fleur, the
fix above (patched together from 3 readings of the same recurring cell) produced a bar that
summed to 4/4 and passed `lint:abc`, but was still wrong: the real printed rhythm was a tied
note + 2 straight eighths + an explicit **quarter-note triplet** (`(3`, 3-in-the-time-of-2),
not 4 plain eighths + a closing quarter — two different rhythms that happen to have the same
total length and, in this case, even the same note count. `npm run lint:abc` only checks
duration sums; it cannot tell these apart, and neither can cross-instance agreement on a
wrong-but-consistent reading. Two things would have caught it sooner: (1) homr's own stderr/
log lines "Removing tuplets from measure N" name the *specific* bars it detected a tuplet in
before flattening it — a bar on that list that's still over/underfull after your fix is a
strong hint the honest fix is putting a real `(3` triplet back, not redistributing note
values until the arithmetic works; (2) look for the triplet bracket itself in the source —
a small `3` over a slur/bracket above 3 notes — before finalizing any bar you had to
reconstruct this way, the same way you'd check for a tie mark rather than just infer one.

**An underfull bar isn't always a triplet — check what note is actually missing duration.**
On Bogalusa Strut, `omr_to_abc.py` flagged 9 bars all short by exactly 3.5 vs 4 beats, and
homr's log listed the same bar numbers under "Removing tuplets" — the same signature as the
Petit Fleur triplet case above. Here it was a different, simpler bug: every flagged bar ends
in an unbeamed note with a plain stem and no flag (a quarter note) that homr's flattener had
read as another eighth in the beamed run before it. Zooming on just the bar's *last* notehead
(does its stem carry a flag / is it under the beam, or does the beam stop one note earlier?)
settled it in every case, and adding one beat back to that one note — no triplet, no pitch
change — fixed all 9 bars at once; `check_abc.py --musicxml ... ` then reported exactly those
9 bars as the only duration diffs from the raw OMR, confirming nothing else moved. The lesson
generalizes from Petit Fleur's: "sums to the meter" tells you a fix is *plausible*, not which
fix is *right* — triplet and misread-last-note both produce a 0.5-beat shortfall, and the scan
(a beam ending, a flag, a bracketed `3`) is what tells them apart, not the arithmetic.

**A tie can be missing from `omr_to_abc.py`'s own "possible ties" list.** That heuristic only
flags a same-pitch pair that lands adjacent in its *own* bar-sum reading; once a bar's last
note has been corrected (per above), a real tie between two notes that are no longer where the
heuristic expected them won't be (re-)flagged. On this tune, two of the four confirmed ties
(bar 10 and bar 18's tied repeated eighth mid-run) turned up only by re-zooming each corrected
bar's source image directly, not from the tool's own tie-candidate list — treat that list as a
floor, not a ceiling, especially on any bar you've already hand-corrected.

**homr's musicxml can carry real ties as `<slur>` elements instead of `<tie>` elements —
check for both, not just `n.tie`.** The "every tie is dropped" framing above is the common
case, but on a clean typeset PDF homr's TrOmr stage emitted explicit `slurStart`/`slurStop`
markers that music21 exposes as `Slur` spanners (`n.getSpannerSites('Slur')`), while
`n.tie` stayed `None` for all of them — a plain "does this note have a tie" check misses
these entirely. A `Slur` spanner between two notes of the **same pitch** is, for every
purpose that matters here, a tie (write it as one in the ABC); a `Slur` between two
*different* pitches is an ordinary phrase mark and isn't written as anything in plain ABC.
This cross-check (`getSpannerSites` + same-pitch filter) found four real ties across the
piece, including one 3-note tie chain spanning a barline that the "possible ties" heuristic
above did flag, confirming the same spot two ways. Filter on each spanner's own two endpoint
notes, not just "this note has a Slur" — a phrase slur touches notes too, and printing every
slurred note without comparing pitches will happily mislabel one as a tie:
```python
seen = set()
for sl in s.parts[0].getElementsByClass('Slur'):
    a, b = sl.getSpannedElements()
    if id(sl) in seen or a.isRest or b.isRest:
        continue
    seen.add(id(sl))
    tag = 'TIE' if a.pitch == b.pitch else 'phrase slur (not a tie)'
    print(tag, a.nameWithOctave, '->', b.nameWithOctave)
```
Two same-pitch notes joined this way don't split lyric duty evenly either: the sung
syllable goes on the **first** (earlier) note of the pair, and the second — the arrival —
gets the lyric's `_` continuation slot, regardless of which of the two is the longer note
(a short pickup note tying into a long held note is common, and it's still the short one
that carries the word).

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

**`chord_map.py`'s barline list is a heuristic (0.85 of the staff band's height, at
`--grey 200`) and can pick up a dense cluster of note stems as a false barline, or miss
a real one** — its own docstring already says to trust the chord x's more than the exact
barline list, but if you need real barline x's (to know exactly which notes are in which
bar, not just which chord), a stricter column scan against the true 5-line staff band is
more reliable: a genuine barline is dark for nearly the *entire* staff height, not 85% of
a padded band, so require a column to be dark at ~95%+ of `(staff_bottom - staff_top)` with
no padding. This mattered on a bar where the padded heuristic returned two barlines 4px
apart (a stem coincidentally aligned with the real barline) and the tighter scan cleanly
returned one.

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

**Lead sheets with a boxed chord grid on top are a
common source here, and the three 596x842 GIF grabs so far (Original Dixieland One-Step, When
You Wore a Tulip, Shine) shared this shape** — expect it and skip the discovery: title + "Words by … music by … in YYYY" credit line (that's the `C:` line:
`C:Composer and Lyricist (year)`); an 8-cell-per-row chord grid in the **concert** key (Bb);
the melody staff written for a **B♭ instrument in C** (so it needs the M2-down conversion
below), with the on-staff chord labels the same chords a major 2nd higher; 4 bars per staff
system (so N grid rows = 2N systems), a first system that may start with a pickup and a
double bar (`F||`) or none at all (Shine opens on a full-bar whole note); lyrics under the staff
*sometimes* (Shine has none — then no `w:` lines, don't go looking for them); no `Q:`/tempo/style
marking (leave `R:`/`Q:` out rather than invent one); no rehearsal letters either, so no `P:`
lines (Shine is a plain 32-bar tune, 8 bars/line = 4 lines). The concert key isn't always Bb:
Shine's grid is Eb (`Eb Bb7 G7 Cm F7 Ab Abm ...`) over a written-F, one-flat staff. Check the count once: grid cells = staff bars (32 = 8 systems
of 4), and the chord under each staff bar's label equals the grid cell at the same index.

**Transposing-instrument sheets.** If the melody's chord labels don't match the grid /
the house key (e.g. staff labelled C, D7, G7 while the grid says Bb, C7, F7), the staff is
written for a B♭ instrument, a whole step up. Concert = written down a major 2nd, and
the repo's files are concert. For a written-C staff into `K:Bbmaj`, the mapping (written
note, treble staff → ABC) is:

| written | D4 | E4 | F4 | G4 | A4 | B4 | C5 | D5 | E5 | F5 | G5 | A5 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| concert ABC | `C` | `D` | `E` | `F` | `G` | `A` | `B` | `c` | `d` | `e` | `f` | `g` |

(bare `B`/`E` are B♭/E♭ from the key signature — no sign needed; the octave shifts down with
the letter, so written C5 = concert B♭4). Written accidentals: C♯→`=B`, **F♯→`=E`**,
D♯→`^c`, G♯→`^F`, E♭→`_d`, B♭→`_A`, A♭→`_G`. Common chromatic figures on a lead sheet:
a written A♭ next to a G (over the tonic 4 chord) becomes concert `_G`, a written E♭
(`e2 _e` over C) becomes `d2 _d`, a written F♯ leading into G is concert `=E` — all of
them are the same ♭/♮ shift, and abcjs shows the natural sign for `=E`/`=B` on the site. Do the whole conversion bar by bar with beats
summed, and keep a written-key note of each bar handy for the final compare.

**Other concert keys: derive the table, don't copy it.** For a written-F (one flat) staff into
`K:Ebmaj` (Shine) the same M2-down shift gives: written D4 `C`, E4 `D`, F4 `E`, G4 `F`, A4 `G`,
**B♭4 `A`** (bare — A♭ is in the signature), B♮4 `=A`, C5 `B`, D5 `c`, E5 `d`, F5 `e`, G5 `f`,
A5 `g`. Written accidentals: C♯→`=B`, F♯→`=E`, G♯→`^F`, B♮→`=A`. General rule: convert the
letter (down a 2nd), then compare against the *concert* key signature to see whether a sign is
needed — never carry the written sign across.

**Cross-bar gotcha when transposing chromatic passes:** a written natural/sharp and the
written plain note that follows it in the same bar turn into *two different concert
spellings of the same letter*, so the second needs its own explicit sign or abcjs (and
`abc2midi`) will keep the first one's accidental. Shine bar 22: written `C♯ A B♮ C` →
`=B G =A/ _B3/2` (the closing `_B` restores B♭ after `=B`); bar 4 of the repeat: written
`B♮ B♭` → `=A _A`. `lint:abc`/`abc2midi` can't catch this (bar length is unaffected, and it
parses cleanly) — the only checks are the chord-tone test (a stray `=B` under a Cm) and
eyeballing the render for a missing/unexpected natural sign. Do this pass explicitly on every
bar that has a sign in the source.
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
- A degree sign for a diminished chord on the sheet (`A°`) is not a valid ABC/abc2midi
  chord name — `abc2midi` fails the whole file with `Unrecognized chord name "°"`. Respell
  it `"Adim"` (matches the existing `"Fdim"` in `bugle_boy_march.abc`); same pitches, same
  sound, and it's what the house style already uses elsewhere. A rootless `"G5"`-style
  power-chord symbol (root + 5th, no 3rd) is fine as printed — `abc2midi` and the live
  site's abcjs both accept it — but if you proof a chord grid through `render.py`
  (music21/MuseScore) rather than `render_site.mjs`, expect music21's chord-symbol parser
  to print it back as something like `Gnoneadd5`; that's a quirk of that one proofing tool
  reinterpreting the symbol, not a mistake in the ABC — check `"G5"`-style symbols against
  `render_site.mjs`'s abcjs rendering (what the site actually uses), not `render.py`'s.
- Accidentals: `^`=sharp `_`=flat `=`=natural. In `K:Bbmaj`, bare `B` is B♭;
  write B natural as `=B`.
- Accidentals **persist to the end of the bar** in ABC for the same pitch, exactly as
  in print — so `^c c` is two C♯s. Write a natural explicitly (`^c =c`) if the second
  note really is natural. A note tied across a barline keeps its accidental, but the
  next same-letter note in the new bar does not (so `_d- | _d2 ... d` needs no `=`
  on the later `d` in bar 2 unless the key signature makes it flat).
- Ties `-` only between equal pitches; a note held over a barline is `F2- | F ...`.
- **Beam grouping for eighth notes (and shorter).** ABC beams a run of notes together only
  when they're written with **no whitespace** between them — `DCDF` renders as one beamed
  group of 4, `D C D F` renders as four separate flagged notes, even though the pitches and
  durations are identical. A rest or a note of a quarter or longer always breaks a beam
  (`z BAB` — the rest is its own token, `BAB` glues into one group of 3), and a tie (`F-`)
  never breaks one — glue straight through it (`DCDF-FD` if the beam is meant to keep going
  past the tied note). Default to matching the source's own engraved beam groups (zoom in on
  the beam bars themselves, not just the noteheads), which in practice almost always follow
  standard engraving conventions: **max 4 eighths per beamed group, a group of exactly 4 only
  at the very start or very end of the bar, and a beam never spans across the bar's halfway
  point** (beat 2 into beat 3, in 4/4) — a bar's eighth notes typically split into two halves
  (each up to a 4-group, or smaller groups down to the beat) rather than one continuous run
  covering the whole bar. Getting this wrong doesn't fail `lint:abc` or `abc2midi` (durations
  and pitches are unaffected — only the visual grouping is), so it's easy to miss without
  actually rendering and eyeballing the beams; verify with `render_site.mjs` (or `render.py`),
  not just `check_abc.py`, which doesn't check beaming at all.
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
- **Key changes mid-tune.** Inline `K:` fields **are supported** now (the Key stepper and
  instrument transposition shift every key signature uniformly, and chord analysis /
  Roman numerals track the `K:` in force per measure -- see `bugle_boy_march.abc`, which
  gives Part C its own `K:Bb`). So put the new key on its own `K:` line at the start of the
  section, right after that section's `P:` line (`P:B` then `K:Eb`), and write that section
  in the new key's signature -- **no** hand-spelled accidentals for the new key. Keep the
  header `K:` as the key of the opening. Don't write an inline `[K:...]` mid-bar. Notes:
  abcjs engraves the new key signature at the *end of the previous staff line* (the line
  break before the `K:`), which is normal. When the modulation happens across a sheet
  written for a transposing instrument, **each section can have its own written key too**
  (written C / F / Bb for concert Bb / Eb / Ab): convert every section with the same
  M2 offset, but against *its own* signature -- a written accidental is always relative to *that section's* written signature, and the
  concert accidental relative to the new concert signature (written C♯ over a no-flat staff is
  `=B` in `K:Bb`; the same written C♯ over a two-flat staff is also `=B` in `K:Ab`, because
  B♭ is in that signature) -- re-derive each one per section, never copy spelling across. Where a tune re-uses a note across a bar-persistence boundary
  (a natural earlier in the bar, then the note's normal flatted form later), the restore
  must be written explicitly (`B=ABc B_AGF`). Mention the key changes in the report.
- **Breaks / stop-time marks.** A dashed line under a stretch of staff (and under the
  matching cells of a chord grid) marks *breaks*. Put `"^Break"` (an annotation, not a
  chord -- house precedent in `all_the_girls.abc`, `when_youre_smiling.abc`) beside the
  chord on the first bar of each dashed span, and list the spans in an `N:` line. Count the
  dashes' extent against the barlines to get exactly which bars they cover (the dashes
  under a staff are evenly spaced, several per bar -- match the span's start/end x to the
  barline x's, don't count dashes).
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
  every later word. Use `-` inside a word, `_` to hold, no `|` needed. A sheet's underscore
  **extender line** under a run of notes ("big ___ red", "rose, ______") is exactly the `_`
  slot: one `_` per extra note the syllable is held across (a tied note counts as one).
  **Test the 8-bars-per-line choice on the render, not on the arithmetic** — on When You Wore
  a Tulip (quarter/half-note melody, ~3 syllables a bar) 8 bars fit but ran syllables into
  each other on the dense lines ("thenheav-en blessedme") even though nothing overlapped
  numerically; 4 bars/line (the source sheet's own layout, one line per phrase) had none. Try
  8 first, and if the lyrics fuse anywhere fall straight back to 4 rather than a 6 that
  cuts across phrases.
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
- **A fresh/remote environment can be missing `abc2midi`/`midi2abc`, `pdftoppm`, and `mscore`
  entirely** (all absent on a Bogalusa Strut transcription run), not just the `tools/OMR/.venv`
  case already covered above. `apt-get install -y abcmidi poppler-utils musescore3` (sudo works
  in this sandbox) gets all three; MuseScore 3's binary is `mscore3`, not `mscore` — `ln -sf
  /usr/bin/mscore3 /usr/bin/mscore` once so `render.py` and this doc's own table need no edits.
- `render.py`'s mscore-PNG step needs two fixes on a from-scratch environment, both already
  applied in the script: (1) this MuseScore build exports **transparent-background PNGs**, so
  `Image.open(p).convert("RGB")` silently drops the alpha channel and keeps whatever's under
  it — black — turning the whole proof image solid black with no error; composite onto a white
  background first (`bg.paste(im, mask=im.split()[3])` when `im.mode == "RGBA"`). (2) music21's
  ABC→MusicXML conversion picks a clef automatically (its `bestClef` tessitura heuristic) when
  the ABC doesn't set one — which is always, since this repo's ABC files never specify a clef —
  and a low-tessitura tune like Bogalusa Strut can come out in **bass clef**, wildly displaced
  on ledger lines even though abcjs always renders these lead sheets in treble on the live site.
  Force `m21.clef.TrebleClef()` on every part before writing the MusicXML.
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

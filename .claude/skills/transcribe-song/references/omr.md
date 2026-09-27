# OMR: running homr and trusting its output

## Decide by cleanliness, not pixel count

**The deciding factor for whether homr is worth running is whether the source is clean
vector/computer-typeset art (crisp anti-aliased edges, straight lines, uniform stroke
width) — not how many pixels wide it is.** A 596x842 GIF exported from notation software
(the "jam"/iReal-Pro-style lead sheets common in this repo: boxed chord grid, melody
staff, lyrics) is just as OMR-friendly as a 300dpi PDF render, because the glyphs
themselves are pixel-perfect at any size — there's no scanner noise, no paper texture, no
skew. On one such 596x842 GIF ("Lou-Easy-An-I-A"), homr on a plain 3x upscale matched an
exhaustive manual pixel-by-pixel re-derivation of the same system exactly, note for note,
including two accidentals and a triplet of quarter/half durations — and did the whole
36-bar piece in under 10 seconds where the manual pass had taken a very long time on one
9-bar system alone.

This refines the older guidance below (a ~600px scan should go straight to reading by
eye): that guidance was written from cases that were **photographs or scans of printed
paper** — real paper grain, camera noise, slight skew — where even a clean-looking
600px image degrades under OMR. A born-digital image at the same pixel count doesn't have
that noise floor. **Look at the source before picking a strategy**: zoom into one staff
line at 4-8x. Soft/blurry edges, JPEG ringing, uneven line weight, visible paper
texture → expect OMR trouble, go to `references/by-eye.md`. Crisp, uniform, geometric
edges (even in a small GIF/PNG) → try homr first regardless of pixel count; it is far
cheaper than a manual pass and this session is evidence it can match or beat one.

If homr's output looks structurally implausible on a quick read (bar sums that can't be
fixed by any reasonable tie/tuplet, wildly inconsistent readings of a phrase that repeats
verbatim elsewhere in the piece), that's the signal to fall back to `references/by-eye.md`
for the affected passage — not the pixel count.

## Running it

Screen-grab scans are often ~600px wide. **Upscale 3x (LANCZOS) before homr** even when
you expect it to work well — it reads a 596px sheet fine that way, and this is the file
every command below runs against. Keep the un-upscaled `scan.png` too: crops and
`notehead.py` work on it, and its pixel coordinates are the ones to quote.

```
python3 -c "from PIL import Image; im=Image.open('scan.png').convert('RGB'); \
  im.resize((im.width*3, im.height*3), Image.LANCZOS).save('scan3.png')"

$VP $SK/omr_dump.py scan3.png       # runs homr, writes scan3.musicxml, dumps it
$VP $SK/omr_dump.py scan3.musicxml  # (re-dump an existing musicxml)
```

homr gives you: clef, key signature, bar count, and a per-measure note list.
homr does **not** give you: chord symbols, rehearsal marks, repeats/endings, or lyrics —
all of those you read yourself (see `references/abc-style.md`).

**Draft the ABC straight from the OMR** instead of transcribing by hand (single-key sheets
with nothing unusual; otherwise use the per-staff path below) — same `scan3.musicxml`
that `omr_dump.py` just produced:

```
$VP $SK/omr_to_abc.py scan3.musicxml --interval M-2 --key Bb --title "Name" > draft.abc
$VP $SK/crop_systems.py scan.png --out crops     # head.png (grid) + sys1.png ... (un-upscaled scan)
```

`--interval` is the music21 interval that turns the sheet's written pitch into the
repo's concert key (see the transposing-instrument note in `references/abc-style.md`;
omit for a concert sheet). The draft has pitches, octaves, accidentals, lengths and
barlines; stderr lists bars that don't sum to the meter and *possible ties*. The draft
has no chords, ties(sometimes), or lyrics yet — `omr_to_abc.py`'s tie list is a floor,
not a ceiling (see below).

Even after a clean homr run, **still do the verify-by-eye pass** in `references/abc-style.md`
step 6 and `references/validate.md` — homr not giving chords/lyrics/ties is not optional
to skip, and a single mis-read pitch is still possible even on a clean source (this is
exactly why cross-checking against a repeating phrase, or against the chord tones,
catches the rare miss — see below).

## homr's typical mistakes

- Octave-off on ascending quarter-note runs, invented chromatic passing tones, missed
  ties. Treat its output as a strong first draft, not gospel.
- **Every tie is dropped** in some runs (the musicxml has none — read them off the crops
  or check for `Slur` spanners, below); a later same-pitch note in the bar is written
  without the accidental that persists from earlier in the bar.
- `Found title: G7` etc. in its log — it OCRs chord text as a title. Ignore.

**homr's musicxml can carry real ties as `<slur>` elements instead of `<tie>` elements —
check for both, not just `n.tie`.** On a clean typeset PDF homr's TrOmr stage emitted
explicit `slurStart`/`slurStop` markers that music21 exposes as `Slur` spanners
(`n.getSpannerSites('Slur')`), while `n.tie` stayed `None` for all of them. A `Slur`
spanner between two notes of the **same pitch** is, for every purpose that matters here,
a tie; between two *different* pitches it's an ordinary phrase mark and isn't written as
anything in plain ABC:

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

Two same-pitch notes joined this way don't split lyric duty evenly: the sung syllable
goes on the **first** note of the pair, and the second gets the lyric's `_` continuation
slot, regardless of which of the two is the longer note.

## Where the merged MusicXML goes wrong (use the per-staff path instead)

Check these against your own read of the sheet; if any apply, switch to `omr_staves.py`:

- **One key signature for the whole sheet** — it uses the first staff's; a mid-sheet key
  change leaves every later note in the wrong key.
- **A treble staff read as bass clef** (`F4/0` in the log) — pitches come out two octaves
  and a sixth off, and the staff loses bars.
- **Endings and repeats** — a 2nd-ending bar is treated as an extra bar, often garbled.
- **Rests can be missing** from a staff's notes entirely.

```
$VP $SK/omr_staves.py scan3.png --interval M-2 --key F > staves.abc   # runs homr, saves scan3.homr.log
$VP $SK/omr_staves.py scan3.homr.log --interval M-2 --key F \
      --keysig 6:0,7:0,8:0,9:0 --clef 8:treble                        # re-run with per-staff fixes
```

Read its stderr: `distance > 0.5` means homr fell back to a poorer attempt for that
staff; a staff with fewer bars than its neighbours dropped one; "guessed leading rest"
bars are short because the log has no rests; and **"staves N and M are 86% alike"** is
the written-out-repeat detector — where two copies differ, one is misread, compare both
to the scan. When a bass-clef misread dropped bars, copy the identical twin staff instead
of trying to repair it.

## Cross-checks worth doing on every OMR draft

**Don't hand-count bars by splitting the draft's `|`-joined text — query music21 per
measure directly against the `.musicxml`.** Hand-counting can land on a bar that looks
identical to a much *later* bar (same token shape, wrong bar number):

```python
import music21 as m21
s = m21.converter.parse('scan3.musicxml')
for m in s.parts[0].getElementsByClass('Measure'):
    ks = m.getElementsByClass('KeySignature')
    if ks: print('measure', m.number, 'KEY CHANGE sharps=', ks[0].sharps)
    for n in m.notesAndRests:
        nm = n.nameWithOctave if not n.isRest else 'rest'
        print(' ', nm, n.duration.quarterLength)
```

**If a phrase repeats elsewhere in the piece, use the repeat as a second opinion.** homr
runs each staff system independently, so two systems that print *identical* music
routinely come back with different rhythm mistakes even though the pitches agree. Dump
the measures for all repeated instances side by side; where they disagree, the reading
that (a) sums to the meter and (b) matches what the *other* instances agree on is almost
always right.

**"Sums to the meter" is necessary, not sufficient.** A bar that sums correctly can still
have the wrong rhythm shape (e.g. 4 plain eighths + a quarter vs. a tied note + 2 eighths
+ an explicit quarter-note triplet `(3` — same total length, different rhythm). homr's own
stderr/log lines "Removing tuplets from measure N" name the bars it flattened a tuplet in
— a bar on that list that's still off after your fix is a hint to look for a real `(3`
bracket in the source rather than redistributing note values until the arithmetic works.

**An underfull bar isn't always a triplet — check what note is actually missing
duration.** A run of bars all short by the same fixed amount, all on homr's own
"Removing tuplets" list, can instead be a single unbeamed note at the end of a beamed
run that homr's flattener miscounted (read as an extra eighth instead of the quarter it
actually is) — zoom on just that note's stem/flag to tell the two apart.

**A resolved pitch is a chord tone (or an obvious step/chromatic neighbor to one) far
more often than not.** This is a real, independent check, not just theory-flavored
reassurance — it can catch both a wrong pitch *and* a wrong overall transposition
interval at once. But don't let a plausible chord-tone story substitute for an actual
measurement when you have one: a note a step away from the right one is often *also* a
plausible chord tone, so use this as a tie-breaker or a second opinion, not the sole
basis for overriding a directly-measured pixel centroid (see `references/by-eye.md`'s
note on this exact trap).

**Accidentals in a passage the scan shows plainly but the OMR rendered wrong**: the
printed signs are the truth, not the key signature.

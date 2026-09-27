# Reading a lead sheet by eye (when OMR isn't the right tool)

Read `references/omr.md` first — try homr whenever the source looks clean/vector, even
small. This file is for a genuine photo/scan (paper grain, skew, camera noise) where OMR
is expected to struggle, or for the specific bars where it demonstrably did.

## The core loop

Cut every system into left/right halves at 5x with `crop_systems.py` (it auto-finds
every staff system; it needs numpy, so run it with `$VP`):

```
$VP $SK/crop_systems.py scan.png --out L --scale 5 --xrange 0-0.55   # left halves  L/sys1.png ...
$VP $SK/crop_systems.py scan.png --out R --scale 5 --xrange 0.45-1   # right halves R/sys1.png ...
```

The 10% overlap means no bar is split. Per bar, in this order: (1) the bar's *stems*
(up/down), *flags* and *beams* — not the notehead fill, which is unreliable at low
resolution; (2) the total has to match the source's own time signature (most lead sheets
here are 4/4, but check the clef for the real `M:` and account for a pickup bar before
assuming 4 beats); (3) chord-tone check against whichever chord source you established as
authoritative in step 1 — the grid, *or* the melody's own inline labels if the two charts
turned out to be unrelated (see below).

**Draw pitch guide lines instead of eyeballing staff position — every time, not as a
fallback.** `zoom.py scan.png --system N [--xfrac lo-hi]` draws the 5 staff lines + the
space/ledger positions in color, labelled, at high scale, so a notehead's centre
unambiguously sits on a line or between two rather than being a judgment call. Its own
line-to-pitch formula is correct and its resize uses `Image.NEAREST` (not LANCZOS) so
lines and noteheads stay crisp at any scale — a note's edge against a line must not be
allowed to blur, since that exact boundary is what decides line-vs-space.

**If you draw your own guide-line overlay instead of calling `zoom.py`** (e.g. to
annotate a specific known staff-top y rather than by system index), it is very easy to
get the line-to-pitch mapping off by exactly one staff position — a hand-rolled version
can produce guide lines that *look* right (evenly spaced, sensible labels) while every
line is shifted one position from the real one, silently shifting every pitch you read
off it by one step. Before trusting any hand-drawn overlay, sample the image directly for
the real staff-line rows (`np.array(Image.open(...).convert('L')) < 100`, then find the
y's that are dark across a wide, note-free x-range) and confirm your guide's "line" y's
land exactly on them.

**Use the lyrics to count notes per bar** when the sheet has them: syllables sit directly
under their notes, so a miscounted or dropped head shows up as a lyric that no longer
lines up. A sheet's underscore extender line under a run of notes is exactly the `_` slot
in `w:` (one `_` per extra note the syllable is held across).

**Rhythm you can't settle by eye**: engraving software doesn't space notes in proportion
to their length, so gaps between heads prove nothing. Look at the head itself in the
*original* pixels — `notehead.py scan.png 270,581 289,581 307,586` prints each head as
ASCII (hollow = light hole in the middle). Calibrate on a head you know from the same
sheet, then trust it over the eyeballed spacing.

## Telling a barline from a note's own stem (a real, recurring trap)

**A half or quarter note sitting on or near the *top* staff line, with a normal-length
stem down, can span nearly the full 5-line staff height — indistinguishable at a glance
from a real barline, which also spans the full staff height uniformly.** This cost a
large amount of manual effort on one transcription: a strict "is this column dark for
~90%+ of the staff height" barline detector fired on several notes' own stems, made two
adjacent bars each look like they held only half their required beats, and the fix (both
bars actually merge into one correct 4-beat bar) was only found by checking adjacency.

**The test that actually distinguishes them**: a notehead is *wide* (a ring or filled
disk is at least 5-6px across at its widest row); a stem or a real barline is *narrow*
(2-3px) at every row, uniformly. So:

- A tall, narrow, uniform-width column with a **wide run touching it within 1-2px**
  (either right at its top, where the notehead ring is, or overlapping it) is that note's
  own stem — not a barline.
- A tall, narrow, uniform-width column with **no wide run anywhere near it** (a clean gap
  of at least half a notehead-width on both sides) is a real barline.

Use `$SK/probe_column.py scan.png --x 391 --top 238 --spacing 7` (or a small range) to
print the dark-run width at every row near a suspicious column — a genuine barline prints
a constant 2-3px width top to bottom with nothing wider nearby; a note's stem shows the
width jump to 6+ right where the ring is, then narrow again. Do this before trusting *any*
barline-position deduction that a bar's beat count depends on — it's cheap (no vision
tokens) and it is the single check that would have caught the mistake immediately instead
of after redoing the same two bars three different ways.

The same width test, applied directly, is also the fastest way to find a note's
*hollow vs filled* answer without guessing from a blurry crop: sample the row nearest
the ring's vertical centre — if the run there is noticeably *narrower* than the run at
the ring's top/bottom edge, it's hollow (half note); if the width is the same all the
way through, it's filled (quarter note or shorter).

## Case studies (what worked, in order of scan quality)

**A clean, computer-typeset PDF** (exported from notation software, not a photo/scan of
paper) is handled very well by homr — see `references/omr.md`. Don't assume a clean
render needs this by-eye path just because it's still an image; try OMR first and
reserve this path for what it actually flags, or for a genuine photo scan.

**When the scan is ~600px or smaller from a real photo/scan (not born-digital)**, expect
OMR to fail on most staves — go straight to the core loop above. Two tunes (Original
Dixieland One-Step, a 596x842 photo grab; When You Wore a Tulip) were read this way
reliably.

**Third time (Shine, 32 bars, 8 systems): the whole job was 16 crop Reads + one write, no
OMR at all.** What made it right first time:
- Read L+R for one system, write its bars immediately in *written* pitches, sum each to
  the source meter (4 beats for the 4/4 case, otherwise whatever `M:` the sheet actually
  uses), and convert to concert straight away — don't batch all systems first.
- **Spot twin systems first.** Repeated systems are usually identical apart from their
  very last bar — still Read every twin's last bar, that's exactly where they diverge.
- A beamed **dotted eighth + sixteenth** is `d3/4c/4` (with `L:1/4`), glued with no space
  so it beams as one group. A flagged eighth with no partner beam is a single eighth —
  don't pair it with its neighbour.

**Fourth time (I'm Blue and Lonesome, 24 bars, another ~600px photo grab): naked-eye
line-vs-space judgment on a plain crop is *not* reliable, even at high scale, and the
whole piece had to be redone after the user caught a wrong starting note.** A beamed note
was read as sitting on a staff line by eye, unaided; it actually sat in the space one step
above, and the error propagated because later notes were judged against that first bad
note rather than against the staff itself. Re-checking by eye a *second* time, still
unaided, produced a *third* different answer for the same note. Three different guesses
from the same eyeballing method is the tell that eyeballing itself is the problem, not the
specific crop — this is exactly what motivated drawing guide lines as step zero (above),
not a fallback after eyeballing already failed.
- A small glyph before a note can be a flat sign or an eighth rest — near-identical at
  low crop scale. Don't commit an accidental from a crop scaled below ~16x; re-crop
  tighter on that one glyph first.
- The chord-tone check is a good tie-breaker but not a substitute for a guide-line
  reading — a wrong note a step away from the right one is very often *also* a plausible
  chord tone.
- Once one instance of a repeated phrase needs a correction, re-verify *every* twin
  instance too, don't propagate the fix by assumption.

## Boxed chord grid vs. the melody's own inline chords — these can be two *different* charts

A lead sheet in this "jam"/iReal-Pro style typically has a boxed chord grid (one cell per
bar, `%` for repeat-previous) sitting above the melody staff. The house assumption has
been that this grid **is** the tune's own harmony, just given in a denser, separate
reference form, cross-checked against the sparser chord labels written directly over the
staff.

**That assumption can be wrong, and it's cheap to check before transcribing 30+ bars on
a false premise.** On one 1949 novelty tune, the grid had exactly 36 cells and the melody
also spanned 9 systems x 4 bars = 36 bars — a tempting match — but the grid's bar-1 chord
(G7) didn't match the melody staff's own first inline chord (A7, on the bar's *second*
note, with nothing at all written for beat 1). Every other bar told the same story: the
grid and the inline labels are unrelated progressions that merely happen to have the same
bar count. The grid was very likely a separate comping/turnaround chart for the rhythm
section, not the notated tune's own changes.

**Check this in the first two minutes, not after transcribing the whole piece**: read the
grid's first 2-3 chords and the melody staff's first 2-3 inline chords side by side. Same
chords at the same structural points → one source, cross-check freely per the existing
rule ("a boxed grid beats the labels above the staff"). Different chords, or the inline
labels simply don't start where the grid says they should → treat them as separate
charts: use the melody staff's own inline chords as the tune's real harmony (they're
already sparse-by-design — "chords go at each change" — so there's no need to borrow
density from the grid), and mention the separate grid to the user in your report rather
than silently discarding it or forcing an alignment that isn't there.

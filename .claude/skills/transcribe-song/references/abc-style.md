# Writing the ABC — house style

Start from `draft.abc` when there is one: fill in `C:`, add chords, ties, lyrics and the
fixes from your eyeball pass. Otherwise write it fresh. Either way, look at 2-3 existing
files first (`static/songs/when_youre_smiling.abc`, `fly_me_to_the_moon.abc`,
`bare_necessities.abc`) for house style.

## Header

In order: `X:1`, `T:Title`, `C:Composer(s) (year)`, then any of `F:youtube-url`,
`R:style`, `N:performance note`, then `M:` (read the source's own time signature off
the clef — most of this repo's lead sheets are `4/4`, but don't assume it; a 3/4 waltz
or a 2/4 march needs its own `M:` and every bar-sum check below scaled to match), `L:1/4`
(`L:1/8` for busy tunes), `Q:1/2=NNN` if a tempo is on the sheet, `K:Bbmaj`.

## Chords

Inline in quotes right before their note: `"Bb"`, `"F7"`, `"Cm7"`, `"C7#5"`, `"N.C."`.

A degree sign for a diminished chord on the sheet (`A°`) is not a valid ABC/abc2midi
chord name — respell it `"Adim"` (matches existing house files). A rootless `"G5"`-style
power-chord symbol is fine as printed; both `abc2midi` and the live site's abcjs accept
it, though `render.py` (music21/MuseScore) may reprint it oddly — check such symbols
against `render_site.mjs`'s rendering (what the site actually uses), not `render.py`'s.

**A sheet can carry two independent chord sources** — a boxed reference/comping grid
plus the melody's own sparser inline labels — that don't line up bar for bar even when
their total cell/bar counts happen to match. See `references/by-eye.md`'s section on
this; check the first few bars of each against each other before committing to using the
grid as the tune's per-bar harmony.

Chords go at each *change*, not every bar. **The first bar of every part always gets a
chord** (`P:A`, `P:Intro`, a `|:` section start, ...), even when it repeats the previous
part's last chord — a part must be readable/playable on its own. This rule is about
`P:`-marked part starts specifically; a through-composed tune with no `P:` marks doesn't
need an invented chord at bar 1 if the source genuinely has none there.

## Accidentals

`^`=sharp `_`=flat `=`=natural. In `K:Bbmaj`, bare `B` is B♭; write B natural as `=B`.

Accidentals **persist to the end of the bar** for the same pitch, exactly as in print —
`^c c` is two C♯s; write a natural explicitly (`^c =c`) if the second note is natural. A
note tied across a barline keeps its accidental, but the next same-letter note in the new
bar does not.

## Ties and beaming

Ties `-` only between equal pitches; a note held over a barline is `F2- | F ...`.

**Beam grouping for eighth notes (and shorter)**: ABC beams a run together only with **no
whitespace** between them — `DCDF` is one beamed group, `D C D F` is four separate
flagged notes, same pitches/durations. A rest or a note of a quarter or longer always
breaks a beam; a tie never breaks one. Default to matching the source's own engraved
beam groups: max 4 eighths per group, a group of exactly 4 only at the very start/end of
the bar, a beam never spans the bar's halfway point. Getting this wrong doesn't fail
`lint:abc` or `abc2midi` (only visual grouping is affected) — verify with
`render_site.mjs`, which doesn't check beaming either, by eye.

## Transposing-instrument sheets

If the melody's own written pitches don't match its chord labels / the house key (e.g.
staff labelled C, D7, G7 while the real harmony is Bb, C7, F7), the staff is written for
a B♭ instrument, a whole step up. Concert = written down a major 2nd:

| written | D4 | E4 | F4 | G4 | A4 | B4 | C5 | D5 | E5 | F5 | G5 | A5 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| concert ABC | `C` | `D` | `E` | `F` | `G` | `A` | `B` | `c` | `d` | `e` | `f` | `g` |

(bare `B`/`E` are B♭/E♭ from the key signature; the octave shifts down with the letter).
Written accidentals: C♯→`=B`, F♯→`=E`, D♯→`^C`, G♯→`^F`, E♭→`_D`, B♭→`_A`, A♭→`_G`.
(D♯4 and E♭4 sit in the same written octave as D4/E4 in the table above, so they take
the same uppercase case as `C`/`D` there — not the lowercase `c`/`d` used for the octave
above `C5`; mixing the two is an easy octave slip.)

**Derive the table for other concert keys, don't copy it** — the same M2-down shift,
compared against the *concert* key signature to see whether a sign is needed (never carry
the written sign across).

**Cross-bar gotcha**: a written natural/sharp and the plain note that follows it in the
same bar turn into *two different concert spellings of the same letter* — the second
needs its own explicit sign or abcjs/`abc2midi` will keep the first one's accidental.
`lint:abc`/`abc2midi` can't catch this; the only checks are the chord-tone test and
eyeballing the render for a missing/unexpected natural sign.

A diminished 7th chord is symmetric (Cdim ≡ Adim ≡ E♭dim ≡ G♭dim), so a grid's spelling
and the staff's spelling can both be "correct" — keep the grid's spelling.

## Key changes mid-tune

Inline `K:` fields are supported — put the new key on its own line at the start of the
section (right after that section's `P:` line), written in the new key's own signature,
no hand-spelled accidentals. Keep the header `K:` as the opening key. When the modulation
happens on a sheet written for a transposing instrument, each section can have its own
written key too — convert every section with the same M2 offset but against *its own*
signature; re-derive each section's accidental spelling, never copy across sections.

## Repeats, endings, pickups, breaks

`|:` … `:|` for repeat signs; 1st/2nd endings as `…|[1 c2 z2 :|[2 c c c c ||` (shown at the
default `L:1/4` — a half note + half rest for the first ending, four quarter notes for the
second, both summing to 4/4; scale the multipliers to whatever `L:` and `M:` the tune
actually uses). A
repeat that is **written out** on the sheet (two systems that are the same) is written
out in the ABC too, unless the sheet itself marks it with a repeat sign. A whole note
tied into the first ending can only tie once in ABC; if the sheet also ties it into the
2nd ending, tie only into the first and say so in the report.

A dashed line under a stretch of staff (and under matching chord-grid cells) marks
*breaks* — put `"^Break"` beside the chord on the first bar of each dashed span, and list
the spans in an `N:` line.

Pickup bar: match the sheet — a real anacrusis is `F G A ||` before bar 1; a written-out
"rest + pickup" full bar is `z F G A |`.

## Line layout

Fit as many bars per line as stay readable — aim for 8 for lyric-free tunes; for tunes
with `w:` lyrics try 8 too but check the render for colliding syllables and fall back to
6 or 4 if so. Break lines at part boundaries and otherwise pair whole phrases (group in
8s from the start of the part, ending where a phrase ends). Do the line-joining pass
*after* the ABC is otherwise correct, then re-render with `render_site.mjs` and Read it.
Join the `w:` lines of merged music lines into ONE `w:` line (a second `w:` line means a
second verse). Last bar ends `|]`.

## Lyrics (`w:` lines)

One syllable per *note slot*; rests are skipped, but the **second note of a tie consumes
a slot**, so put `_` there. Count slots vs syllables per line before rendering — a
miscount silently shifts every later word. A sheet's underscore extender ("big ___ red")
is exactly this `_` slot: one `_` per extra note the syllable is held across.

**Syllable-joining hyphens must have NO surrounding whitespace: `Lou-eas-y`, never
`Lou - eas - y`.** This is a real, easy-to-hit mistake, not a style nicety: `w:` parsing
splits on whitespace first, so a hyphen with a space on either side becomes its own
standalone token — a bare, invisible melisma-continuation syllable that silently consumes
one note slot by itself. On a real transcription, writing `"Lou - eas - y - an - i - a"`
(spaced hyphens, matching how the source *visually* prints the dashes) ate seven note
slots on `Lou`, `-`, `eas`, `-`, `y`, `-`, `an` and left the tied whole note and the
following rest with no lyric at all — the line just stopped short, with no error from
`lint:abc` (this is a rendering-only concern, not a parse error). The fix: write the
whole hyphen-joined run as one unbroken string (`Lou-eas-y-an-i-a`), and reserve an actual
space only for the `_` continuation token itself, which unlike a bare `-` is meant to be
its own space-separated slot (`"way I _ walk"`). **Whenever a line has more than one
hyphen, re-render with `render_site.mjs` and read the words back off the image** — this
is the only check that would have caught the above; `lint:abc` and `check_abc.py`'s
syllable-count check both look at slot *counts*, not at whether the wrong slots got the
wrong words.

Test the bars-per-line choice on the actual render, not on the arithmetic — a numerically
correct fit can still visually fuse two words together if the notes are short (quarters/
halves with few syllables per bar); when that happens, drop bars-per-line rather than
trying to fix it in the lyric text.

Filename: lowercase, `_`-joined, short — `washington_and_lee.abc`.

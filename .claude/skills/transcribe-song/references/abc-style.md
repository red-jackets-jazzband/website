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

**Aim for a chord symbol on the bar's downbeat or its exact midpoint** (beat 1 or beat 3 in
4/4) when the source's own harmonic rhythm is that simple — but this is house-style
guidance, not a blanket rule, and `lint:abc` only enforces the one shape of it that's
unambiguous: **a chord shouldn't sit on the first half of a tie when its own continuation
already lands on the beat.** That's almost always an eighth-note anticipation under the
melody, where the written chord sits a fraction before the harmony it actually belongs to
— attach it to the note that falls on the beat instead of the one that anticipates it.
When the note spanning that beat is a single sustained duration (no separate note already
starts there), split it into two tied notes of the same pitch at the boundary and move the
chord onto the second one — the tie means the audio is unchanged, only where the symbol
prints. Example (bar originally `"C"E G A "G5"B4 c`, with `G5` landing an eighth early):
`"C"EGAB-"G5"B3 c` — `B4` becomes `B-` tied to `B3`, and `G5` now sits on the note that
starts on beat 3.

**A chord landing cleanly on beat 2 or beat 4 is not an error** — a cadential approach
chord in the last beat before a repeat or resolution, a syncopated punch (a funk/Latin
groove routinely puts the harmony where the *rhythm* accents it, not where a swing chart
would), or a turnaround with more harmonic motion than a two-slot bar has room for (three
chords in one bar means one of them can't be on beat 1 or 3 no matter what) are all real,
common lead-sheet writing. `lint:abc` doesn't flag any of these, and don't tie-split or
overlay-hack a chord into the beat-1/3 grid just because it's there — that fabricates
rhythmic precision the source doesn't actually have. Move a chord only when it's genuinely
anticipating its own tied note, per the rule above.

Don't tie-split a note whose own duration is a clean, idiomatic value that just happens to
span the midpoint — a dotted quarter/half spanning beats 1-3 (or 2-4) of a 4/4 bar is
completely normal notation on its own, and breaking it into a tied pair only to satisfy the
beat-3 rule is worse than the problem it solves (this is *not* what the beam-grouping rule
below is about: that's a visual-clarity convention for beamed eighth runs, not a reason to
retie every long note that crosses the middle of the bar — a plain half/quarter note
crossing the midpoint with no chord change under it needs no tie at all). If a chord
genuinely changes under a note like that, the idiomatic ABC-native fix is a voice overlay
(`&`) carrying an invisible rest (`x`) at the midpoint, so the chord symbol has somewhere
to attach without disturbing the printed note: `C6 & x4 "Bb7"x2` keeps the dotted half
(`C6`, 3 beats) untouched in the main voice while the overlay's own invisible rests place
`"Bb7"` exactly on beat 3. The overlay is silent and produces no sound or visible mark —
`lint:abc`'s bar-length check already resets at each such marker, and it doesn't create a
new Mixer voice (`parseVoiceList` only looks at `V:` declarations), so this is safe to use
purely as annotation scaffolding.

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
breaks a beam; a tie never breaks one (so an eighth note tied into another eighth can
still beam with what comes before/after it, if there's no whitespace — see the `G7`
example bar below). Default to matching the source's own engraved beam groups: max 4
eighths per group, a group of exactly 4 only at the very start/end of the bar, a beam
never spans the bar's halfway point. `lint:abc` now enforces the max-4 and
never-spans-the-midpoint parts of this (skipped for a meter with an odd beat count, and
for any group containing a tuplet note); the "group of 4 only at the start/end" placement
rule is checked too. It still can't verify the *pitches/spacing* match the source's own
engraved groups, or catch a group that's under 4 but positioned oddly — verify those with
`render_site.mjs` by eye, same as before.

A beam group that would otherwise cross the bar's halfway point can usually be split the
same way an over-early chord is (see **Chords** above): tie the note straddling the
boundary into two, ending/starting exactly at the midpoint, and join the resulting eighth
on either side into its neighbors with no whitespace if that completes a clean group.
Example (bar originally `"D7"e c A "G7"e2 B e2`, with the `G7` chord — and the beam —
landing early): `"D7"ecAe- "G7"eB e2` — `e2` becomes `e-` tied to `e`, giving a 4-beam
group at the bar's start (`ecAe-`) and a 2-beam group starting exactly on beat 3
(`eB`), with the required space between them so the two groups don't merge into one run
that spans the midpoint.

## Key signature sanity check

**Before moving on from a tune, check that the `K:` field actually matches the tune's own
harmony** — a wrong key signature is easy to type (one letter off from what was intended)
and, unlike a wrong note, it doesn't necessarily break the parser or even sound obviously
wrong for every note, because a hand-written `=`/`^`/`_` on a given note always overrides
the key signature's own default for that note. Two independent tells, either one enough to
stop and re-check:

- **You're writing an explicit accidental on most/all occurrences of one or two specific
  letters, throughout the whole tune.** One or two hand-spelled accidentals are normal
  (a passing chromatic tone, a borrowed chord). Needing `=B` or `=E` on nearly *every* B or
  E in a tune with `K:Bbmaj` (which flats both by default) is a sign the key itself is
  wrong, not that the tune is unusually chromatic — the natural reading is simpler than
  the flatted one you keep cancelling.
- **The chord symbols don't sit comfortably in the stated key** — mostly-natural chords
  (`C`, `D7`, `G7`, `A7`, `B7`, `F`) over a key signature with two flats, or vice versa.
  A tune's chords are almost always diatonic to its key, or secondary dominants a 5th
  above a diatonic chord; if most of them need an accidental relative to the stated key,
  try the key a whole step either side and see if the chords suddenly read as plain I/IV/V
  and secondary dominants with no explanation needed.

If both tells point the same way, the `K:` field itself is wrong — fix that, not the
accidentals. Retyping the accidentals to match a wrong key just relocates the bug: any note
in the tune that *doesn't* carry an explicit override still silently takes the wrong key
signature's default, which is real, audible wrongness, not just visual clutter. This is
exactly what happened in `lou_easy_an_i_a.abc`: transcribed as `K:Bbmaj` with `=B`/`=E`
hand-spelled on nearly every B and E (needed because Bb major flats both), while its chords
— A7, D7, G7, C, B7, F, Adim, C7 — are all standard I/IV/V-and-secondary-dominant harmony in
C major, a whole step up. The giveaway wasn't just the accidental clutter: two spots (`"A7"`
over an unmarked `e`) had no override, so that note silently sounded as E♭ — clashing
against A7's own E natural (its plain 5th) rather than reinforcing it. Correcting `K:Bbmaj`
to `K:C` and dropping the now-redundant `=B`/`=E` signs fixed both the visual clutter and
those two real wrong notes in one change, with no note letters or durations touched.

This is a different failure from the transposing-instrument case below — there, the written
notes are deliberately a different pitch than concert and the fix is a systematic per-note
M2 shift; here, the notes were always meant to sound as literally written, and the fix is
choosing the right `K:` so they do by default instead of needing constant correction.

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

Pickup bar: a real anacrusis is written as just its notes — `F G A ||` — with **no rests
in front of it**; the first bar is simply short (`lint:abc` exempts a short first bar, and
`lint:abc`'s style check rejects a full first bar that starts with rests and ends on a
double or repeat bar line). Don't write the sheet's lead-in as a `z F G A |` rest + pickup
bar.

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

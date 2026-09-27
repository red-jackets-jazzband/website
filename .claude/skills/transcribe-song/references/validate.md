# Validate — do not skip

```
abc2midi out.abc -o /dev/null      # must be silent: no errors, no warnings
$VP $SK/render.py out.abc proof    # -> proof_1.png, proof_2.png ... (stitched, Read-sized)
npm run lint:abc                   # CI gate: abcjs parser warnings + every bar's length vs M:
$VP $SK/check_abc.py static/songs/<name>.abc --musicxml scan3.musicxml --interval M-2
```

`check_abc.py` compares your ABC's real note stream (abcjs flattener: accidentals, ties,
key and octave already resolved) against the OMR, bar by bar, and checks lyric syllable
*counts* against note slots — it does not check that the right word landed on the right
slot (a hyphen-spacing mistake, see `references/abc-style.md`, can pass this check while
still being wrong; only re-reading the rendered image catches that). **Every line it
reports should be something you changed on purpose** — a tie you added shows as "absorbed
into ties" (fine), a corrected pitch shows as `PITCH` (confirm it was homr that was wrong,
then move on), anything else is a slip. Skip `--musicxml` for a MIDI-only or from-scratch
transcription — the lyrics check still runs.

**It only compares as far as the bar grids agree.** Once a sheet has 1st/2nd endings or a
key change the merged MusicXML mangles, every later bar is reported as a mismatch — trust
it up to that point, then compare by eye/diff against `omr_staves.py`'s per-staff text and
the `proof_*.png` render. A wall of `MISSING`/`EXTRA` starting at one bar is this, not
fifty slips.

`lint:abc` runs on every `static/songs/*.abc` in CI and fails on an overfull or mid-tune
underfull bar. It checks length, not pitch, and it does not check `w:` alignment beyond
slot counts — the visual compare below is the pitch (and lyric-placement) check.

`render_site.mjs` is the layout check (`node $SK/render_site.mjs out.abc site.png --width
1100`, then Read `site.png`): confirm the bars-per-line choice, chords not colliding,
lyrics legible and correctly placed word-to-note, every part's first bar carrying a
chord. It uses the same abcjs options as the live sheet, so what you see is the on-site
line count. Add `--browser /path/to/chrome` if Playwright can't find a bundled browser
(see `references/setup.md`).

Read the `proof_*.png` and compare bar by bar with the source scan: pitches, accidentals,
rhythm, chord placement. Fix every mismatch and re-render. Iterate until it matches or
the remaining differences are genuinely ambiguous in the source.

## Install & report

- Save to `static/songs/<name>.abc`.
- Add `Title,<name>.abc` to `static/songs/index_of_songs.txt`, roughly alphabetical.
- **Check for a filename/title collision first** — a similarly-named or same-titled file
  may already exist for a *different* song (different composer, different melody); don't
  assume a match means duplicate work, read the existing file before overwriting or
  reusing its name.
- Tell the user: what you used as primary source, and a short list of bars that are
  best-guesses (ambiguous scan, MIDI/OMR disagreement) so they can proof-play. List the
  guesses you actually made: ambiguous rhythms (and how you settled them), accidentals
  the scan didn't show, ties ABC can't draw, a key change written out as accidentals,
  chord cells taken from a grid rather than inline labels — and mention a separate
  reference/comping chart on the sheet that you deliberately didn't fold into the melody's
  own chords (see `references/by-eye.md`).

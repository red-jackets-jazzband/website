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

## Tools (all already installed — do not pip install)

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

Do all scratch work in the session scratchpad dir, never in the repo tree.

## Procedure

### 1. Sort the inputs

Identify what was given: lead-sheet image(s), lead-sheet PDF, MIDI, or a mix.
- PDF -> PNG: `pdftoppm -png -r 300 in.pdf page` (or `$VP $SK/pdf_to_png.py in.pdf`). One PNG per page.
- Multi-page lead sheet: process each page, concatenate the measures in order.
- If **only** a MIDI is given, you still need the key — infer it from the MIDI or ask.

### 2. OMR the lead sheet  (if any image/PDF)

```
$VP $SK/omr_dump.py scan.png       # runs homr, writes scan.musicxml, dumps it
$VP $SK/omr_dump.py scan.musicxml  # (re-dump an existing musicxml)
```

homr gives you: clef, key signature, bar count, and a per-measure note list.
homr does **not** give you: chord symbols, rehearsal marks, repeats/endings.
homr's typical mistakes: octave-off on ascending quarter-note runs, invented
chromatic passing tones, missed ties. Treat its output as a strong first draft.

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

### 5. Write the ABC — house style

Study 2-3 existing files first (`static/songs/when_youre_smiling.abc`,
`fly_me_to_the_moon.abc`, `bare_necessities.abc`).

- Header, in order: `X:1`, `T:Title`, `C:Composer(s) (year)`, then any of
  `F:youtube-url`, `R:style`, `N:performance note`, then `M:4/4`, `L:1/4`
  (`L:1/8` for busy tunes), `Q:1/2=NNN` if a tempo is on the sheet, `K:Bbmaj`.
- Chords inline in quotes right before their note: `"Bb"`, `"F7"`, `"Cm7"`,
  `"C7#5"`, `"N.C."`.
- Accidentals: `^`=sharp `_`=flat `=`=natural. In `K:Bbmaj`, bare `B` is B♭;
  write B natural as `=B`.
- Ties `-` only between equal pitches; a note held over a barline is `F2- | F ...`.
- `P:A` / `P:B` part markers if the sheet has rehearsal letters and it helps.
- Pickup bar: match the sheet — a real anacrusis is `F G A ||` before bar 1; a
  written-out "rest + pickup" full bar is `z F G A |`.
- One source line per ~4 bars; last bar ends `|]`.
- Optional `w:` lyric line under a tune line (many files have them; add only if
  you have reliable lyrics).
- Filename: lowercase, `_`-joined, short — `washington_and_lee.abc`.

### 6. Validate — do not skip

```
abc2midi out.abc -o /dev/null      # must be silent: no errors, no warnings
$VP $SK/render.py out.abc proof   # -> proof_1.png, proof_2.png ... (stitched, Read-sized)
```

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

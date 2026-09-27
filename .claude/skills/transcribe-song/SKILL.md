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
fallback**, never copied verbatim (see `references/midi.md`).

This file is the short version — it covers the common path end to end. Each section
below points at a `references/*.md` file with the deep detail, war stories, and edge
cases; open one only when you actually hit that situation, not up front. Do all scratch
work in the session scratchpad dir, never in the repo tree.

## 0. Set up tools

```
VP=tools/OMR/.venv/bin/python3            # venv Python — run scripts/*.py with this
SK=.claude/skills/transcribe-song/scripts
```

Check `which abc2midi midi2abc pdftoppm mscore` and whether `tools/OMR/.venv` exists —
if anything's missing (common on a fresh remote environment), see
`references/setup.md` before going further.

## 1. Sort the inputs

- PDF → PNG: `pdftoppm -png -r 300 in.pdf page` (one PNG per page).
- A pasted image lives at `~/.claude/uploads/<session>/*.gif|png`; copy it to the
  scratchpad and convert with PIL if needed (homr wants PNG/JPG).
- **Read the layout before any OMR**: Read the whole scan once, then `head.png` after
  `crop_systems.py`. Note the key signature per system (a key change mid-sheet is easy to
  miss), repeat signs, 1st/2nd endings, a pickup bar, and any written-out repeated
  systems. Expand a boxed chord grid into one chord per bar.
- **If there's both a boxed chord grid and chord labels over the staff, compare a
  handful of bars of each right now**, before transcribing a single note — see
  `references/by-eye.md`'s section on this. They're usually the same harmony (cross-check
  freely), but they can be two *unrelated* charts that just happen to have matching bar
  counts, and finding that out after transcribing 30 bars is expensive.
- If only a MIDI is given, you still need the key — infer it from the MIDI or ask.

## 2. OMR the lead sheet (if any image/PDF)

**Try homr whenever the source looks clean/vector — even a small (~600px) born-digital
GIF/PNG — not just a big scan.** The deciding factor is edge quality (crisp, uniform,
geometric = try OMR first), not pixel count; a photo/scan of real paper is the case that
genuinely struggles at low resolution. See `references/omr.md` for the full workflow,
homr's known mistakes, the per-staff fallback path, and cross-checks (tie detection via
`Slur` spanners, using a repeated phrase as a second opinion, the "sums to the meter is
necessary but not sufficient" triplet trap, chord-tone sanity checks).

If the source is a genuine photo/scan, or homr's output looks structurally implausible
on a quick read, go straight to `references/by-eye.md` — the manual crop-and-guide-line
procedure, including the barline-vs-note's-own-stem trap (`scripts/probe_column.py`) that
cost real time on a past transcription, and four worked case studies.

## 3. The MIDI (if any)

See `references/midi.md` — picking the lead part out of a multi-part file, finding the
transposition, and using it to resolve OMR ambiguities without overriding the lead
sheet's own plain notes with an improvised MIDI fill.

## 4. Chord symbols (lead sheet only)

homr ignores chord text — read it yourself with `chord_map.py` + `zoom.py` (barline x's
and chord-text x-spans; `zoom.py --system N --xfrac lo-hi` for a labelled, guide-lined
close-up). Full detail — including the boxed-grid-vs-inline-labels question, the
transposing-instrument conversion table, and the cross-bar accidental-spelling gotcha —
is in `references/abc-style.md`, since it feeds directly into how you write the chords
and notes down.

## 5. Write the ABC — house style

Full detail in `references/abc-style.md`: header field order, chord placement, ties and
beam grouping, the transposing-instrument table, mid-tune key changes, repeats/endings,
line-layout (bars per line), and lyric `w:` lines — including a real, easy-to-hit mistake
(spaced hyphens silently eating note slots) that a fresh look would not expect.

Look at 2-3 existing files first (`static/songs/when_youre_smiling.abc`,
`fly_me_to_the_moon.abc`, `bare_necessities.abc`) for house style before writing.

## 6. Validate — do not skip

```
abc2midi out.abc -o /dev/null      # must be silent
$VP $SK/render.py out.abc proof    # visual proof render
npm run lint:abc                   # CI gate
$VP $SK/check_abc.py static/songs/<name>.abc --musicxml scan3.musicxml --interval M-2
node $SK/render_site.mjs out.abc site.png --width 1100   # layout as the live site renders it
```

See `references/validate.md` for what each check actually catches (and doesn't — e.g.
`check_abc.py`'s lyric check is slot-*counts*, not word-placement, so a hyphen-spacing
bug can pass it silently), plus the install/report step.

## Script reference

| Script | Does |
|---|---|
| `omr_dump.py` | runs homr, writes/dumps `scan.musicxml` |
| `omr_to_abc.py` | homr MusicXML → draft ABC, transposed, key-aware, warns on bad bar sums |
| `omr_staves.py` | homr's per-staff log → draft ABC per staff, with per-staff fixes |
| `midi_parts.py` | list/dump a MIDI's parts by measure, with transposition |
| `notehead.py` | ASCII close-up of a notehead: filled vs hollow |
| `crop_systems.py` | scan → per-system crops (head + each staff line) |
| `zoom.py` | one staff system, magnified, with labelled pitch guide lines |
| `chord_map.py` | per system: barline x's + chord-text x-spans |
| `probe_column.py` | dark-run width at every row near a column — barline vs. a note's own stem, hollow vs. filled |
| `render.py` | ABC → proof PNG via MuseScore |
| `render_site.mjs` | ABC → PNG exactly as the live `/songs/` sheet renders it |
| `check_abc.py` | diffs your ABC against the OMR as text; checks `w:` syllable counts |
| `pdf_to_png.py` | PDF → PNG pages |

Reference files: `references/setup.md` (tools/environment), `references/omr.md`,
`references/by-eye.md`, `references/midi.md`, `references/abc-style.md`,
`references/validate.md`.

# The MIDI (if any)

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

A MIDI is always a **cross-check and fallback**, never copied verbatim — the lead sheet
is the primary source of truth (see the top-level SKILL.md).

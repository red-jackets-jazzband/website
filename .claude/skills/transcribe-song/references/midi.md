# The MIDI (if any)

```
$VP $SK/midi_parts.py song.mid                       # list parts
$VP $SK/midi_parts.py song.mid --part N --transpose -2  # dump one part by measure
```

- The lead is usually the part named/patched as a melody instrument (Trumpet,
  Clarinet, Voice, Lead...) with a moderate note count — not the busiest part.
- Find the transposition: match one unambiguous early bar of that part to the lead
  sheet's *concert* pitches and check the offset is the same semitone count on a second
  bar before trusting it — e.g. MIDI bar 2 reads `D6 E6` where the lead sheet's concert
  pitches for the same bar are `C5 D5`: both pairs are a major 2nd apart and both MIDI
  notes sit exactly an octave above their lead-sheet counterpart, so the whole part is a
  consistent `-14` semitones (a whole step + one octave) from concert. State explicitly
  which side of the comparison is written and which is concert — a transposing-instrument
  lead sheet's own *written* pitches are a different reference point than its concert
  ones (see `references/abc-style.md`), and comparing MIDI against the wrong one will
  look like a real but wrong transposition.
- `--transpose -N` (semitones) to line it up with the lead sheet's key/octave.
- Then compare **bar by bar** against the OMR melody. The MIDI resolves OMR
  ambiguities and catches OMR errors. But when a MIDI bar is busy/syncopated or
  sits at the end of a phrase, it is an improvised fill — keep the lead sheet's
  plain notes, not the MIDI's.
- MIDI-only fallback: take the lead part, `part.transpose` to target key, then
  quantize each note to the nearest notated value and drop grace/ornament notes.

A MIDI is always a **cross-check and fallback**, never copied verbatim — the lead sheet
is the primary source of truth (see the top-level SKILL.md).

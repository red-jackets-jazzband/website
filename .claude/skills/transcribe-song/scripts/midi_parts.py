#!/usr/bin/env python3
"""Inspect a MIDI file and dump one part measure by measure.

Usage:
    midi_parts.py song.mid                         # list parts
    midi_parts.py song.mid --part 1                 # dump part 1 by measure
    midi_parts.py song.mid --part 1 --transpose -2  # ...transposed down 2 semitones

Beats are shown relative to the measure (assumes 4/4 unless the file says otherwise).
Run with tools/OMR/.venv/bin/python3.
"""
import sys
from collections import defaultdict
import music21 as m21

src = sys.argv[1]
part_i = None
semis = 0
if "--part" in sys.argv:
    part_i = int(sys.argv[sys.argv.index("--part") + 1])
if "--transpose" in sys.argv:
    semis = int(sys.argv[sys.argv.index("--transpose") + 1])

s = m21.converter.parse(src)

if part_i is None:
    for i, p in enumerate(s.parts):
        notes = list(p.flatten().notes)
        prog = None
        for inst in p.flatten().getElementsByClass(m21.instrument.Instrument):
            prog = inst
        rng = ""
        if notes:
            ps = [n.pitches[-1].midi if n.isChord else n.pitch.midi for n in notes]
            rng = f" range {min(ps)}-{max(ps)}"
        print(f"part {i}: name={p.partName!r} instrument={prog} notes={len(notes)}{rng}")
    print("\nre-run with --part N (and optionally --transpose SEMITONES) to dump one")
    sys.exit()

p = s.parts[part_i].flatten()
if semis:
    p = p.transpose(semis)

# measure length in quarters
ts = p.getElementsByClass(m21.meter.TimeSignature)
beats = ts[0].barDuration.quarterLength if ts else 4.0

mm = defaultdict(list)
for n in p.notes:
    o = float(n.offset)
    meas = int(o // beats) + 1
    b = round(o - (meas - 1) * beats, 2)
    nm = n.root().name if n.isChord else n.name
    mm[meas].append((b, nm, round(float(n.quarterLength), 2)))

for meas in range(1, max(mm) + 1):
    if meas in mm:
        print(f"m{meas:>3}: " + "  ".join(f"{b}:{nm}({q})" for b, nm, q in mm[meas]))

#!/usr/bin/env python3
"""Locate barlines and chord-symbol text on a lead-sheet scan.

For each detected staff system it prints the x of every barline and the x-span of
every blob of text sitting in the band just above the staff (chord symbols,
rehearsal marks). Map each chord x to the bar it falls between.

Usage:  chord_map.py scan.png  [--grey 200] [--fill 0.55]
Run with tools/OMR/.venv/bin/python3.

Barline detection is heuristic (note stems can sneak in); trust the chord x's
more than the exact barline list, and confirm placement with zoom.py.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
from _staff import find_systems

src = sys.argv[1]
grey = int(sys.argv[sys.argv.index("--grey") + 1]) if "--grey" in sys.argv else 200
fill = float(sys.argv[sys.argv.index("--fill") + 1]) if "--fill" in sys.argv else 0.55

systems, (W, H) = find_systems(src, grey, fill)
dark = np.array(Image.open(src).convert("L")) < 128

if not systems:
    print("no staff systems found - try --grey 230 --fill 0.4, or inspect with zoom.py")
    sys.exit(1)

for i, rows in enumerate(systems, 1):
    top, bot = min(rows), max(rows)
    note = "" if len(rows) == 5 else f"  (!! {len(rows)} lines, expected 5)"
    h = max(1, bot - top)

    band = dark[top - 2: bot + 2, :]
    col = band.sum(axis=0)
    need = int(h * 0.85)
    xs = [x for x in range(W) if col[x] >= need]
    bl = []
    for x in xs:
        if bl and x - bl[-1][-1] <= 4:
            bl[-1].append(x)
        else:
            bl.append([x])
    barx = [int(np.mean(v)) for v in bl]

    ab = dark[max(0, top - 46): max(1, top - 8), :]
    cc = ab.sum(axis=0)
    hits = [x for x in range(W) if cc[x] > 0]
    tg = []
    for x in hits:
        if tg and x - tg[-1][-1] <= 22:
            tg[-1].append(x)
        else:
            tg.append([x])
    spans = [(int(v[0]), int(v[-1])) for v in tg if len(v) > 3]

    print(f"system {i}  staff y={top}-{bot}{note}")
    print(f"  barlines x:   {barx}")
    print(f"  chord text x: {spans}")

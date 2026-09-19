#!/usr/bin/env python3
"""ASCII close-up of a notehead in the ORIGINAL scan (not an upscale) to tell filled from hollow.

On a low-res scan a half note and a quarter note look alike once upscaled; the raw pixels
don't lie -- a hollow head shows a light hole in the middle, a filled one is solid. Use it
when a bar's rhythm is ambiguous (three heads in a 4/4 bar: which one is the half note?).

Usage:
    notehead.py scan.png X,Y [X,Y ...] [--r 8]     # pixel coords in the original scan
Find X,Y from a `crop_systems.py --scale N --xrange a-b` crop: original = crop / scale
(+ the crop's offset). Print a known quarter and a known half from the same sheet first
to calibrate, then the doubtful head.

Legend: '#' dark, '+' grey, '.' light. `fill` = mean darkness of the 5x3 core, 0-100.
Run with tools/OMR/.venv/bin/python3.
"""
import argparse
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("scan")
ap.add_argument("points", nargs="+")
ap.add_argument("--r", type=int, default=8)
a = ap.parse_args()

im = np.array(Image.open(a.scan).convert("L"))
for pt in a.points:
    x, y = (int(v) for v in pt.split(","))
    print(f"--- ({x},{y})")
    for yy in range(y - 4, y + 5):
        print("".join("#" if v < 90 else "+" if v < 170 else "." for v in im[yy, x - a.r:x + a.r + 1]))
    core = im[y - 1:y + 2, x - 2:x + 3]
    print(f"fill {100 - core.mean() / 2.55:.0f}")

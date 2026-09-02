#!/usr/bin/env python3
"""Crop & magnify one staff system of a lead-sheet scan, with pitch guide lines,
so you can Read it and identify notes precisely.

Usage:
    zoom.py scan.png --system 2                  # whole system 2
    zoom.py scan.png --system 2 --xfrac 0.3-0.6  # only that horizontal slice
    zoom.py scan.png --y 268                     # system whose TOP staff line is ~y
    zoom.py scan.png --system 2 --out crop.png   # default: <scan>_zoom.png

Guide lines: red = the 5 treble staff lines (F5 D5 B4 G4 E4, top->bottom),
blue = the spaces and ledger positions, green labels at the left edge.
Assumes a treble staff. If lines don't land on the real staff, pass --grey/--fill
(see chord_map) or --spacing.
Run with tools/OMR/.venv/bin/python3.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw
from _staff import find_systems

a = sys.argv
src = a[1]


def opt(name, d=None):
    return a[a.index(name) + 1] if name in a else d


grey = int(opt("--grey", 200))
fill = float(opt("--fill", 0.55))
systems, (W, Hh) = find_systems(src, grey, fill)

if opt("--y"):
    s_top = int(opt("--y"))
    rows = [s_top + k * 7 for k in range(5)]
elif opt("--system"):
    rows = systems[int(opt("--system")) - 1]
else:
    print("systems (staff line y's):")
    for i, r in enumerate(systems, 1):
        print(f"  {i}: {r}")
    rows = systems[0]

top_line = min(rows)
spacing = float(opt("--spacing", (max(rows) - min(rows)) / 4 if len(rows) > 1 else 7))

x0, x1 = 0, W
if opt("--xfrac"):
    lo, hi = opt("--xfrac").split("-")
    x0, x1 = int(float(lo) * W), int(float(hi) * W)

im = Image.open(src).convert("RGB")
d = ImageDraw.Draw(im)
names = ["F5", "E5", "D5", "C5", "B4", "A4", "G4", "F4", "E4",
         "D4", "C4", "B3", "A3"]
for k, nm in enumerate(names):
    y = int(round(top_line + k * (spacing / 2)))
    onstaff = (k % 2 == 0) and k <= 8
    d.line([(x0, y), (x1, y)], fill=(230, 60, 60) if onstaff else (70, 170, 250), width=1)
    d.text((x0 + 2, y - 5), nm, fill=(0, 130, 0))

top = max(0, top_line - 52)
bot = min(Hh, top_line + int(spacing * 5) + 20)
crop = im.crop((x0, top, x1, bot))
scale = max(1, int(1800 / max(1, x1 - x0)))
crop = crop.resize(((x1 - x0) * scale, (bot - top) * scale), Image.LANCZOS)
out = opt("--out", src.rsplit(".", 1)[0] + "_zoom.png")
crop.save(out)
print(out, crop.size, f"(staff top-line y={top_line}, spacing~{spacing:.1f})")

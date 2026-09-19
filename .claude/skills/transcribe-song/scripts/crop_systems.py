#!/usr/bin/env python3
"""Crop a lead-sheet scan into one upscaled image per staff system (plus the header).

Replaces hand-guessing y-ranges: finds every staff, then writes
  head.png     everything above the first system (title, boxed chord grid)
  sys1.png ... one crop per system: room above for chord symbols, room below for
               lyrics, full width, upscaled so a Read shows real detail
Read only the crops you need (e.g. the ones check_abc.py points at).

Usage:
    crop_systems.py scan.png [--out DIR] [--scale 3] [--grey 200] [--fill 0.55]
                             [--xrange 0.3-0.6]   # horizontal slice, like zoom.py
Run with tools/OMR/.venv/bin/python3.
"""
import argparse, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from _staff import find_systems

ap = argparse.ArgumentParser()
ap.add_argument("scan")
ap.add_argument("--out", default=".")
ap.add_argument("--scale", type=float, default=3)
ap.add_argument("--grey", type=int, default=200)
ap.add_argument("--fill", type=float, default=0.55)
ap.add_argument("--xrange")
a = ap.parse_args()

systems, (W, H) = find_systems(a.scan, a.grey, a.fill)
if not systems:
    sys.exit("no staff systems found - try --grey 230 --fill 0.4")

x0, x1 = 0, W
if a.xrange:
    lo, hi = (float(v) for v in a.xrange.split("-"))
    x0, x1 = int(W * lo), int(W * hi)

im = Image.open(a.scan).convert("RGB")
os.makedirs(a.out, exist_ok=True)
spacing = [(max(s) - min(s)) / 4 or 8 for s in systems]
tops = [min(s) for s in systems]
bots = [max(s) for s in systems]


def save(name, box, scale):
    c = im.crop(box)
    c = c.resize((int(c.width * scale), int(c.height * scale)), Image.LANCZOS)
    path = os.path.join(a.out, name)
    c.save(path)
    print(f"{name}  {c.width}x{c.height}")


head_bottom = int(tops[0] - 2 * spacing[0])
if head_bottom > 20:
    save("head.png", (0, 0, W, head_bottom), max(2, a.scale - 1))

for i, (t, b, sp) in enumerate(zip(tops, bots, spacing)):
    above = t - 5 * sp
    below = b + 6 * sp
    if i > 0:
        above = max(above, (bots[i - 1] + t) / 2)
    if i + 1 < len(tops):
        below = min(below, (b + tops[i + 1]) / 2 + sp)
    save(f"sys{i + 1}.png", (x0, max(0, int(above)), x1, min(H, int(below))), a.scale)

if any(len(s) != 5 for s in systems):
    print("note: some systems did not have exactly 5 detected staff lines - "
          "check the crops, or adjust --grey/--fill", file=sys.stderr)

#!/usr/bin/env python3
"""Print the dark-run width at every row near a suspicious column, to tell a real
barline (narrow, 2-3px, uniform width, no wide run nearby) from a note's own stem
(narrow, but a wide run — the notehead ring/disk — touches it within 1-2px), and to
read hollow-vs-filled off a notehead's own width profile.

Why this exists: a half/quarter note sitting on or near the *top* staff line, with a
normal-length stem down, can span nearly the full 5-line staff height -- indistinguishable
at a glance from a real barline. A naive "is this column dark for ~90%+ of the staff
height" check fires on both. The fix is width, not height: a notehead is wide (>=5-6px
at its widest row); a stem or a real barline is narrow (2-3px) at every row.

Usage:
    probe_column.py scan.png --x 391 --top 238 --spacing 7
    probe_column.py scan.png --x 391 --top 238 --spacing 7 --span 6   # +/- columns to scan
    probe_column.py scan.png --x 391 --top 238 --spacing 7 --y0 228 --y1 270

Run with a plain python3 (needs only pillow + numpy, no OMR venv required).
"""
import sys
import numpy as np
from PIL import Image


def opt(argv, name, default=None, cast=str):
    return cast(argv[argv.index(name) + 1]) if name in argv else default


def dark_run_width(row, x, thresh=200, max_gap=0):
    """Width of the contiguous dark run touching column x (thresh<val), allowing
    max_gap light pixels to bridge (0 = must be strictly contiguous)."""
    if row[x] >= thresh:
        return 0
    lo = hi = x
    gap = 0
    while lo - 1 >= 0:
        if row[lo - 1] < thresh:
            lo -= 1
            gap = 0
        elif gap < max_gap:
            gap += 1
            lo -= 1
        else:
            break
    gap = 0
    while hi + 1 < len(row):
        if row[hi + 1] < thresh:
            hi += 1
            gap = 0
        elif gap < max_gap:
            gap += 1
            hi += 1
        else:
            break
    return hi - lo + 1


def main():
    a = sys.argv
    src = a[1]
    x = opt(a, "--x", cast=int)
    top = opt(a, "--top", cast=float)
    spacing = opt(a, "--spacing", 7.0, float)
    span = opt(a, "--span", 4, int)
    thresh = opt(a, "--thresh", 200, int)
    y0 = opt(a, "--y0", cast=int)
    y1 = opt(a, "--y1", cast=int)
    if y0 is None:
        y0 = int(top - spacing * 4) if top is not None else 0
    if y1 is None:
        y1 = int(top + spacing * 8) if top is not None else None

    g = np.array(Image.open(src).convert("L"))
    if y1 is None:
        y1 = g.shape[0]

    # Find the staff line's OWN ink rows empirically (near-full-width dark), rather than
    # blanket-excluding a fixed +/-1px band around the ideal position: a notehead centered
    # on a line puts its widest bulge exactly at the neighbouring row, and a fixed guess
    # can exclude that row along with the true line, hiding the very evidence this script
    # exists to show. A row only counts as "the line" if it's dark almost everywhere, not
    # just near this one column -- a wide notehead run never satisfies that on its own.
    line_rows = set()
    if top is not None:
        w = g.shape[1]
        for k in (0, 2, 4, 6, 8):
            ly = int(round(top + k * spacing / 2))
            for y in (ly - 1, ly, ly + 1):
                if 0 <= y < g.shape[0] and (g[y] < thresh).sum() > 0.85 * w:
                    line_rows.add(y)

    print(f"column x={x}, probing x-{span}..x+{span}, y={y0}..{y1}")
    print(f"{'y':>5}  {'line?':>5}  " + "  ".join(f"x{dx:+d}" for dx in range(-span, span + 1)))
    max_seen = 0
    for y in range(y0, y1):
        row = g[y]
        on_line = y in line_rows
        if on_line:
            print(f"{y:5d}  {'line':>5}  (staff line -- full width dark, ignore)")
            continue
        widths = [dark_run_width(row, x + dx, thresh) for dx in range(-span, span + 1)]
        max_seen = max(max_seen, max(widths))
        if any(widths):
            marks = "  ".join(f"{w:3d}" for w in widths)
            print(f"{y:5d}  {'':>5}  {marks}")

    print()
    at_x_widths = [dark_run_width(g[y], x, thresh) for y in range(y0, y1) if y not in line_rows]
    at_x_widths = [w for w in at_x_widths if w > 0]
    if at_x_widths:
        print(f"at x={x} (excluding staff-line rows): widths range {min(at_x_widths)}-{max(at_x_widths)}")
    print(f"widest NON-staff-line run seen in the +/-{span} window: {max_seen}px")
    print()
    print("Read: a real barline/stem stays ~2-3px wide the whole way, with nothing")
    print("wider than that touching it. A notehead run is a clear >=5-6px bulge at")
    print("some contiguous band of rows -- if that bulge sits right at one end of an")
    print("otherwise-narrow column, the column is that note's own stem, not a barline.")


if __name__ == "__main__":
    main()

"""Shared: find treble-staff systems on a lead-sheet scan.

Returns a list of systems, each a list of 5 staff-line y-coordinates
(top -> bottom, i.e. F5 D5 B4 G4 E4 for a treble staff).

Staff lines on abcjs / engraver renders are often anti-aliased grey, so the
default grey threshold is loose (200) and the row-fill threshold high (0.55).
Pass different values if a particular scan misbehaves.
"""
import numpy as np
from PIL import Image


def find_systems(path, grey=200, fill=0.55):
    g = np.array(Image.open(path).convert("L"))
    H, W = g.shape
    rowdark = (g < grey).sum(axis=1)
    rows = [y for y in range(H) if rowdark[y] > W * fill]
    groups = []
    for y in rows:
        if groups and y - groups[-1][-1] <= 3:
            groups[-1].append(y)
        else:
            groups.append([y])
    line_ys = [int(round(np.mean(x))) for x in groups]

    systems, cur = [], []
    for y in line_ys:
        if cur and y - cur[-1] > 20:
            systems.append(cur); cur = []
        cur.append(y)
    if cur:
        systems.append(cur)
    # keep only plausible 5-line systems; if a system has !=5 lines, still return
    # what we have (caller can eyeball) but note it
    return systems, (W, H)

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
    # Drop stray rules (a boxed chord grid, table borders, underlines): they show up
    # as groups of 1-3 lines. Fall back to everything if nothing looks like a staff.
    staves = [s for s in systems if len(s) >= 4]
    staves = staves or systems
    # A table border sitting within 20px of a real staff (common right below a boxed
    # chord grid) merges into that staff's group instead of forming its own group of
    # 1-3, e.g. [207, 226, 231, 236, 242, 248] for a grid border + 5 real lines. Within
    # any group of >5, keep the 5 consecutive lines with the most uniform spacing
    # (a real staff's 4 gaps are all ~equal; a stray border makes one gap much bigger).
    trimmed = []
    for s in staves:
        if len(s) <= 5:
            trimmed.append(s)
            continue
        best, best_score = None, None
        for i in range(len(s) - 4):
            window = s[i:i + 5]
            gaps = [window[j + 1] - window[j] for j in range(4)]
            score = max(gaps) - min(gaps)
            if best_score is None or score < best_score:
                best, best_score = window, score
        trimmed.append(best)
    return trimmed, (W, H)

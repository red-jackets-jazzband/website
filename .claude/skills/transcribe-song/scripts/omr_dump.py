#!/usr/bin/env python3
"""Dump a homr MusicXML (or any MusicXML) measure by measure.

Usage:
    omr_dump.py score.musicxml
    omr_dump.py score.png          # runs homr first, then dumps

Run with tools/OMR/.venv/bin/python3.
"""
import sys, subprocess, os
import music21 as m21

path = sys.argv[1]
if path.lower().endswith((".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff")):
    here = os.path.dirname(os.path.abspath(__file__))
    homr = os.path.join(here, "..", "..", "..", "..", "tools", "OMR", ".venv", "bin", "homr")
    homr = os.path.abspath(homr)
    if not os.path.exists(homr):
        homr = "homr"
    subprocess.run([homr, path], check=True)
    path = path.rsplit(".", 1)[0] + ".musicxml"

s = m21.converter.parse(path)

ks = s.recurse().getElementsByClass(m21.key.KeySignature)
if ks:
    sh = ks[0].sharps
    print(f"key signature: {sh:+d} ({'sharps' if sh > 0 else 'flats' if sh < 0 else 'none'}) "
          f"-> likely {ks[0].asKey('major').name} / {ks[0].asKey('minor').name}")
cl = s.recurse().getElementsByClass(m21.clef.Clef)
if cl:
    print("clef:", cl[0].name)
try:
    print("(pitch-histogram guess, often wrong for short excerpts:", s.analyze("key"), ")")
except Exception as e:
    print("key analysis failed:", e)

for part in s.parts:
    print(f"=== part: {part.partName}")
    for m in part.getElementsByClass("Measure"):
        toks = []
        for n in m.notesAndRests:
            ql = float(n.quarterLength)
            if n.isRest:
                toks.append(f"r/{ql:g}")
            elif n.isChord:
                toks.append("[" + " ".join(x.nameWithOctave for x in n) + f"]/{ql:g}")
            else:
                toks.append(f"{n.nameWithOctave}/{ql:g}")
        print(f"  m{m.number:>3}: " + "  ".join(toks))

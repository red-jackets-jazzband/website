#!/usr/bin/env python3
"""Render an ABC (or MusicXML) file to PNG(s) for visual proofreading.

    render.py out.abc [out_prefix]

Pipeline: music21 parse -> MusicXML -> mscore -> PNG page(s) -> trim whitespace,
stitch vertically, slice into <=2000px-tall chunks that Read can open.
Writes out_prefix_1.png, _2.png, ...   (default prefix: <input>_render)
Run with tools/OMR/.venv/bin/python3.
"""
import sys, subprocess, os, glob
import music21 as m21
from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = None

src = sys.argv[1]
prefix = sys.argv[2] if len(sys.argv) > 2 else src.rsplit(".", 1)[0] + "_render"
work = prefix + "_work"

if src.lower().endswith(".abc"):
    xml = work + ".musicxml"
    m21.converter.parse(src).write("musicxml", xml)
else:
    xml = src

subprocess.run(["mscore", xml, "-o", work + ".png"],
               env=dict(os.environ, QT_QPA_PLATFORM="offscreen"),
               check=True, capture_output=True)

pages = sorted(glob.glob(work + "*.png"),
               key=lambda p: int("".join(filter(str.isdigit, os.path.basename(p))) or 0))
imgs = []
for p in pages:
    im = Image.open(p).convert("RGB")
    bg = Image.new("RGB", im.size, (255, 255, 255))
    diff = ImageOps.invert(Image.blend(bg, im, 1.0).convert("L"))
    bbox = diff.getbbox()
    if bbox:
        im = im.crop((0, max(0, bbox[1] - 20), im.size[0], min(im.size[1], bbox[3] + 20)))
    # scale to 1500 wide
    w, h = im.size
    im = im.resize((1500, int(h * 1500 / w)), Image.LANCZOS)
    imgs.append(im)

if not imgs:
    sys.exit("mscore produced no pages")

full = Image.new("RGB", (1500, sum(i.size[1] for i in imgs)), (255, 255, 255))
y = 0
for im in imgs:
    full.paste(im, (0, y)); y += im.size[1]

chunk = 1900
n = 0
for top in range(0, full.size[1], chunk):
    n += 1
    part = full.crop((0, top, 1500, min(full.size[1], top + chunk)))
    name = f"{prefix}_{n}.png"
    part.save(name)
    print(name, part.size)

for f in glob.glob(work + "*"):
    os.remove(f)

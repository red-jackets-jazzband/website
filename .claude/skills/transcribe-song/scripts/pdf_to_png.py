#!/usr/bin/env python3
"""PDF -> one PNG per page.  Usage: pdf_to_png.py in.pdf [out_prefix] [dpi]"""
import sys, fitz  # PyMuPDF (in tools/OMR/.venv)

src = sys.argv[1]
prefix = sys.argv[2] if len(sys.argv) > 2 else src.rsplit(".", 1)[0]
dpi = int(sys.argv[3]) if len(sys.argv) > 3 else 300

doc = fitz.open(src)
for i, page in enumerate(doc, 1):
    pix = page.get_pixmap(dpi=dpi)
    out = f"{prefix}_p{i}.png" if len(doc) > 1 else f"{prefix}.png"
    pix.save(out)
    print(out, f"{pix.width}x{pix.height}")

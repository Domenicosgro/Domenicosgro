#!/usr/bin/env python3
"""Convert icon.svg -> icon.ico (Windows) and icon.icns (macOS)"""
import os, struct, zlib, io, sys
import cairosvg
from PIL import Image

script_dir = os.path.dirname(os.path.abspath(__file__))
svg_path = os.path.join(script_dir, "icon.svg")

# ── PNG sizes needed ────────────────────────────────────────────────
ico_sizes  = [16, 24, 32, 48, 64, 128, 256]
icns_sizes = [16, 32, 64, 128, 256, 512, 1024]

def svg_to_png(size):
    data = cairosvg.svg2png(url=svg_path, output_width=size, output_height=size)
    return Image.open(io.BytesIO(data)).convert("RGBA")

# ── Build .ico ───────────────────────────────────────────────────────
def build_ico():
    images = [(s, svg_to_png(s)) for s in ico_sizes]
    # ICO header: RESERVED(2) TYPE(2) COUNT(2)
    count = len(images)
    header = struct.pack("<HHH", 0, 1, count)

    png_datas = []
    for (size, img) in images:
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        png_datas.append(buf.getvalue())

    # Directory entries start after header (6 bytes) + count*16 bytes
    offset = 6 + count * 16
    entries = b""
    for i, (size, img) in enumerate(images):
        data = png_datas[i]
        w = size if size < 256 else 0
        h = size if size < 256 else 0
        entries += struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(data), offset)
        offset += len(data)

    ico_path = os.path.join(script_dir, "icon.ico")
    with open(ico_path, "wb") as f:
        f.write(header + entries + b"".join(png_datas))
    print(f"  Created {ico_path}")

# ── Build .icns ──────────────────────────────────────────────────────
# OSType codes for PNG-stored icons
ICNS_TYPES = {
    16:   b'icp4',
    32:   b'icp5',
    64:   b'icp6',
    128:  b'ic07',
    256:  b'ic08',
    512:  b'ic09',
    1024: b'ic10',
}

def build_icns():
    chunks = b""
    for size in icns_sizes:
        img = svg_to_png(size)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        png = buf.getvalue()
        ostype = ICNS_TYPES[size]
        chunk_len = 8 + len(png)
        chunks += ostype + struct.pack(">I", chunk_len) + png

    total = 8 + len(chunks)
    icns_path = os.path.join(script_dir, "icon.icns")
    with open(icns_path, "wb") as f:
        f.write(b"icns" + struct.pack(">I", total) + chunks)
    print(f"  Created {icns_path}")

print("Building icons...")
build_ico()
build_icns()
print("Done.")

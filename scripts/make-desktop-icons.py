#!/usr/bin/env python3
"""
Build desktop/build/icon.ico (Windows) and icon.png (macOS dock / window) from
assets/icon.png.

Two things this handles that a plain resize does not:

1. **Transparency.** The source art is a circle on an opaque near-white square.
   Left as-is, Windows draws that square, so the icon shows up as a pale box on
   a light taskbar and a dark box on a dark one. Everything outside the circle
   is made transparent so the badge sits correctly on either theme.

2. **Per-size artwork.** At 16-32px the wordmark and the portrait's linework
   collapse into noise. Those sizes get a zoomed crop that keeps the face, the
   mic and — importantly — the mint ring, which is the only thing that reads
   against a dark taskbar. 48px and up keep the complete logo.

Run: .venv/bin/python scripts/make-desktop-icons.py
"""
import io
import struct
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'icon.png'
OUT_DIR = ROOT / 'desktop' / 'build'

SMALL_SIZES = [16, 24, 32]
LARGE_SIZES = [48, 64, 128, 256]
# How much of the source to keep for the small sizes. Tuned by eye: tight
# enough to drop the wordmark, loose enough to keep a visible mint ring.
SMALL_CROP = 0.80
SMALL_TOP = 0.055


def circular(img: Image.Image, supersample: int = 4) -> Image.Image:
    """Circular crop with a transparent outside and an anti-aliased edge."""
    n = img.size[0] * supersample
    mask = Image.new('L', (n, n), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, n - 1, n - 1), fill=255)
    out = img.copy()
    out.putalpha(mask.resize(img.size, Image.LANCZOS))
    return out


def ico_entries(img: Image.Image, sizes: list[int]) -> list[tuple[bytes, bytes]]:
    """Encode `img` at each size, returning Pillow's own (dir_entry, blob) pairs.

    Pillow already picks the right container per size (DIB for the small ones,
    PNG for 256), so rather than re-implement that, save a throwaway .ico and
    read its directory back out.
    """
    buf = io.BytesIO()
    img.save(buf, format='ICO', sizes=[(s, s) for s in sizes])
    data = buf.getvalue()
    count = struct.unpack_from('<H', data, 4)[0]
    entries = []
    for i in range(count):
        entry = bytearray(data[6 + i * 16: 6 + (i + 1) * 16])
        size, offset = struct.unpack_from('<II', entry, 8)
        entries.append((entry, data[offset:offset + size]))
    return entries


def main() -> None:
    src = Image.open(SRC).convert('RGBA')
    w, h = src.size

    full = circular(src)

    box = int(w * SMALL_CROP)
    left = (w - box) // 2
    top = int(h * SMALL_TOP)
    detail = circular(src.crop((left, top, left + box, top + box)).resize((w, h), Image.LANCZOS))

    entries = ico_entries(detail, SMALL_SIZES) + ico_entries(full, LARGE_SIZES)
    # Windows picks by size, not order, but keep it ascending for tidiness.
    entries.sort(key=lambda e: e[0][0] or 256)

    header = struct.pack('<HHH', 0, 1, len(entries))
    offset = len(header) + 16 * len(entries)
    dir_bytes, blobs = b'', b''
    for entry, blob in entries:
        struct.pack_into('<II', entry, 8, len(blob), offset)
        dir_bytes += bytes(entry)
        blobs += blob
        offset += len(blob)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / 'icon.ico').write_bytes(header + dir_bytes + blobs)
    # macOS dock and the BrowserWindow icon want a plain square PNG.
    full.save(OUT_DIR / 'icon.png')

    print(f'icon.ico  -> {[e[0][0] or 256 for e in entries]}')
    print(f'icon.png  -> {full.size[0]}px, transparent outside the circle')


if __name__ == '__main__':
    main()

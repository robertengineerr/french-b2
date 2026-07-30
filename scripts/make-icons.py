#!/usr/bin/env python3
"""Generate the app icons with no image library available.

Writes a minimal PNG by hand (signature, IHDR, IDAT, IEND). The mark is a "B2"
drawn from a 5x7 bitmap font over a dark background, with an accent bar beneath.

Run:  python3 scripts/make-icons.py
"""
import struct
import zlib
from pathlib import Path

BG = (0x10, 0x23, 0x3A)
FG = (0x7F, 0xC8, 0xB6)
ACCENT = (0xF2, 0x81, 0x2F)

GLYPHS = {
    "B": [
        "11110",
        "10001",
        "10001",
        "11110",
        "10001",
        "10001",
        "11110",
    ],
    "2": [
        "01110",
        "10001",
        "00001",
        "00010",
        "00100",
        "01000",
        "11111",
    ],
}


def png(path: Path, size: int, pixels) -> None:
    """pixels: callable (x, y) -> (r, g, b)"""
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0: none
        for x in range(size):
            raw.extend(pixels(x, y))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit truecolor
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def build(size: int, out: Path, inset: float = 0.0) -> None:
    """inset shrinks the artwork toward the centre, for maskable icons."""
    text = "B2"
    cols = len(text) * 5 + (len(text) - 1)  # one blank column between glyphs
    rows = 7

    usable = size * (1 - inset)
    scale = int(usable / (cols + 5))  # leave breathing room around the mark
    if scale < 1:
        scale = 1
    mark_w = cols * scale
    mark_h = rows * scale
    x0 = (size - mark_w) // 2
    y0 = (size - mark_h) // 2 - scale  # nudge up to make room for the accent bar

    # Flatten the glyph rows into one lookup grid.
    grid = [[0] * cols for _ in range(rows)]
    cx = 0
    for ch in text:
        for r, line in enumerate(GLYPHS[ch]):
            for c, bit in enumerate(line):
                if bit == "1":
                    grid[r][cx + c] = 1
        cx += 6

    bar_y0 = y0 + mark_h + scale
    bar_y1 = bar_y0 + max(1, scale // 2)
    bar_x0 = x0
    bar_x1 = x0 + mark_w

    def px(x, y):
        if bar_y0 <= y < bar_y1 and bar_x0 <= x < bar_x1:
            return ACCENT
        gx, gy = x - x0, y - y0
        if 0 <= gx < mark_w and 0 <= gy < mark_h:
            if grid[gy // scale][gx // scale]:
                return FG
        return BG

    png(out, size, px)
    print(f"wrote {out.name} ({size}x{size})")


if __name__ == "__main__":
    icons = Path(__file__).resolve().parent.parent / "public" / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    build(180, icons / "icon-180.png")  # apple-touch-icon
    build(192, icons / "icon-192.png")
    build(512, icons / "icon-512.png")
    build(512, icons / "icon-maskable-512.png", inset=0.28)  # safe zone for Android masks

#!/usr/bin/env python3
"""Rebuild every desktop icon from the KASTRA logo (icon-src/logo.png).

    python3 icon-src/build_icons.py          (run from apps/desktop)

Needs: Python 3 with Pillow. The macOS .icns is made by the Tauri CLI (`npx tauri icon`); if that is not installed
the old .icns is left alone.

The logo is a rounded tile on a white canvas. This script finds the tile, makes everything outside it transparent
(with smooth edges), trims the canvas to a small even margin, and scales that one master to every size. Edit
icon-src/logo.png, not the generated files.

What it writes into src-tauri/icons/:
  icon.png, 512x512@2x.png (1024)  512x512.png  128x128@2x.png (256)  128x128.png  32x32.png  icon.ico  icon.icns
The ICO holds ten sizes from 16 to 256 px, each scaled from the master (not from a smaller icon), so they stay sharp.
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

HERE = Path(__file__).resolve().parent
ICONS = HERE.parent / 'src-tauri' / 'icons'
MASTER = 1024          # master edge, px
MARGIN = 0.03          # transparent margin around the tile, as a share of the master
WORK = 4               # supersample factor used while cutting out the tile (smooth edges)
ICO_SIZES = (256, 128, 96, 64, 48, 40, 32, 24, 20, 16)


def cut_out_tile(src: Image.Image) -> Image.Image:
    """Transparent background, tile only. Flood-fills the white canvas from the corners so white INSIDE the logo stays."""
    big = src.convert('RGB').resize((src.width * WORK // 2, src.height * WORK // 2), Image.LANCZOS)
    w, h = big.size
    # background candidates: pixels whose red, green AND blue are all near white (a pale yellow edge is not)
    r, g, b = big.split()
    lightest_low = ImageChops.darker(ImageChops.darker(r, g), b)
    mask = lightest_low.point(lambda v: 255 if v >= 236 else 0)
    # flood from the four corners: only the white OUTSIDE the tile is reached, white inside the logo stays
    from PIL import ImageDraw
    work = mask.copy()
    for corner in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        ImageDraw.floodfill(work, corner, 128, thresh=0)
    background = work.point(lambda v: 255 if v == 128 else 0)
    # a one-pixel (supersampled) bite and a soft edge hide the white fringe left by anti-aliasing
    tile = ImageChops.invert(background).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    out = big.convert('RGBA')
    out.putalpha(tile)
    return out


def square_master(tile: Image.Image) -> Image.Image:
    bbox = tile.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    if not bbox:
        sys.exit('could not find the logo tile in icon-src/logo.png')
    tile = tile.crop(bbox)
    side = max(tile.size)
    inner = round(MASTER * (1 - 2 * MARGIN))
    tile = tile.resize((round(tile.width * inner / side), round(tile.height * inner / side)), Image.LANCZOS)
    canvas = Image.new('RGBA', (MASTER, MASTER), (0, 0, 0, 0))
    canvas.paste(tile, ((MASTER - tile.width) // 2, (MASTER - tile.height) // 2), tile)
    return canvas


def scaled(master: Image.Image, size: int) -> Image.Image:
    return master.resize((size, size), Image.LANCZOS, reducing_gap=3.0)


def main() -> None:
    src = Image.open(HERE / 'logo.png')
    if min(src.size) < 1024:
        print(f'warning: logo.png is {src.width}x{src.height}; 1024 px or more keeps the big icons sharp')
    master = square_master(cut_out_tile(src))
    ICONS.mkdir(parents=True, exist_ok=True)

    master.save(ICONS / 'icon.png')
    master.save(ICONS / '512x512@2x.png')
    scaled(master, 512).save(ICONS / '512x512.png')
    scaled(master, 256).save(ICONS / '128x128@2x.png')
    scaled(master, 128).save(ICONS / '128x128.png')
    scaled(master, 32).save(ICONS / '32x32.png')

    frames = [scaled(master, s) for s in ICO_SIZES]
    frames[0].save(ICONS / 'icon.ico', format='ICO', sizes=[(s, s) for s in ICO_SIZES], append_images=frames[1:])

    with tempfile.TemporaryDirectory() as tmp:
        out_dir = Path(tmp) / 'tauri-icons'
        try:
            subprocess.run(['npx', '--no-install', 'tauri', 'icon', str(ICONS / 'icon.png'), '-o', str(out_dir)],
                           cwd=HERE.parent, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           timeout=300, shell=(sys.platform == 'win32'))
            shutil.copyfile(out_dir / 'icon.icns', ICONS / 'icon.icns')
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            print('note: Tauri CLI not available, icon.icns not regenerated')
    print('icons written to', ICONS)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Rebuild every desktop icon from the vector masters.

    python3 icon-src/build_icons.py          (run from apps/desktop)

Needs: Python 3 with Pillow, and Chrome / Chromium / Edge (to draw the SVG; set CHROME to its path if it is not found).
The macOS .icns is made by the Tauri CLI (`npx tauri icon`); if that is not installed the old .icns is left alone.

What it writes into src-tauri/icons/:
  icon.png, 512x512@2x.png (1024)  128x128@2x.png (256)  512x512.png  128x128.png  32x32.png  icon.ico  icon.icns
The ICO holds ten hand-picked sizes: 16-40 px use the flat, heavier artwork (icon-small.svg) because gradients,
shadows and thin gaps turn to mud that small; 48 px and up use the full artwork (icon.svg).
"""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ICONS = HERE.parent / 'src-tauri' / 'icons'
sys.path.insert(0, str(HERE))
import make_svgs  # noqa: E402

SMALL_SIZES = (16, 20, 24, 32, 40)
FULL_SIZES = (48, 64, 96, 128, 256)


def find_chrome() -> str:
    env = os.environ.get('CHROME')
    if env and Path(env).exists():
        return env
    for name in ('google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome', 'msedge'):
        found = shutil.which(name)
        if found:
            return found
    for p in (r'C:\Program Files\Google\Chrome\Application\chrome.exe',
              r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
              r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
              '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'):
        if Path(p).exists():
            return p
    sys.exit('Chrome/Chromium/Edge not found. Install one or set CHROME to its executable.')


def render(chrome: str, svg: Path, out: Path, size: int = 1024) -> Image.Image:
    """Draw the SVG at size x size with a transparent background."""
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / 'page.html'
        page.write_text(
            f'<html><body style="margin:0;background:transparent"><img src="{svg.as_uri()}" '
            f'width="{size}" height="{size}" style="display:block"></body></html>')
        subprocess.run(
            [chrome, '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
             '--default-background-color=00000000', f'--window-size={size},{size}',
             f'--screenshot={out}', page.as_uri()],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    return Image.open(out).convert('RGBA')


def scaled(master: Image.Image, size: int) -> Image.Image:
    return master.resize((size, size), Image.LANCZOS, reducing_gap=3.0)


def main() -> None:
    chrome = find_chrome()
    ICONS.mkdir(parents=True, exist_ok=True)
    # 1. the vector masters (kept in icon-src as the source of truth)
    for name, fn in (('icon.svg', make_svgs.full_svg), ('icon-small.svg', make_svgs.small_svg),
                     ('icon-macos.svg', make_svgs.macos_svg)):
        (HERE / name).write_text(fn())
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        full = render(chrome, HERE / 'icon.svg', tmp / 'full.png')
        small = render(chrome, HERE / 'icon-small.svg', tmp / 'small.png')
        mac = render(chrome, HERE / 'icon-macos.svg', tmp / 'mac.png')

        # 2. PNGs Tauri lists in tauri.conf.json (32 uses the flat artwork, the rest the full artwork)
        full.save(ICONS / 'icon.png')
        full.save(ICONS / '512x512@2x.png')
        scaled(full, 512).save(ICONS / '512x512.png')
        scaled(full, 256).save(ICONS / '128x128@2x.png')
        scaled(full, 128).save(ICONS / '128x128.png')
        scaled(small, 32).save(ICONS / '32x32.png')

        # 3. Windows ICO with a purpose-drawn image for every size
        frames = {s: scaled(small, s) for s in SMALL_SIZES}
        frames.update({s: scaled(full, s) for s in FULL_SIZES})
        order = sorted(frames, reverse=True)
        frames[order[0]].save(ICONS / 'icon.ico', format='ICO', sizes=[(s, s) for s in order],
                              append_images=[frames[s] for s in order[1:]])

        # 4. macOS ICNS from the Apple-template artwork, via the Tauri CLI
        mac_png = tmp / 'icon-macos.png'
        mac.save(mac_png)
        out_dir = tmp / 'tauri-icons'
        try:
            subprocess.run(['npx', '--no-install', 'tauri', 'icon', str(mac_png), '-o', str(out_dir)],
                           cwd=HERE.parent, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           timeout=300, shell=(os.name == 'nt'))
            shutil.copyfile(out_dir / 'icon.icns', ICONS / 'icon.icns')
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            print('note: Tauri CLI not available, icon.icns not regenerated')
    print('icons written to', ICONS)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Cut AI-generated sprite sheets (transparent PNG grids) into separate game sprites.

Usage: python3 scripts/art/slice.py            # all sheets listed in sheets.json
       python3 scripts/art/slice.py crops1     # only the named sheets

Needs Pillow, numpy and scipy (a throwaway venv is enough; the game itself does not use Python).
Raw sheets live in art/sheets/<name>.png; sprites go to public/art/<id>.webp and the manifest
with every sprite's size goes to src/render/artManifest.ts.

How a sheet is cut: opaque pixels are grouped into connected blobs (after a small dilation so
leaves and fruit stay together), every blob goes to the grid cell holding its centre, and each cell
is trimmed to the union of its blobs. Pixels of other cells' blobs are erased, so a leaf poking
into a neighbouring cell never leaks into the wrong sprite.
"""
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
SHEETS = ROOT / 'art' / 'sheets'
OUT = ROOT / 'public' / 'art'
MANIFEST = ROOT / 'src' / 'render' / 'artManifest.ts'


def source(name: str) -> Path:
    for ext in ('png', 'webp'):
        if (SHEETS / f'{name}.{ext}').exists():
            return SHEETS / f'{name}.{ext}'
    raise SystemExit(f'missing sheet {name}')


def pieces(sheet: dict) -> list[tuple[str, np.ndarray]]:
    """The sheet's objects as trimmed RGBA arrays, in the order of sheet['ids']."""
    img = Image.open(source(sheet['name'])).convert('RGBA')
    if sheet.get('key'):
        img = chroma_key(img)
    a = np.array(img)
    H, W = a.shape[:2]
    cols, rows = sheet['grid']
    mask = a[..., 3] > 20
    grown = ndimage.binary_dilation(mask, iterations=6)
    labels, n = ndimage.label(grown)
    cells: dict[int, list[int]] = {}
    idx = list(range(1, n + 1))
    areas = ndimage.sum_labels(grown, labels, idx)
    centres = ndimage.center_of_mass(grown, labels, idx)
    for i, area, (cy, cx) in zip(idx, areas, centres):
        if area < 400:  # specks of noise
            continue
        cell = int(cy // (H / rows)) * cols + int(cx // (W / cols))
        cells.setdefault(cell, []).append(i)
    out = []
    for idx, sid in enumerate(sheet['ids']):
        if not sid:
            continue
        blobs = cells.get(idx)
        if not blobs:
            raise SystemExit(f"{sheet['name']}: nothing found for {sid} (cell {idx})")
        own = np.isin(labels, blobs) & mask
        ys, xs = np.nonzero(own)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        piece = a[y0:y1, x0:x1].copy()
        piece[..., 3] = np.where(own[y0:y1, x0:x1], piece[..., 3], 0)
        out.append((sid, piece))
    return out


def save(im: Image.Image, sid: str) -> list[int]:
    OUT.mkdir(parents=True, exist_ok=True)
    im.save(OUT / f'{sid}.webp', 'WEBP', quality=88, method=6)
    return [im.width, im.height]


def cut(sheet: dict) -> dict:
    out = {}
    for sid, piece in pieces(sheet):
        im = Image.fromarray(piece)
        k = min(1.0, sheet['size'] / max(im.size))
        if k < 1:
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        out[sid] = save(im, sid)
    return out


# Key colours the character sheets are painted with; the game recolours them to the player's look.
REGIONS = {'hair': (280, 345), 'shirt': (85, 165), 'pants': (195, 255)}


def character(sheet: dict) -> dict:
    """
    Animation frames → one atlas (a grid of equal cells, every frame's feet at the same point)
    plus an alpha mask per recolourable region. Inside the regions the atlas is grey shading,
    so the game can multiply it by any colour.
    """
    frames = [p for _, p in pieces(sheet)]
    cols = sheet['atlas_cols']
    rows = -(-len(frames) // cols)
    k = sheet['height'] / max(f.shape[0] for f in frames)  # one scale for all frames
    scaled, anchors = [], []
    for i, f in enumerate(frames):
        im = Image.fromarray(f)
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        a = np.array(im)
        alpha = a[..., 3] > 40
        ys, xs = np.nonzero(alpha)
        foot = ys >= ys.max() - max(3, round(a.shape[0] * 0.06))  # the lowest few rows: boots
        ax = float(xs[foot].mean()) + sheet.get('nudge', {}).get(str(i), 0) * k
        scaled.append(a)
        anchors.append((ax, float(ys.max())))
    left = max(ax for ax, _ in anchors)
    right = max(f.shape[1] - ax for f, (ax, _) in zip(scaled, anchors))
    up = max(ay for _, ay in anchors)
    half = int(np.ceil(max(left, right))) + 2
    cw, ch = 2 * half, int(np.ceil(up)) + 6
    ox, oy = half, ch - 4  # the feet in every cell: bottom centre, 4 px up (the game relies on this)
    atlas = np.zeros((rows * ch, cols * cw, 4), np.uint8)
    paintable = np.ones(atlas.shape[:2], bool)  # where regions may be recoloured
    for i, (a, (ax, ay)) in enumerate(zip(scaled, anchors)):
        x = int(round((i % cols) * cw + ox - ax))
        y = int(round((i // cols) * ch + oy - ay))
        dst = atlas[y:y + a.shape[0], x:x + a.shape[1]]
        dst[...] = np.where(a[..., 3:4] > dst[..., 3:4], a, dst)
        # props that happen to have a key colour (a green plant, …): [x0, y0, x1, y1] as fractions of the frame
        for fx0, fy0, fx1, fy1 in sheet.get('nomask', {}).get(str(i), []):
            h, w = a.shape[:2]
            paintable[y + int(fy0 * h):y + int(fy1 * h), x + int(fx0 * w):x + int(fx1 * w)] = False
    rgb = atlas[..., :3].astype(np.float32) / 255
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    hue = np.array(Image.fromarray(atlas[..., :3]).convert('HSV'))[..., 0].astype(np.float32) * 360 / 255
    lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    opaque = atlas[..., 3] > 0
    out = {}
    name = sheet['id']
    for region, (h0, h1) in REGIONS.items():
        m = opaque & paintable & (sat > 0.3) & (mx > 0.18) & (hue >= h0) & (hue <= h1)
        m = ndimage.binary_closing(m, iterations=1) & opaque
        ref = np.median(lum[m]) if m.any() else 1
        shade = np.clip(lum / ref * 0.82, 0, 1)
        for c in range(3):
            atlas[..., c] = np.where(m, (shade * 255).astype(np.uint8), atlas[..., c])
        soft = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
        layer = np.zeros(atlas.shape, np.uint8)
        layer[..., :3] = 255
        layer[..., 3] = np.minimum(np.array(soft), atlas[..., 3])
        out[f'{name}-{region}'] = save(Image.fromarray(layer), f'{name}-{region}')
    out[name] = save(Image.fromarray(atlas), name)
    print(f'  {name}: {len(frames)} frames, cell {cw}x{ch}, anchor ({ox:.0f}, {oy:.0f})')
    return out


def chroma_key(img: Image.Image) -> Image.Image:
    """For sheets generated on a flat background: make the corner colour transparent."""
    a = np.array(img).astype(np.int32)
    bg = a[2, 2, :3]
    d = np.abs(a[..., :3] - bg).sum(axis=2)
    a[..., 3] = np.clip((d - 30) * 6, 0, 255)
    return Image.fromarray(a.astype(np.uint8))


def soften(im: Image.Image, k: float) -> Image.Image:
    """Calmer texture: blur (wrapping around, so it stays seamless) and lower the contrast."""
    w, h = im.size
    big = Image.new('RGB', (w * 3, h * 3))
    for i in range(3):
        for j in range(3):
            big.paste(im, (i * w, j * h))
    big = big.filter(ImageFilter.GaussianBlur(3 * k)).crop((w, h, 2 * w, 2 * h))
    return ImageEnhance.Contrast(big).enhance(1 - 0.5 * k)


def texture(t: dict) -> dict:
    im = Image.open(source(t['name'])).convert('RGB')
    if t.get('soften'):
        im = soften(im, t['soften'])
    if 'width' in t:
        im = im.resize((t['width'], round(im.height * t['width'] / im.width)), Image.LANCZOS)
    else:
        im = im.resize((t['size'], t['size']), Image.LANCZOS)
    im.save(OUT / f"{t['id']}.webp", 'WEBP', quality=85, method=6)
    return {t['id']: [im.width, im.height]}


def main():
    cfg = json.loads((ROOT / 'scripts' / 'art' / 'sheets.json').read_text())
    only = set(sys.argv[1:])
    manifest = {}
    if MANIFEST.exists():  # keep entries of sheets we are not re-cutting
        for line in MANIFEST.read_text().splitlines():
            line = line.strip()
            if line.startswith("'"):
                k, v = line.rstrip(',').split(': ')
                manifest[k.strip("'")] = json.loads(v)
    for sheet in cfg['sheets']:
        if only and sheet['name'] not in only:
            continue
        manifest.update(character(sheet) if sheet.get('character') else cut(sheet))
        print('cut', sheet['name'])
    for t in cfg.get('textures', []):
        if only and t['name'] not in only:
            continue
        manifest.update(texture(t))
        print('texture', t['name'])
    for alias, src in cfg.get('aliases', {}).items():
        if src in manifest:
            shutil.copyfile(OUT / f'{src}.webp', OUT / f'{alias}.webp')
            manifest[alias] = manifest[src]
    body = ''.join(f"  '{k}': [{v[0]}, {v[1]}],\n" for k, v in sorted(manifest.items()))
    MANIFEST.write_text(
        '// Generated by scripts/art/slice.py — do not edit by hand.\n'
        '// Every painted sprite in public/art/<id>.webp with its size in pixels.\n'
        f'export const ART: Record<string, [number, number]> = {{\n{body}}};\n'
    )


if __name__ == '__main__':
    main()

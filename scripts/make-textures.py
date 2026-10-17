"""Liquid-marble gradient textures in Wecycle's social-post palettes.

Domain-warped fractal noise (f(p + 4·f(p + 4·f(p)))) mapped through a palette
in repeating bands, which gives the swirled, contour-like marble of the
"For Students / By Students" posts. Grain is NOT baked in — it is a separate
tiling noise layer in CSS (public/textures/grain.png), so these stay small and
the same grain sits over every texture at one consistent strength.

    python3 scripts/make-textures.py         # writes public/textures/*.webp

Free tools that make the same look by hand: fffuel.co → ffflux (fluid
gradients) and gggrain (grain), or Haikei. This script exists so the textures
are reproducible and versioned with the app.
"""
import numpy as np
from PIL import Image
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'textures')

def value_noise(h, w, cell, rng):
    gh, gw = h // cell + 2, w // cell + 2
    g = rng.random((gh, gw)).astype(np.float32)
    y = np.arange(h, dtype=np.float32) / cell
    x = np.arange(w, dtype=np.float32) / cell
    yi, xi = y.astype(int), x.astype(int)
    yf, xf = y - yi, x - xi
    yf = yf * yf * (3 - 2 * yf); xf = xf * xf * (3 - 2 * xf)
    a = g[yi][:, xi]; b = g[yi][:, xi + 1]; c = g[yi + 1][:, xi]; d = g[yi + 1][:, xi + 1]
    top = a + (b - a) * xf[None, :]; bot = c + (d - c) * xf[None, :]
    return top + (bot - top) * yf[:, None]

def fbm(h, w, base, rng, octaves=4):
    out = np.zeros((h, w), np.float32); amp = 0.5; cell = base; norm = 0
    for _ in range(octaves):
        out += amp * value_noise(h, w, max(2, int(cell)), rng); norm += amp
        amp *= 0.5; cell /= 2
    return out / norm

def sample(field, yy, xx):
    h, w = field.shape
    yy = np.clip(yy, 0, h - 1).astype(int); xx = np.clip(xx, 0, w - 1).astype(int)
    return field[yy, xx]

def marble(w, h, palette, seed, bands=3.2, warp=1.0, soft=False, stretch=1.0, octaves=5):
    rng = np.random.default_rng(seed)
    pad = 160
    H, W = h + 2 * pad, w + 2 * pad
    q1, q2 = fbm(H, W, 360, rng), fbm(H, W, 360, rng)
    r1, r2 = fbm(H, W, 260, rng), fbm(H, W, 260, rng)
    base = fbm(H, W, 300, rng, octaves)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    yy += pad; xx += pad
    k = 260 * warp
    qy = sample(q1, yy, xx); qx = sample(q2, yy, xx)
    ry = sample(r1, yy + k * qy, xx + k * qx); rx = sample(r2, yy + k * qy, xx + k * qx)
    # stretch < 1 samples the last layer more slowly along x: long, flowing streaks like the posts
    v = sample(base, yy + k * ry, (xx - W / 2) * stretch + W / 2 + k * rx)
    v = (v - v.min()) / (v.max() - v.min() + 1e-6)
    t = (v * bands) % 1.0 if not soft else v
    pal = np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in palette], np.float32) / 255
    n = len(pal)
    pos = t * (n - 1 if soft else n)
    i0 = np.floor(pos).astype(int) % n; i1 = (i0 + 1) % n
    f = pos - np.floor(pos); f = f * f * (3 - 2 * f)
    rgb = pal[i0] * (1 - f[..., None]) + pal[i1] * f[..., None]
    return Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8), 'RGB')

def grain(size=160, seed=3):
    rng = np.random.default_rng(seed)
    n = rng.normal(128, 46, (size, size)).clip(0, 255).astype(np.uint8)
    return Image.fromarray(n, 'L')

LOUD = {   # from the social posts
    'moss':   ['#06210a', '#0f5d17', '#34a51d', '#a7d61c', '#e9ef3a', '#6fbf22', '#0b3a10'],
    'ember':  ['#5a0806', '#c8160e', '#ff4d0d', '#ff8a1c', '#ffd34a', '#e2350c'],
    'prism':  ['#1a2bd8', '#6a2bd6', '#e3263a', '#ff7a1a', '#f6c90e', '#e3263a', '#2a46ff'],
    'violet': ['#2b0f6b', '#7b2ff7', '#e45cf0', '#ffe4fb', '#ffb3f0', '#5b1fd1'],
}
SOFT = {   # for the light UI — from the sunset widget reference
    'sunset': ['#bcd3ee', '#cdb9dc', '#f2b9a3', '#ff9a52', '#ffc65a'],
    'mist':   ['#eef0ec', '#e3ebe6', '#e7e2ef', '#f2e6da', '#edf0e8'],
    'meadow': ['#dfeee3', '#cfe9b8', '#eef3b6', '#d3e9e0', '#e8f2dc'],
}
def veiled(img, blur=56, left=0.60, right=0.06):
    """The loud marble, softened for a card that carries type: blurred into a
    smooth bloom (the sunset-widget look) and lifted toward white more on the
    left, where the words sit, than on the right, where the colour shows."""
    from PIL import ImageFilter
    im = img.filter(ImageFilter.GaussianBlur(blur))
    a = np.asarray(im, np.float32) / 255
    h, w, _ = a.shape
    x = np.linspace(0, 1, w, dtype=np.float32)
    # Eased, so the veil holds across the text column and falls away late.
    ramp = (left - (left - right) * x ** 2.2)[None, :, None]
    a = a * (1 - ramp) + ramp
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), 'RGB')

os.makedirs(OUT, exist_ok=True)
for i, (name, pal) in enumerate(LOUD.items()):
    loud = marble(1200, 900, pal, 11 + i, bands=1.7, warp=1.35, stretch=0.45, octaves=3)
    loud.save(f'{OUT}/{name}.webp', quality=82)
    # A 2:1 card version of each, for banners with type on them.
    card = marble(1200, 600, pal, 41 + i, bands=1.7, warp=1.35, stretch=0.45, octaves=3)
    veiled(card).save(f'{OUT}/{name}-soft.webp', quality=84)
for i, (name, pal) in enumerate(SOFT.items()):
    marble(900, 900, pal, 31 + i, warp=0.8, soft=True).save(f'{OUT}/{name}.webp', quality=86)
grain().save(f'{OUT}/grain.png', optimize=True)
print('ok')

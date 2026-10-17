"""The "All" category tile, drawn as voxels to sit with the other twelve.

public/icons/categories/*.webp are isometric voxel renders (cream, two greens,
lime, navy; soft top light, darker right faces, faint seams between voxels).
"All" is a filter, not an object, so it never had one. This draws the usual
"show me everything" glyph, four tiles in a 2x2 grid, in the same isometric
projection, palette and lighting, so the strip reads as one set.

    python3 scripts/make-voxel-all.py   # writes public/icons/categories/all.webp
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons', 'categories', 'all.webp')
S = 8                      # supersample
SIZE = 168
A = 8.0 * S                # half-width of a voxel's top diamond, in supersampled px
B = A * 0.577              # half-height of the diamond (true isometric, 30°)
H = A * 1.155              # a vertical edge, the same length as the diamond's edges

PAL = {                    # sampled from the existing category renders
    'navy':  (0x1C, 0x2D, 0x4C),
    'green': (0x6F, 0xB0, 0x63),
    'lime':  (0xAE, 0xCC, 0x46),
    'cream': (0xEC, 0xE4, 0xCE),
}

def shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c)

def mix(c, d, t):
    return tuple(int(a + (b - a) * t) for a, b in zip(c, d))

# Four 6x6 tiles with a 2-voxel gutter, two voxels thick, each with its corner
# voxels removed so the tiles read as rounded squares, the way the flat "all"
# glyph is drawn.
N, GAP, T = 6, 2, 3
voxels = []
tiles = [((0, 0), 'lime'), ((N + GAP, 0), 'green'), ((0, N + GAP), 'cream'), ((N + GAP, N + GAP), 'navy')]
corners = {(0, 0), (0, N - 1), (N - 1, 0), (N - 1, N - 1)}
for (ox, oy), col in tiles:
    for i in range(N):
        for j in range(N):
            if (i, j) in corners:
                continue
            for z in range(T):
                voxels.append((ox + i, oy + j, z, col))

def proj(x, y, z, cx, cy):
    return (cx + (x - y) * A, cy + (x + y) * B - z * H)

W = SIZE * S
img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
cx, cy = W / 2, W * 0.26

occupied = {(x, y, z) for x, y, z, _ in voxels}
for x, y, z, col in sorted(voxels, key=lambda v: (v[0] + v[1] + v[2], v[2])):
    base = PAL[col]
    top_c = mix(shade(base, 1.10), (255, 255, 255), 0.10)
    left_c = shade(base, 0.92)
    right_c = shade(base, 0.70)
    seam = shade(base, 0.86)
    p = lambda dx, dy, dz: proj(x + dx, y + dy, z + dz, cx, cy)
    if (x, y, z + 1) not in occupied:   # top
        d.polygon([p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)], fill=top_c, outline=seam, width=S // 2)
    if (x, y + 1, z) not in occupied:   # +y face, the left one on screen
        d.polygon([p(0, 1, 1), p(1, 1, 1), p(1, 1, 0), p(0, 1, 0)], fill=left_c, outline=shade(left_c, 0.94), width=S // 3)
    if (x + 1, y, z) not in occupied:   # +x face, the right one on screen
        d.polygon([p(1, 0, 1), p(1, 1, 1), p(1, 1, 0), p(1, 0, 0)], fill=right_c, outline=shade(right_c, 0.94), width=S // 3)

# Fit: trim, then centre the cluster at about the visual size of the others.
bbox = img.getbbox()
img = img.crop(bbox)
target = int(SIZE * 0.84)
scale = target / max(img.size)
img = img.resize((max(1, int(img.width * scale)), max(1, int(img.height * scale))), Image.LANCZOS)
out = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
out.paste(img, ((SIZE - img.width) // 2, (SIZE - img.height) // 2 + 4), img)
# The category renders are soft-edged; a touch of blur keeps this one from
# looking sharper than its neighbours.
from PIL import ImageFilter
out = out.filter(ImageFilter.GaussianBlur(0.35))
out.save(OUT, quality=90)
print('wrote', OUT, out.size)

"""Builds the KASTRA POS app icon as pure vector SVG (no fonts, no raster).

Three outputs:
  icon.svg        full artwork, 1024 grid, gradient tile + soft lift (sizes 48px and up)
  icon-small.svg  flat, heavier, larger K (sizes 16 to 40px, where depth effects turn to mud)
  icon-macos.svg  the same artwork inside Apple's template (tile 824 centred, soft shadow)

Palette: Signal Violet #7A35FF and Mist Gray #F0F2F5 (saved pair 3). The tile gradient is the same hue,
a little lighter at the top and deeper at the bottom; the lower K arm is a violet tint so the letter has depth.
"""
import math

VIOLET_TOP, VIOLET, VIOLET_BOT = '#8B50FF', '#7A35FF', '#6A22EE'
MIST = '#F0F2F5'
TINT = '#D9CBFF'          # violet tint for the lower arm
SHADOW = '#2A0A80'


# ---------- geometry helpers ----------

def squircle_path(cx, cy, half, n=5.0, pts=96):
    """Superellipse |x|^n + |y|^n = 1 (Apple-style continuous corners) as a smooth cubic Bezier path."""
    P = []
    for i in range(pts * 4):
        t = 2 * math.pi * i / (pts * 4)
        c, s = math.cos(t), math.sin(t)
        x = cx + half * math.copysign(abs(c) ** (2 / n), c)
        y = cy + half * math.copysign(abs(s) ** (2 / n), s)
        P.append((x, y))
    m = len(P)
    d = f'M{P[0][0]:.2f} {P[0][1]:.2f}'
    for i in range(m):  # Catmull-Rom -> cubic Bezier
        p0, p1, p2, p3 = P[(i - 1) % m], P[i], P[(i + 1) % m], P[(i + 2) % m]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f'C{c1[0]:.2f} {c1[1]:.2f} {c2[0]:.2f} {c2[1]:.2f} {p2[0]:.2f} {p2[1]:.2f}'
    return d + 'Z'


def inset_convex(poly, d):
    """Offset a convex polygon inward by d (so fill + a round-joined stroke of 2d restores the outline with round corners)."""
    n = len(poly)
    # signed area to know orientation
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n)) / 2
    sgn = 1 if area > 0 else -1
    lines = []
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        dx, dy = x2 - x1, y2 - y1
        L = math.hypot(dx, dy)
        nx, ny = -dy / L * sgn, dx / L * sgn      # inward normal
        lines.append(((x1 + nx * d, y1 + ny * d), (dx, dy)))
    out = []
    for i in range(n):
        (p, r), (q, s) = lines[i - 1], lines[i]
        den = r[0] * s[1] - r[1] * s[0]
        t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den
        out.append((p[0] + r[0] * t, p[1] + r[1] * t))
    return out


def poly_d(poly):
    return 'M' + 'L'.join(f'{x:.2f} {y:.2f}' for x, y in poly) + 'Z'


def k_shapes(height, stem, arm_w, theta_deg, radius, cx=512, cy=512):
    """The three parts of the K, centred optically on (cx, cy). Returns (lower_arm, stem, upper_arm) polygons.

    Each arm is the strip between two parallel slanted edges (horizontal width arm_w), cut at the top edge of the
    letter and, on the stem side, at a vertical line a little INSIDE the stem so the join is seamless but nothing
    pokes out of the stem's left edge.
    """
    tan = math.tan(math.radians(theta_deg))
    top, bot = cy - height / 2, cy + height / 2
    run = (cy - top) / tan                      # horizontal run of an arm from the junction up to the top edge
    x0 = cx - (stem + run) / 2 + 6              # letter's left edge; nudged right because the arms are the open side
    sx1 = x0 + stem                             # stem right edge: the arms attach here
    rtop = sx1 + run                            # upper arm's right edge reaches the top at this x
    xc = sx1 - stem * 0.72                      # vertical cut line, deep enough inside the stem that the arm's rounded acute corner never reaches its edge
    y_r = top + (rtop - xc) * tan               # where the arm's right edge meets that line
    y_l = top + (rtop - arm_w - xc) * tan       # where its left edge meets that line
    up = [(rtop - arm_w, top), (rtop, top), (xc, y_r), (xc, y_l)]
    lo = [(x, 2 * cy - y) for x, y in up][::-1]  # mirror about the centre line, keep winding order
    stem_poly = [(x0, top), (sx1, top), (sx1, bot), (x0, bot)]
    return lo, stem_poly, up


def shape_svg(poly, fill, radius, extra=''):
    ins = inset_convex(poly, radius)
    return (f'<path d="{poly_d(ins)}" fill="{fill}" stroke="{fill}" stroke-width="{2 * radius}" '
            f'stroke-linejoin="round"{extra}/>')


# ---------- artwork ----------

def glyph_group(height, stem, arm_w, theta, radius, two_tone, shadow):
    lo, st, up = k_shapes(height, stem, arm_w, theta, radius)
    lo_fill = TINT if two_tone else MIST
    inner = ''.join([shape_svg(lo, lo_fill, radius), shape_svg(st, MIST, radius), shape_svg(up, MIST, radius)])
    flt = ' filter="url(#lift)"' if shadow else ''
    return f'<g{flt}>{inner}</g>'


def defs(shadow):
    d = (f'<linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">'
         f'<stop offset="0" stop-color="{VIOLET_TOP}"/><stop offset="0.55" stop-color="{VIOLET}"/>'
         f'<stop offset="1" stop-color="{VIOLET_BOT}"/></linearGradient>')
    d += ('<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">'
          '<stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/>'
          '</linearGradient>')
    if shadow:
        d += (f'<filter id="lift" x="-20%" y="-20%" width="140%" height="150%">'
              f'<feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="{SHADOW}" flood-opacity="0.38"/></filter>')
    return f'<defs>{d}</defs>'


def tile(half, cx=512, cy=512):
    return squircle_path(cx, cy, half)


def full_svg():
    half = 492                                            # 20px margin on a 1024 canvas
    t = tile(half)
    body = (f'<path d="{t}" fill="url(#tile)"/>'
            f'<path d="{t}" fill="url(#sheen)"/>'
            + glyph_group(height=548, stem=124, arm_w=158, theta=50, radius=26, two_tone=True, shadow=True))
    return svg(defs(True) + body)


def small_svg():
    half = 506                                            # nearly full bleed: every pixel counts at 16px
    t = tile(half)
    body = (f'<path d="{t}" fill="{VIOLET}"/>'
            + glyph_group(height=640, stem=176, arm_w=226, theta=50, radius=18, two_tone=False, shadow=False))
    return svg(defs(False) + body)


def macos_svg():
    half = 412                                            # Apple template: 824 tile in a 1024 canvas
    t = tile(half)
    inner = (f'<path d="{t}" fill="url(#tile)"/><path d="{t}" fill="url(#sheen)"/>'
             + glyph_group(height=452, stem=102, arm_w=130, theta=50, radius=22, two_tone=True, shadow=True))
    shadow = ('<filter id="drop" x="-20%" y="-20%" width="140%" height="150%">'
              f'<feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000" flood-opacity="0.30"/></filter>')
    body = f'<g filter="url(#drop)">{inner}</g>'
    return svg(defs(True) + shadow + body)


def svg(inner):
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">'
            + inner + '</svg>\n')


if __name__ == '__main__':
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    for name, fn in (('icon.svg', full_svg), ('icon-small.svg', small_svg), ('icon-macos.svg', macos_svg)):
        open(f'{out}/{name}', 'w').write(fn())
        print('wrote', name)

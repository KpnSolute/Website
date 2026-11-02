"""Traces the owner's final icon artwork (source-icon.webp) into clean vector layers.
Two layers, no painted white: INK (orbits, diamond frame, dot) and STAR (compass star). Gaps between strokes
stay transparent, so the icon works on any background and recolors for dark mode.   Output: layers.json"""
import json, numpy as np, potrace
from PIL import Image

SCALE = 2                                     # trace at 2x for smoother curves
im = Image.open("source-icon.webp").convert("RGBA")
im = im.resize((im.width * SCALE, im.height * SCALE), Image.LANCZOS)
a = np.asarray(im).astype(float); al = a[..., 3] / 255.0; r, g, b = a[..., 0], a[..., 1], a[..., 2]
lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
teal_amt = np.clip((g - r) / 131.0, 0, 1)                 # 0 for neutral colours, 1 for the full teal (1,132,142)
teal = (al * teal_amt) > 0.5
# ink: opaque, dark and not teal. Soft membership so edges land at the true boundary, not at a hard threshold.
ink_soft = al * (1 - lum) * (1 - teal_amt)
ink = ink_soft > 0.5

def trace(mask, name, straight=False):
    bm = potrace.Bitmap(~mask)      # potracer traces the pixels that are False
    # straight=True: every edge a straight line (the compass spikes are polygons, so no wobble from raster noise)
    plist = bm.trace(turdsize=12, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY, alphamax=0.0 if straight else 1.0, opticurve=not straight, opttolerance=0.25)
    parts = []; f = lambda p: f"{p.x / SCALE:.1f} {p.y / SCALE:.1f}"
    for curve in plist:
        d = f"M{f(curve.start_point)}"
        for seg in curve.segments:
            d += (f"L{f(seg.c)}L{f(seg.end_point)}" if seg.is_corner else f"C{f(seg.c1)} {f(seg.c2)} {f(seg.end_point)}")
        parts.append(d + "Z")
    print(name, "curves", len(parts), "chars", sum(map(len, parts))); return "".join(parts)

layers = {"ink": trace(ink, "ink"), "star": trace(teal, "star", straight=True)}
json.dump(layers, open("layers.json", "w")); print("done")

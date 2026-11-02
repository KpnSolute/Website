"""Builds the KpnSolute logo files. Wordmark letters are outlined from Josefin Sans (SIL OFL 1.1),
so the SVGs need no installed font. Run: /tmp/brandvenv/bin/python build.py"""
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

NAVY, INK, ACCENT, SOFT = "#0B1226", "#F7F8FA", "#6D8DFF", "#2F5FE0"
WORD, WGHT = "KpnSolute", 450

font = instantiateVariableFont(TTFont("JosefinSans-VF.ttf"), {"wght": WGHT})
gs, cmap, upm = font.getGlyphSet(), font.getBestCmap(), font["head"].unitsPerEm

def wordmark_path(size: float, x0: float = 0.0, baseline: float = 0.0, tracking: float = 0.0):
    """Outlined text: returns (svg path d, width). tracking in em units."""
    scale, x, parts = size / upm, x0, []
    for ch in WORD:
        name = cmap[ord(ch)]; pen = SVGPathPen(gs)
        gs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, baseline)))
        parts.append(pen.getCommands()); x += gs[name].width * scale + tracking * size
    return " ".join(p for p in parts if p), x - x0 - tracking * size

def mark(tile: bool, stroke: str, node_fill: str, ring: str, bg: str = NAVY) -> str:
    """The K as a route: a stem, and two branches that leave it and end in nodes (the route map)."""
    out = []
    if tile: out.append(f'<rect width="128" height="128" rx="30" fill="{bg}"/>')
    mask = ""
    if not tile:  # transparent background: cut the arms where the node rings sit instead of covering them
        mask = ('<mask id="k"><rect width="128" height="128" fill="#fff"/>'
                '<circle cx="92" cy="34" r="11" fill="#000"/><circle cx="92" cy="94" r="11" fill="#000"/></mask>')
    out.append(mask + f'<g fill="none" stroke="{stroke}" stroke-width="9" stroke-linecap="round"' + (' mask="url(#k)"' if mask else '') + '>'
               f'<path d="M42 28V100"/>'
               f'<path d="M42 64C64 64 70 36 92 34"/>'
               f'<path d="M42 64C64 64 70 92 92 94"/></g>')
    out.append(f'<circle cx="42" cy="64" r="8.5" fill="{node_fill}"/>')
    for cy in (34, 94):
        out.append(f'<circle cx="92" cy="{cy}" r="7.5" fill="{bg if tile else "none"}" stroke="{ring}" stroke-width="5"/>')
    return "".join(out)

def svg(w, h, body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" width="{w:g}" height="{h:g}" role="img" '
            f'aria-labelledby="t"><title id="t">{title}</title>{body}</svg>\n')

def write(name, content):
    open(name, "w").write(content); print("wrote", name)

# 1. icon (tile) and mono mark
write("kpnsolute-icon.svg", svg(128, 128, mark(True, INK, ACCENT, ACCENT), "KpnSolute"))
write("kpnsolute-mark-navy.svg", svg(128, 128, mark(False, NAVY, NAVY, NAVY), "KpnSolute"))
write("kpnsolute-mark-white.svg", svg(128, 128, mark(False, INK, INK, INK), "KpnSolute"))

# 2. lockups: tile icon + outlined wordmark
SIZE, GAP, H = 68, 28, 128
d, tw = wordmark_path(SIZE, baseline=0)
cap = font["OS/2"].sCapHeight / upm * SIZE
base = H / 2 + cap / 2           # vertically centre the capitals on the tile
d, tw = wordmark_path(SIZE, x0=H + GAP, baseline=base)
W = H + GAP + tw
write("kpnsolute-lockup.svg", svg(W, H, mark(True, INK, ACCENT, ACCENT) + f'<path d="{d}" fill="{NAVY}"/>', "KpnSolute"))
write("kpnsolute-lockup-on-dark.svg", svg(W, H, mark(True, INK, ACCENT, ACCENT, bg="#1A2240") + f'<path d="{d}" fill="{INK}"/>', "KpnSolute"))

# favicon: the same K, bolder and simpler so it holds at 16px (solid nodes, no rings)
fav = (f'<rect width="128" height="128" rx="30" fill="{NAVY}"/>'
       f'<g fill="none" stroke="{INK}" stroke-width="14" stroke-linecap="round"><path d="M40 26V102"/>'
       f'<path d="M40 64C62 64 68 36 90 34"/><path d="M40 64C62 64 68 92 90 94"/></g>'
       f'<circle cx="92" cy="33" r="13" fill="{ACCENT}"/><circle cx="92" cy="95" r="13" fill="{ACCENT}"/>')
write("kpnsolute-favicon.svg", svg(128, 128, fav, "KpnSolute"))

# 3. wordmark alone (as supplied: navy on white)
dw, ww = wordmark_path(96, baseline=96 * 0.75)
write("kpnsolute-wordmark.svg", svg(ww + 4, 118, f'<path d="{dw}" fill="{NAVY}"/>', "KpnSolute"))
print("lockup width", round(W), "wordmark width", round(ww))

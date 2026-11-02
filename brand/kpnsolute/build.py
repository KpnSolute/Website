"""Builds the KpnSolute logo files. Wordmark letters are outlined from Josefin Sans (SIL OFL 1.1),
so the SVGs need no installed font.   Run: python3 build.py   (needs: pip install fonttools)

The mark is a K made of two solid shapes: a stem and a bold chevron (the branch), split by an even gap.
Navy stem + blue chevron on light; white stem + light-blue chevron on dark or on the app tile."""
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

NAVY, INK, BLUE, SKY = "#0B1226", "#F7F8FA", "#2F5FE0", "#7C97FF"
TILE_FROM = "#1B2A5C"
_font = {}
def load(w):
    if w not in _font:
        f = instantiateVariableFont(TTFont("JosefinSans-VF.ttf"), {"wght": w}); _font[w] = (f, f.getGlyphSet(), f.getBestCmap(), f["head"].unitsPerEm)
    return _font[w]

def word(text, size, x0, base, wght=450, tracking=0.0, upper=False):
    f, gs, cm, upm = load(wght); text = text.upper() if upper else text; sc = size / upm; x = x0; parts = []
    for ch in text:
        n = cm[ord(ch)]; pen = SVGPathPen(gs); gs[n].draw(TransformPen(pen, (sc, 0, 0, -sc, x, base))); parts.append(pen.getCommands()); x += gs[n].width * sc + tracking * size
    return " ".join(p for p in parts if p), x - x0 - tracking * size, f["OS/2"].sCapHeight / upm * size

GRAD = f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{TILE_FROM}"/><stop offset="1" stop-color="{NAVY}"/></linearGradient></defs>'

def mark(stem, chev, tile=False, bold=False):
    """128 x 128. Optical edges line up: the chevron's round caps end exactly at the stem's top and bottom."""
    t = '<rect width="128" height="128" rx="30" fill="url(#g)"/>' if tile else ""
    if bold:   # favicon: heavier, wider gap, so it holds at 16 px
        return (t + f'<rect x="18" y="22" width="26" height="84" rx="8" fill="{stem}"/>'
                f'<path d="M99 37 L68 64 L99 91" fill="none" stroke="{chev}" stroke-width="26" stroke-linejoin="round" stroke-linecap="round"/>')
    return (t + f'<rect x="21" y="20" width="22" height="88" rx="7" fill="{stem}"/>'
            f'<path d="M97 31 L63 64 L97 97" fill="none" stroke="{chev}" stroke-width="22" stroke-linejoin="round" stroke-linecap="round"/>')

def svg(w, h, body, grad=False, title="KpnSolute"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" width="{w:g}" height="{h:g}" role="img" aria-labelledby="t">'
            f'<title id="t">{title}</title>{GRAD if grad else ""}{body}</svg>\n')

def write(name, content): open(name, "w").write(content); print("wrote", name)

def lockup(markbody, color, grad=False, **text):
    H, GAP = 128, 26
    _, _, cap = word(**text, x0=0, base=0)
    d, tw, _ = word(**text, x0=H + GAP, base=H / 2 + cap / 2)
    return svg(H + GAP + tw, H, markbody + f'<path d="{d}" fill="{color}"/>', grad)

MIXED = dict(text="KpnSolute", size=68, wght=450)
UPPER = dict(text="KpnSolute", size=50, wght=400, tracking=0.22, upper=True)

# icon and marks
write("kpnsolute-icon.svg", svg(128, 128, mark(INK, SKY, tile=True), grad=True))
write("kpnsolute-mark.svg", svg(128, 128, mark(NAVY, BLUE)))
write("kpnsolute-mark-navy.svg", svg(128, 128, mark(NAVY, NAVY)))
write("kpnsolute-mark-white.svg", svg(128, 128, mark(INK, INK)))
write("kpnsolute-favicon.svg", svg(128, 128, mark(INK, SKY, tile=True, bold=True), grad=True))
# lockups: flat mark + the owner's wordmark (primary), tile variant, uppercase alternative, on dark
write("kpnsolute-lockup.svg", lockup(mark(NAVY, BLUE), NAVY, **MIXED))
write("kpnsolute-lockup-on-dark.svg", lockup(mark(INK, SKY), INK, **MIXED))
write("kpnsolute-lockup-tile.svg", lockup(mark(INK, SKY, tile=True), NAVY, grad=True, **MIXED))
write("kpnsolute-lockup-uppercase.svg", lockup(mark(NAVY, BLUE), NAVY, **UPPER))
write("kpnsolute-lockup-uppercase-on-dark.svg", lockup(mark(INK, SKY), INK, **UPPER))
dw, ww, _ = word(text="KpnSolute", size=96, x0=0, base=72, wght=450)
write("kpnsolute-wordmark.svg", svg(ww + 4, 118, f'<path d="{dw}" fill="{NAVY}"/>'))

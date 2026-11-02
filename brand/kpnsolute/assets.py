"""Builds every KpnSolute logo file from the traced icon (layers.json) and the owner's wordmark (Josefin Sans, OFL)."""
import json, re
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from icon import L, VB, INK, STAR, INK_D, STAR_D, CX, CY

BOX = 1198.0; X0, Y0 = 26.0, 33.0
font = instantiateVariableFont(TTFont("JosefinSans-VF.ttf"), {"wght": 450}); GS, CM, UPM = font.getGlyphSet(), font.getBestCmap(), font["head"].unitsPerEm
CAP = font["OS/2"].sCapHeight / UPM

def word(size, x0, base, text="KpnSolute"):
    sc, x, parts = size / UPM, x0, []
    for ch in text:
        n = CM[ord(ch)]; pen = SVGPathPen(GS); GS[n].draw(TransformPen(pen, (sc, 0, 0, -sc, x, base))); parts.append(pen.getCommands()); x += GS[n].width * sc
    return " ".join(p for p in parts if p), x - x0

def icon_group(ink, teal, h, x, y, spin=False):
    s = h / BOX
    inner = (f'<path class="kpn-ink" fill="{ink}" fill-rule="evenodd" d="{L["ink"]}"/>'
             f'<path class="kpn-star" fill="{teal}" fill-rule="evenodd" d="{L["star"]}"/>')
    inner = f'<g class="kpn-logo-spin">{inner}</g>' if spin else inner
    return f'<g transform="translate({x:g} {y:g}) scale({s:.5f}) translate({-X0:g} {-Y0:g})">{inner}</g>'

def lockup(ink, teal, spin=False):
    H, GAP, SIZE = 128, 24, 70
    base = H / 2 + CAP * SIZE / 2
    d, tw = word(SIZE, H + GAP, base)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {H + GAP + tw:.1f} {H}" role="img" aria-labelledby="t">'
            f'<title id="t">KpnSolute</title>{icon_group(ink, teal, H, 0, 0, spin)}<path fill="{ink}" d="{d}"/></svg>\n')

def tile(inner, bg, rx=28):
    return f'<rect width="128" height="128" rx="{rx}" fill="{bg}"/>{inner}'

def favicon_full():
    """Full icon on a white rounded tile (tests how much of the weave survives at 16 px)."""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-labelledby="t"><title id="t">KpnSolute</title>'
            + tile(icon_group(INK, STAR, 120, 4, 4), "#FFFFFF", rx=26) + '</svg>\n')

def favicon_compass():
    """Simplified for tiny sizes: the star and the eye only, on a dark tile (reads on light and dark browser tabs)."""
    R, k = 54, 8.2
    spikes = "".join(f'<path transform="rotate({a} 64 64)" d="M64 {64 - R}L{64 - k} 64L{64 + k} 64Z"/>' for a in (0, 90, 180, 270))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-labelledby="t"><title id="t">KpnSolute</title>'
            + tile("", "#0A0A0A") + f'<g fill="{STAR_D}">{spikes}</g>'
            f'<path d="M64 38L90 64L64 90L38 64Z" fill="#0A0A0A" stroke="#F4F6FA" stroke-width="6" stroke-linejoin="round"/><circle cx="64" cy="64" r="7" fill="#F4F6FA"/></svg>\n')

if __name__ == "__main__":
    out = {
        "kpnsolute-lockup.svg": lockup(INK, STAR),
        "kpnsolute-lockup-on-dark.svg": lockup(INK_D, STAR_D),
        "kpnsolute-favicon.svg": favicon_full(),
    }
    d, tw = word(96, 0, 72); out["kpnsolute-wordmark.svg"] = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {tw + 4:.1f} 118" role="img" aria-labelledby="t"><title id="t">KpnSolute</title><path fill="{INK}" d="{d}"/></svg>\n'
    for n, c in out.items(): open(n, "w").write(c); print("wrote", n, len(c))

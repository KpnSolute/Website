"""KpnSolute icon assets from the traced layers (layers.json). Final artwork supplied by the owner."""
import json
L = json.load(open("layers.json"))
VB = "26 33 1198 1198"                       # square box around the artwork, centred on (625, 632)
CX, CY = 625.0, 632.0
INK, STAR = "#0A0A0A", "#2F5FE0"   # brand blue (the platform accent)
INK_D, STAR_D = "#F4F6FA", "#6D8DFF"   # the dark-theme accent

def paths(ink, teal, cls=True):
    c = lambda n: f' class="kpn-{n}"' if cls else ""
    return (f'<path{c("ink")} fill="{ink}" fill-rule="evenodd" d="{L["ink"]}"/>'
            f'<path{c("teal")} fill="{teal}" fill-rule="evenodd" d="{L["star"]}"/>')

def svg(body, vb=VB, title="KpnSolute", extra=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" aria-labelledby="t"{extra}>'
            f'<title id="t">{title}</title>{body}</svg>\n')

def animated(ink, teal, seconds=40):
    spin = (f'<animateTransform attributeName="transform" type="rotate" from="0 {CX:g} {CY:g}" to="360 {CX:g} {CY:g}" '
            f'dur="{seconds}s" repeatCount="indefinite"/>')
    return svg(f'<g>{paths(ink, teal, cls=False)}{spin}</g>')

if __name__ == "__main__":
    w = lambda n, c: (open(n, "w").write(c), print("wrote", n, len(c)))
    w("kpnsolute-icon.svg", svg(paths(INK, STAR)))
    w("kpnsolute-icon-on-dark.svg", svg(paths(INK_D, STAR_D)))
    w("kpnsolute-icon-mono.svg", svg(paths(INK, INK)))
    w("kpnsolute-icon-white.svg", svg(paths("#FFFFFF", "#FFFFFF")))
    w("kpnsolute-icon-animated.svg", animated(INK, STAR))

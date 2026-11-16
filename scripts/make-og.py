from PIL import Image, ImageDraw, ImageFont
import sys
# Usage: python3 scripts/make-og.py "<name>" "<domain>" [path to DepartureMono .otf/.ttf]
# Regenerates the social preview images in og/. Needs Pillow (pip install pillow).
NAME = sys.argv[1] if len(sys.argv) > 1 else "Md. Al-Amin Rahman Sourav"
DOMAIN = sys.argv[2] if len(sys.argv) > 2 else "sourav.vercel.app"
FONT = sys.argv[3] if len(sys.argv) > 3 else "assets/fonts/DepartureMono-Regular.otf"
W, H = 1200, 627
BG, INK, GREEN, RED, AMBER, MUTED = "#0D0F0E", "#E8E6DF", "#3FD47F", "#FF6B5E", "#F2A900", "#A3A69C"
def font(sz): return ImageFont.truetype(FONT, sz)
def px(d, cells, fill, ox, oy, s):
    for (x, y, w, h) in cells: d.rectangle([ox + x*s, oy + y*s, ox + (x+w)*s - 1, oy + (y+h)*s - 1], fill=fill)
ICONS = {
 "candlestick": [([(4,1,1,3),(4,10,1,4),(2,4,5,6)], GREEN), ([(11,2,1,2),(11,12,1,3),(9,4,5,8)], RED), ([(1,15,14,1)], INK)],
 "die": [([(1,1,14,14)], INK), ([(2,2,12,12)], BG), ([(4,4,2,2),(10,4,2,2),(7,7,2,2),(4,10,2,2),(10,10,2,2)], INK)],
 "ledger": [([(1,2,6,12),(9,2,6,12)], INK), ([(2,3,4,10),(10,3,4,10)], BG), ([(3,5,2,1),(3,7,2,1),(3,9,2,1),(11,5,2,1),(11,7,2,1),(11,9,2,1)], INK), ([(7,7,2,1)], GREEN)],
 "receipt": [([(2,1,9,14)], INK), ([(3,2,7,12)], BG), ([(4,4,5,1),(4,6,5,1),(4,8,3,1)], INK), ([(9,8,5,1),(9,12,5,1),(9,9,1,3),(13,9,1,3),(13,13,1,1),(14,14,1,1)], AMBER)],
}
def card(name, title, sub, icon, out, big=False):
    im = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(im)
    d.rectangle([0,0,W,10], fill=GREEN); d.rectangle([0,H-10,W,H], fill=GREEN)
    # ticker-ish strip
    d.text((40, 36), NAME.split()[-1].upper() + "  ·  finance tools you can use", font=font(22), fill=MUTED)
    if icon: 
        for cells, fill in ICONS[icon]: px(d, cells, fill, 40, 120, 12)
        ty = 340
    else:
        ty = 180
    d.text((40, ty), title, font=font(64 if not big else 72), fill=INK)
    y = ty + 90
    for line in sub:
        d.text((40, y), line, font=font(28), fill=GREEN if line.startswith("▲") else MUTED); y += 40
    d.text((40, H-60), DOMAIN if not icon else f"{DOMAIN}/{out}", font=font(22), fill=MUTED)
    im.save(f"og/{out}.png", optimize=True)
card("home", NAME, ["Finance and Banking graduate", "▲ What's Priced In?   ▲ Make Me a Market", "▲ Recon   ▲ True Cost"], None, "home", big=False)
card("valuation", "What's Priced In?", ["A reverse DCF for any US-listed company.", "What growth is the share price assuming?"], "candlestick", "valuation")
card("market", "Make Me a Market", ["A pixel-art market-making game.", "Spread, adverse selection, inventory risk."], "die", "market")
card("recon", "Recon", ["Match two lists in your browser.", "Nothing is uploaded."], "ledger", "recon")
card("truecost", "True Cost", ["What a loan, EMI or Buy Now Pay Later", "offer really costs."], "receipt", "truecost")
# apple touch icon 180x180
im = Image.new("RGB", (180, 180), "#111111"); d = ImageDraw.Draw(im)
px(d, [(4,2,1,2),(4,9,1,4),(2,4,5,5)], GREEN, 10, 10, 10); px(d, [(11,2,1,2),(11,11,1,3),(9,4,5,7)], RED, 10, 10, 10)
im.save("assets/icons/apple-touch-icon.png")
print("ok")

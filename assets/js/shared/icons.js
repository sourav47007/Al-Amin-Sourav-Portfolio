// Pixel icons drawn as SVG rects on a 16×16 grid. All original.
// Colours come from currentColor plus the two accent variables, so they
// follow the theme.

function px(cells, fill) {
  return cells.map(([x, y, w = 1, h = 1]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`).join("");
}

const wrap = (inner, title) =>
  `<svg viewBox="0 0 16 16" width="24" height="24" role="img" aria-label="${title}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

export const icons = {
  // Candlestick: a green up candle and a red down candle.
  candlestick: wrap(
    px([[4, 1, 1, 3], [4, 10, 1, 4]], "var(--up, #0B8F4D)") +
    px([[2, 4, 5, 6]], "var(--up, #0B8F4D)") +
    px([[11, 2, 1, 2], [11, 12, 1, 3]], "var(--down, #D23B2F)") +
    px([[9, 4, 5, 8]], "var(--down, #D23B2F)") +
    px([[1, 15, 14, 1]], "currentColor"),
    "Candlestick"
  ),
  // Die showing five.
  die: wrap(
    px([[1, 1, 14, 14]], "currentColor") +
    px([[2, 2, 12, 12]], "var(--surface, #fff)") +
    px([[4, 4, 2, 2], [10, 4, 2, 2], [7, 7, 2, 2], [4, 10, 2, 2], [10, 10, 2, 2]], "currentColor"),
    "Die"
  ),
  // Two ledger pages with matching lines.
  ledger: wrap(
    px([[1, 2, 6, 12]], "currentColor") +
    px([[2, 3, 4, 10]], "var(--surface, #fff)") +
    px([[3, 5, 2, 1], [3, 7, 2, 1], [3, 9, 2, 1]], "currentColor") +
    px([[9, 2, 6, 12]], "currentColor") +
    px([[10, 3, 4, 10]], "var(--surface, #fff)") +
    px([[11, 5, 2, 1], [11, 7, 2, 1], [11, 9, 2, 1]], "currentColor") +
    px([[7, 7, 2, 1]], "var(--up, #0B8F4D)"),
    "Ledger pages"
  ),
  // Receipt with a magnifier.
  receipt: wrap(
    px([[2, 1, 9, 14]], "currentColor") +
    px([[3, 2, 7, 12]], "var(--surface, #fff)") +
    px([[4, 4, 5, 1], [4, 6, 5, 1], [4, 8, 3, 1]], "currentColor") +
    px([[2, 14, 1, 1], [4, 14, 1, 1], [6, 14, 1, 1], [8, 14, 1, 1], [10, 14, 1, 1]], "var(--surface, #fff)") +
    px([[9, 8, 5, 1], [9, 12, 5, 1], [9, 9, 1, 3], [13, 9, 1, 3]], "var(--amber, #F2A900)") +
    px([[13, 13, 1, 1], [14, 14, 1, 1]], "var(--amber, #F2A900)"),
    "Receipt with magnifier"
  ),
  // Sun / moon for the theme toggle.
  sun: wrap(px([[6, 6, 4, 4], [7, 2, 2, 2], [7, 12, 2, 2], [2, 7, 2, 2], [12, 7, 2, 2], [3, 3, 2, 2], [11, 3, 2, 2], [3, 11, 2, 2], [11, 11, 2, 2]], "currentColor"), "Light theme"),
  moon: wrap(px([[5, 2, 5, 1], [4, 3, 1, 1], [3, 4, 1, 8], [4, 12, 1, 1], [5, 13, 5, 1], [10, 12, 2, 1], [12, 11, 1, 1], [9, 3, 2, 1], [11, 4, 1, 1]], "currentColor"), "Dark theme")
};

// Standalone favicon (no CSS variables available in a favicon).
export const faviconSvg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">` +
  `<rect width="16" height="16" fill="#111111"/>` +
  px([[4, 2, 1, 2], [4, 9, 1, 4]], "#3FD47F") + px([[2, 4, 5, 5]], "#3FD47F") +
  px([[11, 2, 1, 2], [11, 11, 1, 3]], "#FF6B5E") + px([[9, 4, 5, 7]], "#FF6B5E") +
  `</svg>`;

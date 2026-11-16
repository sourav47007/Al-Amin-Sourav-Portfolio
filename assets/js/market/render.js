// render.js — draws the game scene on a small canvas in original pixel art.
// Logical size 320×180, scaled up by CSS with image-rendering: pixelated.

export const W = 320, H = 180;

// Tiny sprites: rows of characters mapped to palette keys. "." is transparent.
const BOT_INFORMED = [
  "..AAAA..",
  ".AAAAAA.",
  ".AWWAWW.",
  ".AWBAWB.",
  ".AAAAAA.",
  "..AAAA..",
  ".CCCCCC.",
  "CCCCCCCC",
  "CC.CC.CC",
  ".C....C."
];
const BOT_NOISE = [
  "..DDDD..",
  ".DDDDDD.",
  ".DWWDWW.",
  ".DWBDWB.",
  ".DDDDDD.",
  "..DDDD..",
  ".EEEEEE.",
  "EEEEEEEE",
  "EE.EE.EE",
  ".E....E."
];
const PLAYER = [
  "..FFFF..",
  ".FFFFFF.",
  ".FWWFWW.",
  ".FWBFWB.",
  ".FFFFFF.",
  "..FFFF..",
  ".GGGGGG.",
  "GGGGGGGG",
  "GG.GG.GG",
  ".G....G."
];

function palette(c) {
  return {
    A: c.ink, B: c.paper, W: c.surface, C: c.amber, D: c.down, E: c.muted, F: c.up, G: c.ink
  };
}

function sprite(ctx, rows, x, y, pal, scale = 1) {
  rows.forEach((row, j) => {
    [...row].forEach((ch, i) => {
      if (ch === ".") return;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(x + i * scale, y + j * scale, scale, scale);
    });
  });
}

function pixelText(ctx, text, x, y, color, size = 8) {
  ctx.fillStyle = color;
  ctx.font = `${size}px "Departure Mono", monospace`;
  ctx.textBaseline = "top";
  ctx.fillText(text, x, y);
}

function die(ctx, x, y, value, c) {
  ctx.fillStyle = c.ink; ctx.fillRect(x, y, 18, 18);
  ctx.fillStyle = c.surface; ctx.fillRect(x + 1, y + 1, 16, 16);
  const pips = { 1: [[8, 8]], 2: [[4, 4], [12, 12]], 3: [[4, 4], [8, 8], [12, 12]], 4: [[4, 4], [12, 4], [4, 12], [12, 12]], 5: [[4, 4], [12, 4], [8, 8], [4, 12], [12, 12]], 6: [[4, 4], [12, 4], [4, 8], [12, 8], [4, 12], [12, 12]] };
  ctx.fillStyle = c.ink;
  for (const [px, py] of pips[value] || []) ctx.fillRect(x + px - 1, y + py - 1, 3, 3);
}
function dieBack(ctx, x, y, c, label) {
  ctx.fillStyle = c.ink; ctx.fillRect(x, y, 18, 18);
  ctx.fillStyle = c.grid; ctx.fillRect(x + 1, y + 1, 16, 16);
  pixelText(ctx, label, x + 6, y + 5, c.muted, 8);
}
function card(ctx, x, y, value, c, highlight) {
  ctx.fillStyle = c.ink; ctx.fillRect(x, y, 18, 24);
  ctx.fillStyle = highlight ? c.amber : c.surface; ctx.fillRect(x + 1, y + 1, 16, 22);
  pixelText(ctx, String(value), x + (value >= 10 ? 2 : 5), y + 8, c.ink, 8);
}
function cardBack(ctx, x, y, c, label, flagged) {
  ctx.fillStyle = c.ink; ctx.fillRect(x, y, 18, 24);
  ctx.fillStyle = flagged ? c.amber : c.grid; ctx.fillRect(x + 1, y + 1, 16, 22);
  ctx.fillStyle = c.ink;
  for (let j = 3; j < 22; j += 4) for (let i = 3; i < 16; i += 4) ctx.fillRect(x + i, y + j, 1, 1);
  pixelText(ctx, label, x + 6, y + 8, c.ink, 8);
}

export function draw(canvas, state, view, colors) {
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const c = colors, pal = palette(c);
  ctx.fillStyle = c.paper; ctx.fillRect(0, 0, W, H);
  // table
  ctx.fillStyle = c.grid; ctx.fillRect(8, 56, W - 16, 70);
  ctx.fillStyle = c.ink; ctx.fillRect(8, 56, W - 16, 2); ctx.fillRect(8, 124, W - 16, 2);

  // header strip
  pixelText(ctx, `LEVEL ${state.level.id}  STEP ${Math.min(state.step + 1, state.level.items)}/${state.level.items}`, 10, 6, c.ink, 8);
  pixelText(ctx, `CASH ${fmt(state.cash)}  INV ${state.inventory > 0 ? "+" : ""}${state.inventory}`, 170, 6, c.ink, 8);

  // items on the table
  const n = state.level.items;
  const isDice = state.level.kind === "dice";
  const slotW = isDice ? 18 : 18, gap = 10;
  const totalW = n * slotW + (n - 1) * gap;
  const x0 = Math.round((W - totalW) / 2);
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (slotW + gap), y = isDice ? 80 : 76;
    if (i < state.revealed.length) {
      if (isDice) die(ctx, x, y, state.revealed[i], c); else card(ctx, x, y, state.revealed[i], c, false);
    } else {
      const flagged = state.news && state.news.index === i;
      if (isDice) dieBack(ctx, x, y, c, "?"); else cardBack(ctx, x, y, c, "?", flagged);
    }
  }
  // sum of revealed so far
  const rs = state.revealed.reduce((a, b) => a + b, 0);
  pixelText(ctx, `shown: ${rs}`, x0, 108, c.muted, 8);

  // bots on the left / right, player at the bottom
  state.bots.forEach((b, i) => {
    const bx = i === 0 ? 20 : W - 36, by = 24;
    sprite(ctx, b.type === "informed" ? BOT_INFORMED : BOT_NOISE, bx, by, pal, 2);
    pixelText(ctx, b.type === "informed" ? "INFO" : "NOISE", bx - 2, by + 22, c.muted, 8);
    const say = view.bubbles && view.bubbles[b.id];
    if (say) {
      const tx = i === 0 ? bx + 20 : bx - 8 - say.length * 6;
      ctx.fillStyle = c.surface; ctx.fillRect(tx - 2, by + 2, say.length * 6 + 4, 12);
      ctx.fillStyle = c.ink; ctx.strokeStyle = c.ink; ctx.lineWidth = 1; ctx.strokeRect(tx - 1.5, by + 2.5, say.length * 6 + 3, 11);
      pixelText(ctx, say, tx, by + 4, say.startsWith("BUY") ? c.up : say.startsWith("SELL") ? c.down : c.muted, 8);
    }
  });
  sprite(ctx, PLAYER, Math.round(W / 2) - 8, 134, pal, 2);
  pixelText(ctx, "YOU", Math.round(W / 2) - 8, 156, c.muted, 8);

  // quote board
  const q = view.quote;
  ctx.fillStyle = c.ink; ctx.fillRect(10, 132, 120, 36);
  ctx.fillStyle = c.paper; ctx.fillRect(11, 133, 118, 34);
  pixelText(ctx, "BID", 16, 136, c.muted, 8); pixelText(ctx, "ASK", 76, 136, c.muted, 8);
  pixelText(ctx, q ? String(q.bid) : "--", 16, 148, c.up, 12); pixelText(ctx, q ? String(q.ask) : "--", 76, 148, c.down, 12);

  // news / status banner on the right
  if (view.banner) {
    ctx.fillStyle = c.ink; ctx.fillRect(W - 130, 132, 120, 36);
    ctx.fillStyle = c.amber; ctx.fillRect(W - 129, 133, 118, 34);
    const lines = wrap(view.banner, 19);
    lines.slice(0, 3).forEach((l, i) => pixelText(ctx, l, W - 125, 136 + i * 10, c.paper === "#F7F5EF" ? "#111111" : "#0D0F0E", 8));
  }
  if (state.over) {
    ctx.fillStyle = c.surface; ctx.fillRect(90, 40, 140, 14);
    pixelText(ctx, `TRUE VALUE ${state.trueValue}`, 96, 43, c.ink, 8);
  }
}

function fmt(v) { return (v >= 0 ? "+" : "") + (Number.isInteger(v) ? v : v.toFixed(1)); }
function wrap(text, width) {
  const words = text.split(" "), lines = []; let cur = "";
  for (const w of words) { if ((cur + " " + w).trim().length > width) { lines.push(cur.trim()); cur = w; } else cur += " " + w; }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

// Share card: 600×315 PNG drawn in the same style.
export function shareCard(canvas, { score, level, pnl, name, url, colors: c }) {
  const ctx = canvas.getContext("2d");
  canvas.width = 600; canvas.height = 315;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#0D0F0E"; ctx.fillRect(0, 0, 600, 315);
  ctx.fillStyle = "#3FD47F"; ctx.fillRect(0, 0, 600, 6); ctx.fillRect(0, 309, 600, 6);
  ctx.fillStyle = "#E8E6DF"; ctx.font = '28px "Departure Mono", monospace'; ctx.textBaseline = "top";
  ctx.fillText("MAKE ME A MARKET", 32, 40);
  ctx.font = '18px "Departure Mono", monospace'; ctx.fillStyle = "#A3A69C";
  ctx.fillText(`Level ${level}`, 32, 84);
  ctx.fillStyle = "#3FD47F"; ctx.font = '72px "Departure Mono", monospace';
  ctx.fillText(String(score), 32, 120);
  ctx.fillStyle = "#E8E6DF"; ctx.font = '18px "Departure Mono", monospace';
  ctx.fillText(`P&L ${pnl >= 0 ? "+" : ""}${pnl.toFixed(1)} points`, 32, 205);
  ctx.fillStyle = "#A3A69C"; ctx.fillText(name ? `${name} · ${url}` : url, 32, 268);
  const pal = { A: "#E8E6DF", B: "#0D0F0E", W: "#FFFFFF", C: "#F2A900", D: "#FF6B5E", E: "#A3A69C", F: "#3FD47F", G: "#E8E6DF" };
  sprite(ctx, PLAYER, 470, 100, pal, 8);
}

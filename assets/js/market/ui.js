// ui.js — Make Me a Market: wires the engine to the canvas and the controls.
import { LEVELS, newGame, quote, settle, score, conditional, stats, validateQuote } from "./engine.js";
import { draw, shareCard, W, H } from "./render.js";
import { themeColors } from "/assets/js/shared/chart-theme.js";
import { site } from "/content/site.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

const canvas = $("#game");
canvas.width = W; canvas.height = H;
// Scale by a whole number so every logical pixel is a crisp block.
function fitCanvas() {
  const avail = canvas.parentElement.clientWidth - 4;
  // Below 2× (phones) use a fractional scale so the scene fills the width.
  const k = avail >= 2 * W ? Math.floor(avail / W) : Math.max(0.5, avail / W);
  canvas.style.width = (k * W) + "px"; canvas.style.height = (k * H) + "px";
}
new ResizeObserver(fitCanvas).observe(canvas.parentElement);
fitCanvas();
let level = LEVELS[0], game = null, view = { bubbles: {}, quote: null, banner: "" };
let teach = false, sound = false, audio = null;

// ---------- storage (wrapped: private mode / disabled storage must not break the game) ----------
const KEY = "mmm-highscores";
function loadScores() { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } }
function saveScore(lvl, sc) {
  try {
    const all = loadScores();
    const list = (all[lvl] || []).concat([{ score: sc, date: new Date().toISOString().slice(0, 10) }]).sort((a, b) => b.score - a.score).slice(0, 5);
    all[lvl] = list; localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

// ---------- sound (off by default) ----------
function beep(freq = 440, ms = 60) {
  if (!sound) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = "square"; o.frequency.value = freq; g.gain.value = 0.05;
    o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + ms / 1000);
  } catch { /* no audio */ }
}

// ---------- game flow ----------
function start(lvlId) {
  level = LEVELS.find(l => l.id === Number(lvlId)) || LEVELS[0];
  game = newGame(level, Date.now());
  view = { bubbles: {}, quote: null, banner: "" };
  $("#log").innerHTML = "";
  $("#teach").innerHTML = "";
  $("#end").hidden = true;
  $("#controls").hidden = false;
  const ev = stats(conditional(level, game)).ev;
  $("#bid").value = Math.floor(ev) - 1; $("#ask").value = Math.floor(ev) + 2;
  $("#bid").max = 200; $("#ask").max = 200;
  $("#level-blurb").textContent = `${level.name}: ${level.blurb} Max spread ${level.maxSpread}${level.positionLimit != null ? `, position limit ±${level.positionLimit}` : ""}.`;
  log(`New market. ${level.kind === "dice" ? "The value is the sum of 3 dice (3–18)." : `The value is the sum of ${level.items} cards from a deck of 1–10, four of each.`} Quote a bid and an ask.`);
  if (teach) teachNote();
  render();
}

function render() { draw(canvas, game, view, themeColors()); }

function log(html, cls = "") {
  const el = document.createElement("div");
  el.className = "log__line " + cls; el.innerHTML = html;
  $("#log").prepend(el);
}

function teachNote() {
  const s = stats(conditional(level, game));
  const last = game.quotes[game.quotes.length - 1];
  let cmp = "";
  if (last) {
    const mid = (last.bid + last.ask) / 2;
    const off = mid - last.ev;
    cmp = `<p>Your last quote ${last.bid}/${last.ask} had a mid of ${mid.toFixed(1)} against an expected value of ${last.ev.toFixed(2)} at the time: ${Math.abs(off) < 0.5 ? "well centred" : off > 0 ? `${off.toFixed(1)} too high (you were inviting sellers)` : `${(-off).toFixed(1)} too low (you were inviting buyers)`}.</p>`;
  }
  $("#teach").innerHTML = `<p class="panel__title">Teaching mode</p>
    <p>Expected value now: <b class="num">${s.ev.toFixed(2)}</b> · possible range <b class="num">${s.min}–${s.max}</b> · standard deviation <b class="num">${s.sd.toFixed(2)}</b>.${game.news ? ` ${esc(game.news.text)}` : ""}</p>${cmp}
    <p class="small muted">A fair two-sided quote straddles the EV. The wider you quote, the more you earn per trade but the fewer trades you get; the narrower, the more the informed bot picks you off.</p>`;
}

function submitQuote() {
  if (!game || game.over) return;
  const bid = Number($("#bid").value), ask = Number($("#ask").value);
  const err = validateQuote(level, game, bid, ask);
  if (err) { $("#quote-error").textContent = err; beep(160, 120); return; }
  $("#quote-error").textContent = "";
  view.quote = { bid, ask };
  const r = quote(game, bid, ask);
  view.bubbles = {};
  for (const e of r.events) {
    if (e.action === "news") { view.banner = e.text; log(`<b>${esc(e.text)}</b>`, "log__news"); beep(660, 120); continue; }
    const who = e.type === "informed" ? "Informed bot" : "Noise bot";
    if (e.action === "buy") { view.bubbles[e.bot] = `BUY @${e.price}`; log(`${who} <span class="down">buys from you</span> at your ask ${e.price}. You are now ${inv()}.`); beep(520); }
    else if (e.action === "sell") { view.bubbles[e.bot] = `SELL @${e.price}`; log(`${who} <span class="up">sells to you</span> at your bid ${e.price}. You are now ${inv()}.`); beep(380); }
    else if (e.action === "blocked") { view.bubbles[e.bot] = "LIMIT"; log(`${who} wanted to ${e.side}, but your position limit blocked the trade.`); }
    else { view.bubbles[e.bot] = "..."; log(`${who} passes.`, "muted"); }
  }
  log(`${level.kind === "dice" ? "Die" : "Card"} ${game.revealed.length} revealed: <b>${r.revealed}</b>. Shown so far: ${game.revealed.reduce((a, b) => a + b, 0)}.`);
  if (teach) teachNote();
  if (game.over) finish(); else {
    const ev = stats(conditional(level, game)).ev;
    // Nudge the inputs toward the new EV but keep the player's spread.
    const spread = Math.min(level.maxSpread, ask - bid);
    $("#bid").value = Math.max(0, Math.round(ev - spread / 2)); $("#ask").value = Math.round(ev + spread / 2) + (spread % 2 === 1 ? 0 : 0);
    if (Number($("#ask").value) - Number($("#bid").value) < 1) $("#ask").value = Number($("#bid").value) + 1;
  }
  render();
}

function inv() { return game.inventory === 0 ? "flat" : game.inventory > 0 ? `long ${game.inventory}` : `short ${-game.inventory}`; }

function finish() {
  const s = settle(game), sc = score(s);
  saveScore(level.id, sc);
  $("#controls").hidden = true;
  $("#end").hidden = false;
  $("#end-summary").innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="kpi__label">True value</div><div class="kpi__value">${s.trueValue}</div></div>
      <div class="kpi"><div class="kpi__label">P&L</div><div class="kpi__value ${s.pnl > 0 ? "up" : s.pnl < 0 ? "down" : ""}">${s.pnl >= 0 ? "+" : ""}${s.pnl.toFixed(1)}</div><div class="kpi__sub">cash ${s.cash.toFixed(1)} + ${s.inventory} × ${s.trueValue}</div></div>
      <div class="kpi"><div class="kpi__label">Score</div><div class="kpi__value">${sc}</div><div class="kpi__sub">P&L × 10</div></div>
    </div>
    ${teach ? `<div class="panel panel--flat"><p class="panel__title">Breakdown</p>
      <table><tbody>
      <tr><td>Spread capture</td><td class="num ${s.spreadCapture >= 0 ? "up" : "down"}">${s.spreadCapture.toFixed(2)}</td><td class="small muted">what you earned by quoting around the expected value at the time of each trade</td></tr>
      <tr><td>Adverse selection</td><td class="num ${s.adverseSelection >= 0 ? "up" : "down"}">${s.adverseSelection.toFixed(2)}</td><td class="small muted">how the true value moved against the positions you were given (the informed bot's edge)</td></tr>
      <tr><td>Peak inventory</td><td class="num">${s.peakInventory}</td><td class="small muted">largest position you carried; risk you were exposed to</td></tr>
      <tr><td>Trades</td><td class="num">${s.trades}</td><td></td></tr>
      </tbody></table></div>` : ""}`;
  renderScores();
  beep(s.pnl >= 0 ? 880 : 220, 200);
}

function renderScores() {
  const all = loadScores();
  const box = $("#scores");
  const rows = LEVELS.map(l => `<tr><td>Level ${l.id}</td><td class="num">${(all[l.id] || []).map(x => x.score).join(" · ") || "—"}</td></tr>`).join("");
  box.innerHTML = `<table><thead><tr><th>Level</th><th class="num">Best scores (this browser)</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function share() {
  const s = settle(game), sc = score(s);
  const c = document.createElement("canvas");
  await document.fonts.ready;
  shareCard(c, { score: sc, level: level.id, pnl: s.pnl, name: site.shortName, url: site.url.replace(/^https?:\/\//, "") + "/market", colors: themeColors() });
  const blob = await new Promise(res => c.toBlob(res, "image/png"));
  const file = new File([blob], "make-me-a-market-score.png", { type: "image/png" });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "My Make Me a Market score", text: `I scored ${sc} on level ${level.id}` }); return; } catch { /* fall through to download */ }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  $("#share-preview").innerHTML = `<img src="${a.href}" alt="Share card: score ${sc} on level ${level.id}" style="width:100%;max-width:400px;border:2px solid var(--ink)">`;
}

// ---------- init ----------
function init() {
  $("#level").innerHTML = LEVELS.map(l => `<option value="${l.id}">Level ${l.id}: ${esc(l.name)}</option>`).join("");
  $("#level").addEventListener("change", e => start(e.target.value));
  $("#new").addEventListener("click", () => start($("#level").value));
  $("#next").addEventListener("click", () => { const nx = Math.min(4, level.id + 1); $("#level").value = nx; start(nx); });
  $("#again").addEventListener("click", () => start(level.id));
  $("#quote").addEventListener("click", submitQuote);
  $$("[data-adj]").forEach(b => b.addEventListener("click", () => {
    const [field, d] = b.dataset.adj.split(":"); const el = $("#" + field);
    el.value = Math.max(0, Number(el.value) + Number(d)); el.focus();
  }));
  ["bid", "ask"].forEach(id => $("#" + id).addEventListener("keydown", e => { if (e.key === "Enter") submitQuote(); }));
  document.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "b") $("#bid").focus(); else if (e.key === "a") $("#ask").focus();
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (game && game.over) $("#again").click(); else submitQuote(); }
  });
  $("#teach-toggle").addEventListener("change", e => { teach = e.target.checked; if (teach && game) teachNote(); else $("#teach").innerHTML = ""; });
  $("#sound-toggle").addEventListener("change", e => { sound = e.target.checked; });
  $("#share").addEventListener("click", share);
  document.addEventListener("themechange", render);
  renderScores();
  start(1);
}
init();

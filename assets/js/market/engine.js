// engine.js — rules of Make Me a Market. Pure, seeded, no DOM.
//
// A "market" is one hidden value: the sum of N dice or N cards. The player
// quotes a bid and an ask, bots trade one unit each against the quote, one
// item is revealed, the player re-quotes, and so on until every item is
// revealed. Then P&L = cash + inventory × true value.

export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const LEVELS = [
  { id: 1, name: "Three dice, one bot", kind: "dice", items: 3, bots: ["informed"], maxSpread: 4, positionLimit: null, news: false,
    blurb: "The value is the sum of three dice. One bot has seen a die you haven't." },
  { id: 2, name: "Three cards, two bots", kind: "cards", items: 3, bots: ["informed", "noise"], maxSpread: 5, positionLimit: null, news: false,
    blurb: "Cards 1–10, four of each, no replacement. One bot is informed, one is noise." },
  { id: 3, name: "Cards plus news", kind: "cards", items: 4, bots: ["informed", "noise"], maxSpread: 5, positionLimit: null, news: true,
    blurb: "Four cards. After the first reveal, news arrives about one hidden card." },
  { id: 4, name: "Limits and a tight spread", kind: "cards", items: 4, bots: ["informed", "noise"], maxSpread: 3, positionLimit: 3, news: true,
    blurb: "Same as level 3, but you may hold at most 3 units either way and quote at most 3 wide." }
];

// ---------- distributions ----------
// Returns an array of {value, prob} for one die or one card drawn from `deck`.
function dieDist() { return [1, 2, 3, 4, 5, 6].map(v => ({ value: v, prob: 1 / 6 })); }
function cardDist(deck) {
  const n = deck.length, counts = new Map();
  for (const c of deck) counts.set(c, (counts.get(c) || 0) + 1);
  return [...counts].map(([value, k]) => ({ value, prob: k / n })).sort((a, b) => a.value - b.value);
}

// Distribution of the sum of `k` independent draws (cards: approximated as
// with-replacement from the remaining deck, which is close for a 40-card deck).
export function sumDist(single, k) {
  let dist = new Map([[0, 1]]);
  for (let i = 0; i < k; i++) {
    const next = new Map();
    for (const [s, p] of dist) for (const { value, prob } of single) next.set(s + value, (next.get(s + value) || 0) + p * prob);
    dist = next;
  }
  return [...dist].map(([value, prob]) => ({ value, prob })).sort((a, b) => a.value - b.value);
}

export function stats(dist) {
  const ev = dist.reduce((s, d) => s + d.value * d.prob, 0);
  const varr = dist.reduce((s, d) => s + (d.value - ev) ** 2 * d.prob, 0);
  return { ev, sd: Math.sqrt(varr), min: dist[0].value, max: dist[dist.length - 1].value };
}

// Conditional distribution of the total given revealed items, the remaining
// deck (cards) and any news constraint on a specific hidden item.
export function conditional(level, state) {
  const revealedSum = state.revealed.reduce((a, b) => a + b, 0);
  const hiddenCount = level.items - state.revealed.length;
  const single = level.kind === "dice" ? dieDist() : cardDist(state.deck);
  // News: one hidden item is constrained to a range. Treat it separately.
  let dist;
  if (state.news && state.news.index >= state.revealed.length) {
    const constrained = single.filter(d => d.value >= state.news.min && d.value <= state.news.max);
    const z = constrained.reduce((s, d) => s + d.prob, 0) || 1;
    const cDist = constrained.map(d => ({ value: d.value, prob: d.prob / z }));
    const rest = sumDist(single, hiddenCount - 1);
    const merged = new Map();
    for (const a of cDist) for (const b of rest) merged.set(a.value + b.value, (merged.get(a.value + b.value) || 0) + a.prob * b.prob);
    dist = [...merged].map(([value, prob]) => ({ value, prob })).sort((a, b) => a.value - b.value);
  } else {
    dist = sumDist(single, hiddenCount);
  }
  return dist.map(d => ({ value: d.value + revealedSum, prob: d.prob }));
}

// ---------- game state ----------
export function newGame(level, seed = Date.now()) {
  const rnd = mulberry32(seed);
  let items, deck = [];
  if (level.kind === "dice") {
    items = Array.from({ length: level.items }, () => 1 + Math.floor(rnd() * 6));
  } else {
    deck = [];
    for (let v = 1; v <= 10; v++) for (let k = 0; k < 4; k++) deck.push(v);
    items = [];
    for (let i = 0; i < level.items; i++) { const j = Math.floor(rnd() * deck.length); items.push(deck.splice(j, 1)[0]); }
  }
  // Each bot's private information: the informed bot sees one hidden item
  // (the last to be revealed, so its edge lasts longest).
  const bots = level.bots.map((type, i) => ({ id: i, type, sees: type === "informed" ? level.items - 1 : null }));
  let news = null;
  if (level.news) {
    const idx = level.items - 1;                   // about the last card
    const v = items[idx];
    news = v >= 6 ? { index: idx, min: 6, max: 10, text: "News: the last card is high (6 or more)." }
                  : { index: idx, min: 1, max: 5, text: "News: the last card is low (5 or less)." };
  }
  return {
    level, seed, rnd, items, deck, revealed: [], step: 0, news: null, pendingNews: news,
    cash: 0, inventory: 0, trades: [], quotes: [], bots, over: false, trueValue: items.reduce((a, b) => a + b, 0),
    peakInventory: 0
  };
}

export function validateQuote(level, state, bid, ask) {
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return "Enter numbers for bid and ask.";
  if (bid < 0) return "Bid cannot be negative.";
  if (ask <= bid) return "Ask must be above bid.";
  if (ask - bid > level.maxSpread) return `Spread cannot exceed ${level.maxSpread}.`;
  return null;
}

// Expected total given what is revealed, the news, and any items `known`
// privately ({ index: value }).
export function expectedTotal(level, state, known = {}) {
  const single = level.kind === "dice" ? dieDist() : cardDist(state.deck);
  const singleEv = single.reduce((s, d) => s + d.value * d.prob, 0);
  let total = state.revealed.reduce((a, b) => a + b, 0);
  for (let i = state.revealed.length; i < level.items; i++) {
    if (i in known) total += known[i];
    else if (state.news && state.news.index === i) total += constrainedEv(level, state);
    else total += singleEv;
  }
  return total;
}

// Bot decision given its private info and the public conditional distribution.
// Documented on /market/bots.
export function botDecision(bot, level, state, bid, ask, rnd) {
  const pub = stats(conditional(level, state));
  let est, edge;
  if (bot.type === "informed") {
    const known = (bot.sees != null && bot.sees >= state.revealed.length) ? { [bot.sees]: state.items[bot.sees] } : {};
    est = expectedTotal(level, state, known);
    edge = 0.25;                                   // trades only when the quote is clearly off
  } else {
    est = pub.ev + gaussian(rnd) * Math.max(1, pub.sd) * 1.2;   // a noisy view around the public EV
    edge = 0;
  }
  if (est > ask + edge) return { action: "buy", price: ask, est };
  if (est < bid - edge) return { action: "sell", price: bid, est };
  return { action: "pass", est };
}

function constrainedEv(level, state) {
  const single = level.kind === "dice" ? dieDist() : cardDist(state.deck);
  const c = single.filter(d => d.value >= state.news.min && d.value <= state.news.max);
  const z = c.reduce((s, d) => s + d.prob, 0) || 1;
  return c.reduce((s, d) => s + d.value * d.prob, 0) / z;
}

function gaussian(rnd) {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** The player posts a quote; every bot acts once; then one item is revealed. */
export function quote(state, bid, ask) {
  const level = state.level;
  const err = validateQuote(level, state, bid, ask);
  if (err) throw new Error(err);
  if (state.over) throw new Error("Game over.");
  const pub = stats(conditional(level, state));
  state.quotes.push({ step: state.step, bid, ask, ev: pub.ev, min: pub.min, max: pub.max });
  const events = [];
  for (const bot of state.bots) {
    const d = botDecision(bot, level, state, bid, ask, state.rnd);
    if (d.action === "pass") { events.push({ bot: bot.id, type: bot.type, action: "pass" }); continue; }
    // Position limits: refuse the trade that would breach them.
    const nextInv = state.inventory + (d.action === "buy" ? -1 : 1);
    if (level.positionLimit != null && Math.abs(nextInv) > level.positionLimit) {
      events.push({ bot: bot.id, type: bot.type, action: "blocked", side: d.action });
      continue;
    }
    if (d.action === "buy") { state.cash += ask; state.inventory -= 1; }
    else { state.cash -= bid; state.inventory += 1; }
    state.peakInventory = Math.max(state.peakInventory, Math.abs(state.inventory));
    const t = { step: state.step, bot: bot.id, type: bot.type, action: d.action, price: d.price, evAtTime: pub.ev };
    state.trades.push(t);
    events.push({ ...t });
  }
  // Reveal the next item.
  const v = state.items[state.revealed.length];
  state.revealed.push(v);
  if (level.kind === "cards") { const j = state.deck.indexOf(v); if (j >= 0) state.deck.splice(j, 1); }
  // News arrives after the first reveal.
  if (state.pendingNews && state.revealed.length === 1) { state.news = state.pendingNews; state.pendingNews = null; events.push({ action: "news", text: state.news.text }); }
  state.step++;
  if (state.revealed.length === level.items) state.over = true;
  return { events, revealed: v, over: state.over };
}

// ---------- settlement & teaching breakdown ----------
export function settle(state) {
  const V = state.trueValue;
  const pnl = state.cash + state.inventory * V;
  let spread = 0, adverse = 0;
  for (const t of state.trades) {
    if (t.action === "buy") {          // bot bought at our ask: we are short one unit
      spread += t.price - t.evAtTime;
      adverse += t.evAtTime - V;
    } else {                            // bot sold at our bid: we are long one unit
      spread += t.evAtTime - t.price;
      adverse += V - t.evAtTime;
    }
  }
  return { pnl, spreadCapture: spread, adverseSelection: adverse, peakInventory: state.peakInventory, trades: state.trades.length, trueValue: V, cash: state.cash, inventory: state.inventory };
}

// Score: P&L scaled so that a flat game is 0 and typical good play is in the hundreds.
export function score(settlement) { return Math.round(settlement.pnl * 10); }

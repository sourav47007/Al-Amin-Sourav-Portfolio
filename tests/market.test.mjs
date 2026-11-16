import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVELS, newGame, quote, settle, conditional, stats, validateQuote, expectedTotal, sumDist } from "../assets/js/market/engine.js";

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `expected ${a} ≈ ${b}`);

test("three dice: EV 10.5, range 3–18; conditional on a revealed 6 the EV is 13", () => {
  const g = newGame(LEVELS[0], 1);
  const s = stats(conditional(LEVELS[0], g));
  close(s.ev, 10.5); assert.equal(s.min, 3); assert.equal(s.max, 18);
  g.revealed = [6];
  close(stats(conditional(LEVELS[0], g)).ev, 13);
});

test("sumDist probabilities sum to 1", () => {
  const d = sumDist([1, 2, 3, 4, 5, 6].map(v => ({ value: v, prob: 1 / 6 })), 3);
  close(d.reduce((s, x) => s + x.prob, 0), 1);
});

test("quote validation enforces spread and ordering", () => {
  const g = newGame(LEVELS[0], 2);
  assert.equal(validateQuote(LEVELS[0], g, 9, 12), null);
  assert.match(validateQuote(LEVELS[0], g, 9, 14), /Spread/);
  assert.match(validateQuote(LEVELS[0], g, 12, 11), /Ask must be above/);
});

test("settlement P&L = cash + inventory × true value, and the breakdown adds up", () => {
  const g = newGame(LEVELS[1], 7);
  while (!g.over) {
    const ev = stats(conditional(g.level, g)).ev;
    quote(g, Math.floor(ev) - 1, Math.floor(ev) + 2);
  }
  const s = settle(g);
  close(s.pnl, g.cash + g.inventory * g.trueValue);
  close(s.spreadCapture + s.adverseSelection, s.pnl);
  assert.equal(g.revealed.reduce((a, b) => a + b, 0), g.trueValue);
});

test("hand-checked settlement: short one at 12, true value 10 → P&L +2", () => {
  const g = newGame(LEVELS[0], 3);
  g.items = [3, 3, 4]; g.trueValue = 10;
  // Simulate a bot buying at our ask of 12 and nothing else.
  g.cash = 12; g.inventory = -1; g.trades = [{ action: "buy", price: 12, evAtTime: 10.5 }];
  const s = settle(g);
  close(s.pnl, 2);
  close(s.spreadCapture, 1.5);     // 12 − 10.5
  close(s.adverseSelection, 0.5);  // 10.5 − 10
});

test("informed bot buys when its private card makes the value exceed the ask", () => {
  const g = newGame(LEVELS[0], 11);
  g.items = [6, 6, 6]; g.trueValue = 18;
  const est = expectedTotal(g.level, g, { 2: 6 });
  close(est, 3.5 + 3.5 + 6);
  const r = quote(g, 9, 11);          // ask 11 < 13 → informed bot buys
  assert.ok(r.events.some(e => e.type === "informed" && e.action === "buy"));
  assert.equal(g.inventory, -1); assert.equal(g.cash, 11);
});

test("position limits block trades beyond the limit", () => {
  const lvl = LEVELS[3];
  const g = newGame(lvl, 5);
  g.inventory = -3; g.items = [10, 10, 10, 10]; g.trueValue = 40; g.deck = g.deck.filter(() => true);
  const r = quote(g, 1, 4);           // far too low: informed bot wants to buy, but we are at the short limit
  assert.ok(r.events.some(e => e.action === "blocked"));
  assert.equal(g.inventory, -3);
});

test("news constrains the last card and moves the conditional EV", () => {
  const lvl = LEVELS[2];
  const g = newGame(lvl, 9);
  const before = stats(conditional(lvl, g)).ev;
  quote(g, Math.floor(before) - 2, Math.floor(before) + 2);   // first reveal triggers news
  assert.ok(g.news, "news should have arrived");
  const ev = stats(conditional(lvl, g)).ev;
  const noNews = expectedTotal(lvl, { ...g, news: null });
  if (g.news.min === 6) assert.ok(ev > noNews); else assert.ok(ev < noNews);
});

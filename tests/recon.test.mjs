import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcile, jaroWinkler, normaliseRef, subsetSum, ageing } from "../assets/js/recon/match.js";
import { toRecords, parseAmount, parseDate } from "../assets/js/recon/parse.js";
import { generateSample, SAMPLE_MAPPING } from "../assets/js/recon/sample.js";

function run(n) {
  const s = generateSample(n);
  const A = toRecords(s.a, SAMPLE_MAPPING.a, "A").records;
  const B = toRecords(s.b, SAMPLE_MAPPING.b, "B").records;
  const res = reconcile(A, B);
  const idA = new Map(A.map(r => [r.raw["Invoice No"], r.id]));
  const idB = new Map(B.map(r => [r.raw["Bank Txn ID"], r.id]));
  return { s, A, B, res, idA, idB };
}

test("normaliseRef treats INV-2026-1023, inv/2026/1023 and 'Payment for INV-2026-1023' as the same", () => {
  const n = normaliseRef("INV-2026-1023");
  assert.equal(normaliseRef("inv/2026/1023"), n);
  assert.equal(normaliseRef("Payment for INV-2026-1023"), n);
});

test("Jaro-Winkler: identical 1, typo close to 1, unrelated low", () => {
  assert.equal(jaroWinkler("2026 1023", "2026 1023"), 1);
  assert.ok(jaroWinkler("2026 1023", "2026 1O23") > 0.9);
  assert.ok(jaroWinkler("2026 1023", "ADVANCE") < 0.5);
});

test("subsetSum finds 2–4 items within tolerance and respects the size bound", () => {
  assert.deepEqual(subsetSum([50, 30, 20, 10], 30.01, 0.05, 4).map(i => [50, 30, 20, 10][i]).sort(), [10, 20]);
  assert.equal(subsetSum([1, 1, 1, 1, 1], 5, 0, 4), null);
  assert.ok(subsetSum([1, 1, 1, 1, 1], 5, 0, 5));
});

test("amount and date parsing handle common bank formats", () => {
  assert.equal(parseAmount("1,234.50"), 1234.5);
  assert.equal(parseAmount("(250.00)"), -250);
  assert.equal(parseAmount("1.234,50"), 1234.5);
  assert.equal(parseAmount("৳ 12,000"), 12000);
  assert.equal(parseDate("2026-11-16"), Date.UTC(2026, 10, 16));
  assert.equal(parseDate("16/11/2026"), Date.UTC(2026, 10, 16));
  assert.equal(parseDate("11/16/2026"), Date.UTC(2026, 10, 16));   // unambiguous
  assert.equal(parseDate("03/04/2026", true), Date.UTC(2026, 3, 3)); // day-first
  assert.equal(parseDate("03/04/2026", false), Date.UTC(2026, 2, 4)); // month-first
  assert.equal(parseDate("16 Nov 2026"), Date.UTC(2026, 10, 16));
});

test("synthetic sample: every expected match is found with the expected rule", () => {
  const { s, res, idA, idB } = run(60);
  const found = res.matches.map(m => ({ rule: m.rule, a: [...m.a].sort().join(","), b: [...m.b].sort().join(",") }));
  const misses = [];
  for (const e of s.expected) {
    const a = e.a.map(x => idA.get(x)).sort().join(",");
    const b = e.b.map(x => idB.get(x)).sort().join(",");
    let hit = found.find(f => f.a === a && f.b === b);
    if (!hit && e.duplicate) hit = found.find(f => f.a === a && f.b === idB.get(e.duplicate)); // either copy may be the one matched
    if (!hit) misses.push(`${e.why}: ${e.a} ↔ ${e.b} not matched`);
    else if (hit.rule !== e.rule) misses.push(`${e.why}: matched by rule ${hit.rule}, expected ${e.rule}`);
  }
  assert.deepEqual(misses, []);
  // Duplicate payment flagged
  const dupExpected = s.expected.find(e => e.duplicate);
  assert.ok(res.duplicatesB.some(d => d.id === idB.get(dupExpected.duplicate) || d.id === idB.get(dupExpected.b[0])));
  // Unmatched counts: aged invoices on A; stray payments + the duplicate on B
  assert.equal(res.unmatchedA.length, s.counts.aged);
  assert.equal(res.unmatchedB.length, s.counts.strayPayments + s.counts.dup);
  // No record used twice
  const seenA = new Set(), seenB = new Set();
  for (const m of res.matches) {
    for (const x of m.a) { assert.ok(!seenA.has(x), "A used twice: " + x); seenA.add(x); }
    for (const x of m.b) { assert.ok(!seenB.has(x), "B used twice: " + x); seenB.add(x); }
  }
});

test("ageing buckets place the aged invoices correctly", () => {
  const { s, res } = run(60);
  const b = ageing(res.unmatchedA, s.asOf);
  const counts = b.map(x => x.count);
  assert.equal(counts.reduce((p, q) => p + q, 0), res.unmatchedA.length);
  assert.ok(b[3].count >= 1, "90+ bucket should have the 120- and 200-day invoices");
});

test("performance: 10,000 rows per side reconcile in under 5 seconds", () => {
  const t0 = performance.now();
  const { res } = run(10000);
  const ms = performance.now() - t0;
  assert.ok(ms < 5000, `took ${ms.toFixed(0)} ms`);
  // At this size random amounts collide within the tolerance now and then, so
  // a few synthetic pairs are matched to a neighbour instead; the rate stays high.
  assert.ok(res.stats.matchRateCountA > 0.88, `match rate ${res.stats.matchRateCountA}`);
});

// match.js — the reconciliation engine. Pure functions, no DOM, so it runs
// in a Web Worker and in Node tests unchanged.
//
// Input records (already mapped):  { id, date: ms|null, amount: number, ref: string, party: string, raw: {...} }
// Output: { matches, unmatchedA, unmatchedB, duplicatesA, duplicatesB, stats }
//   match = { rule: 1..4, label, a: [ids], b: [ids], confidence: 0..1, note }

// ---------- text normalisation and similarity ----------
export function normaliseRef(s) {
  return String(s ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")      // keep letters and digits
    .replace(/\b(INV|INVOICE|PAYMENT|PMT|PAY|PAID|REF|NO|NUM|NUMBER|TRF|TRANSFER|FOR|OF|TO|THE|AND)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function jaroWinkler(s1, s2) {
  if (s1 === s2) return 1;
  const len1 = s1.length, len2 = s2.length;
  if (!len1 || !len2) return 0;
  const matchDist = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
  const m1 = new Array(len1).fill(false), m2 = new Array(len2).fill(false);
  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const lo = Math.max(0, i - matchDist), hi = Math.min(len2 - 1, i + matchDist);
    for (let j = lo; j <= hi; j++) {
      if (!m2[j] && s1[i] === s2[j]) { m1[i] = m2[j] = true; matches++; break; }
    }
  }
  if (!matches) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < len1; i++) {
    if (!m1[i]) continue;
    while (!m2[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }
  t /= 2;
  const jaro = (matches / len1 + matches / len2 + (matches - t) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) { if (s1[i] === s2[i]) prefix++; else break; }
  return jaro + prefix * 0.1 * (1 - jaro);
}

// ---------- helpers ----------
const DAY = 86400000;
const cents = x => Math.round(x * 100);
const within = (a, b, tol) => Math.abs(a - b) <= tol + 1e-9;
function tolFor(amount, opts) {
  return Math.max(opts.amountTolerance, Math.abs(amount) * (opts.amountTolerancePct / 100));
}
function daysApart(d1, d2) {
  if (d1 == null || d2 == null) return null;
  return Math.abs(d1 - d2) / DAY;
}

export const DEFAULT_OPTIONS = {
  amountTolerance: 0.05,     // absolute, in currency units
  amountTolerancePct: 0,     // percentage of the amount
  dateWindowDays: 7,         // for rule 2
  fuzzyThreshold: 0.88,      // Jaro-Winkler, for rule 3
  groupWindowDays: 90,       // for rule 4
  maxGroupSize: 4,           // for rule 4
  maxGroupCandidates: 14     // for rule 4
};

export const RULES = {
  1: "Exact reference + amount",
  2: "Amount within tolerance + date within window",
  3: "Fuzzy reference + amount",
  4: "One-to-many / many-to-one",
  5: "Duplicate"
};

// Bucket index by rounded amount so tolerance lookups are O(1)-ish.
class AmountIndex {
  constructor(records) {
    this.map = new Map();
    for (const r of records) {
      const k = Math.round(r.amount);
      if (!this.map.has(k)) this.map.set(k, []);
      this.map.get(k).push(r);
    }
  }
  near(amount, tol) {
    const out = [];
    const lo = Math.round(amount - tol) - 1, hi = Math.round(amount + tol) + 1;
    for (let k = lo; k <= hi; k++) { const b = this.map.get(k); if (b) out.push(...b); }
    return out;
  }
}

// ---------- main ----------
export function reconcile(A, B, options = {}, onProgress = () => {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const t0 = Date.now();
  const matches = [];
  const usedA = new Set(), usedB = new Set();
  const byIdA = new Map(A.map(r => [r.id, r])), byIdB = new Map(B.map(r => [r.id, r]));

  // ---- Rule 5 first (so duplicates are reported but still matchable once) ----
  const duplicatesA = findDuplicates(A), duplicatesB = findDuplicates(B);
  onProgress({ stage: "duplicates", pct: 5 });

  // ---- Rule 1: exact ref + amount ----
  const exactB = new Map();
  for (const r of B) {
    if (!r.ref) continue;
    const k = r.ref + "|" + cents(r.amount);
    if (!exactB.has(k)) exactB.set(k, []);
    exactB.get(k).push(r);
  }
  for (const a of A) {
    if (!a.ref) continue;
    const k = a.ref + "|" + cents(a.amount);
    const cands = exactB.get(k);
    if (!cands) continue;
    const b = cands.find(x => !usedB.has(x.id));
    if (!b) continue;
    usedA.add(a.id); usedB.add(b.id);
    matches.push({ rule: 1, label: RULES[1], a: [a.id], b: [b.id], confidence: 1, note: "" });
  }
  onProgress({ stage: "exact", pct: 25 });

  // ---- Rule 2: amount within tolerance and date within window ----
  const remB = () => B.filter(r => !usedB.has(r.id));
  let idxB = new AmountIndex(remB());
  for (const a of A) {
    if (usedA.has(a.id) || a.date == null) continue;
    const tol = tolFor(a.amount, opts);
    let best = null, bestScore = -1;
    for (const b of idxB.near(a.amount, tol)) {
      if (usedB.has(b.id) || b.date == null) continue;
      if (!within(a.amount, b.amount, tol)) continue;
      const d = daysApart(a.date, b.date);
      if (d > opts.dateWindowDays) continue;
      // prefer closer dates, then closer amounts, then same counterparty
      const score = (1 - d / (opts.dateWindowDays + 1)) * 0.6 + (1 - Math.abs(a.amount - b.amount) / (tol + 1e-9)) * 0.3 + (a.party && a.party === b.party ? 0.1 : 0);
      if (score > bestScore) { bestScore = score; best = b; }
    }
    if (best) {
      usedA.add(a.id); usedB.add(best.id);
      const d = daysApart(a.date, best.date);
      matches.push({ rule: 2, label: RULES[2], a: [a.id], b: [best.id], confidence: round(0.7 + 0.25 * bestScore), note: `${d.toFixed(0)} day(s) apart${cents(a.amount) !== cents(best.amount) ? ", amount differs by " + (a.amount - best.amount).toFixed(2) : ""}` });
    }
  }
  onProgress({ stage: "tolerance", pct: 50 });

  // ---- Rule 3: fuzzy reference + amount within tolerance ----
  idxB = new AmountIndex(remB());
  for (const a of A) {
    if (usedA.has(a.id) || !a.ref) continue;
    const tol = tolFor(a.amount, opts);
    let best = null, bestSim = 0;
    for (const b of idxB.near(a.amount, tol)) {
      if (usedB.has(b.id) || !b.ref) continue;
      if (!within(a.amount, b.amount, tol)) continue;
      const sim = jaroWinkler(a.ref, b.ref);
      if (sim >= opts.fuzzyThreshold && sim > bestSim) { bestSim = sim; best = b; }
    }
    if (best) {
      usedA.add(a.id); usedB.add(best.id);
      matches.push({ rule: 3, label: RULES[3], a: [a.id], b: [best.id], confidence: round(bestSim), note: `similarity ${bestSim.toFixed(2)}: "${a.ref}" ≈ "${best.ref}"` });
    }
  }
  onProgress({ stage: "fuzzy", pct: 70 });

  // ---- Rule 4: one-to-many and many-to-one via bounded subset sum ----
  groupPass(A, B, usedA, usedB, matches, opts, "one A, several B");
  groupPass(B, A, usedB, usedA, matches, opts, "several A, one B", true);
  onProgress({ stage: "groups", pct: 95 });

  const unmatchedA = A.filter(r => !usedA.has(r.id));
  const unmatchedB = B.filter(r => !usedB.has(r.id));
  const sum = arr => arr.reduce((s, r) => s + r.amount, 0);
  const matchedValueA = sum(A.filter(r => usedA.has(r.id)));
  const stats = {
    countA: A.length, countB: B.length,
    matchedA: usedA.size, matchedB: usedB.size,
    matchRateCountA: A.length ? usedA.size / A.length : 0,
    matchRateCountB: B.length ? usedB.size / B.length : 0,
    valueA: sum(A), valueB: sum(B),
    matchedValueA, matchRateValueA: sum(A) ? matchedValueA / sum(A) : 0,
    unmatchedValueA: sum(unmatchedA), unmatchedValueB: sum(unmatchedB),
    byRule: Object.fromEntries(Object.keys(RULES).map(k => [k, matches.filter(m => m.rule === Number(k)).length])),
    ms: Date.now() - t0
  };
  onProgress({ stage: "done", pct: 100 });
  return { matches, unmatchedA, unmatchedB, duplicatesA, duplicatesB, stats };
}

function round(x) { return Math.round(x * 100) / 100; }

function findDuplicates(recs) {
  const seen = new Map(), dups = [];
  for (const r of recs) {
    const k = [r.ref, cents(r.amount), r.date == null ? "" : Math.floor(r.date / DAY), r.party].join("|");
    if (seen.has(k)) dups.push({ id: r.id, duplicateOf: seen.get(k), rule: 5, label: RULES[5] });
    else seen.set(k, r.id);
  }
  return dups;
}

// For every unmatched record on side X, look for a small set of unmatched
// records on side Y (same counterparty if both have one, within the group
// window) whose amounts sum to it.
function groupPass(X, Y, usedX, usedY, matches, opts, note, swapped = false) {
  const remainingY = Y.filter(r => !usedY.has(r.id));
  if (remainingY.length < 2) return;
  const dated = remainingY.filter(r => r.date != null).sort((p, q) => p.date - q.date);
  const undated = remainingY.filter(r => r.date == null);
  const dates = dated.map(r => r.date);
  const lowerBound = t => { let lo = 0, hi = dates.length; while (lo < hi) { const m = (lo + hi) >> 1; if (dates[m] < t) lo = m + 1; else hi = m; } return lo; };
  const windowMs = opts.groupWindowDays * DAY;

  for (const x of X) {
    if (usedX.has(x.id)) continue;
    const tol = tolFor(x.amount, opts);
    const sign = Math.sign(x.amount) || 1;
    let pool;
    if (x.date == null) pool = remainingY;
    else {
      const lo = lowerBound(x.date - windowMs), hi = lowerBound(x.date + windowMs + 1);
      pool = dated.slice(lo, hi).concat(undated);
    }
    let cands = [];
    for (const y of pool) {
      if (usedY.has(y.id)) continue;
      if (Math.sign(y.amount) !== sign) continue;
      const ay = Math.abs(y.amount);
      if (ay > Math.abs(x.amount) + tol || ay <= tol) continue;
      if (x.party && y.party && x.party !== y.party) continue;
      cands.push(y);
      if (cands.length > 400) break;   // hard bound; the sort below keeps the closest
    }
    if (cands.length < 2) continue;
    if (x.date != null) cands.sort((p, q) => (daysApart(x.date, p.date) ?? 1e9) - (daysApart(x.date, q.date) ?? 1e9));
    // Prefer candidates sharing a reference token with x (e.g. "1042" in "1042 PART 2").
    const xTokens = new Set(x.ref.split(" ").filter(t => t.length >= 3));
    cands.sort((p, q) => tokenOverlap(q.ref, xTokens) - tokenOverlap(p.ref, xTokens));
    cands = cands.slice(0, opts.maxGroupCandidates);
    const found = subsetSum(cands.map(c => c.amount), x.amount, tol, opts.maxGroupSize);
    if (!found) continue;
    const chosen = found.map(i => cands[i]);
    usedX.add(x.id); chosen.forEach(c => usedY.add(c.id));
    const sumC = chosen.reduce((s, c) => s + c.amount, 0);
    matches.push({
      rule: 4, label: RULES[4],
      a: swapped ? chosen.map(c => c.id) : [x.id],
      b: swapped ? [x.id] : chosen.map(c => c.id),
      confidence: round(0.6 + 0.1 * (chosen.length <= 2 ? 1 : 0) + 0.1 * (chosen.every(c => tokenOverlap(c.ref, xTokens) > 0) ? 1 : 0)),
      note: `${note}: ${chosen.length} items sum to ${sumC.toFixed(2)} vs ${x.amount.toFixed(2)}`
    });
  }
}

function tokenOverlap(ref, tokens) {
  let n = 0;
  for (const t of String(ref).split(" ")) if (tokens.has(t)) n++;
  return n;
}

// Bounded subset-sum: find indices (size 2..maxSize) whose values sum to
// target ± tol. Depth-first with sorted values and pruning. Candidate count
// is capped by the caller, so worst case is small (C(14,4) ≈ 1,001 nodes).
export function subsetSum(values, target, tol, maxSize) {
  const idx = values.map((v, i) => i).sort((p, q) => Math.abs(values[q]) - Math.abs(values[p]));
  const n = idx.length;
  const pick = [];
  let best = null;
  const absT = Math.abs(target);
  function dfs(start, sum, depth) {
    if (best) return;
    if (depth >= 2 && Math.abs(sum - absT) <= tol) { best = pick.slice(); return; }
    if (depth === maxSize) return;
    for (let k = start; k < n; k++) {
      const v = Math.abs(values[idx[k]]);
      if (sum + v > absT + tol) continue;          // too big; values sorted desc so try smaller
      pick.push(idx[k]);
      dfs(k + 1, sum + v, depth + 1);
      pick.pop();
      if (best) return;
    }
  }
  dfs(0, 0, 0);
  return best;
}

// ---------- ageing ----------
export function ageing(records, asOf) {
  const buckets = [
    { label: "0–30 days", min: 0, max: 30, count: 0, value: 0 },
    { label: "31–60 days", min: 31, max: 60, count: 0, value: 0 },
    { label: "61–90 days", min: 61, max: 90, count: 0, value: 0 },
    { label: "90+ days", min: 91, max: Infinity, count: 0, value: 0 },
    { label: "no date", min: -1, max: -1, count: 0, value: 0 }
  ];
  for (const r of records) {
    let b;
    if (r.date == null) b = buckets[4];
    else {
      const d = Math.floor((asOf - r.date) / DAY);
      b = buckets.find(x => d >= x.min && d <= x.max) || buckets[0];
      if (d < 0) b = buckets[0];
    }
    b.count++; b.value += r.amount;
  }
  return buckets;
}

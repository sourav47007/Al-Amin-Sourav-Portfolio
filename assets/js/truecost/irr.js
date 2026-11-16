// irr.js — pure rate maths. No DOM.
//
// Cash flows are from the borrower's point of view and are indexed by
// unit period (0, 1, 2, ...): a positive flow is money (or goods) the
// borrower receives, a negative flow is a payment. The APR follows the
// "actuarial method": solve for the unit-period rate i such that the
// present value of all flows is zero, then APR = i × (periods per year).
// The effective annual yield compounds instead: (1 + i)^w − 1.

export function npv(flows, i) {
  let s = 0;
  for (const f of flows) s += f.amount / Math.pow(1 + i, f.t);
  return s;
}

/**
 * Solve the periodic rate by bisection.
 * flows: [{t: periodIndex, amount}], t may be fractional.
 * Returns null when there is no sign change (e.g. nothing to repay).
 */
export function periodicRate(flows, { lo = -0.99, hi = 10, tol = 1e-12, maxIter = 300 } = {}) {
  if (!flows.length) return null;
  const totalIn = flows.filter(f => f.amount > 0).reduce((a, f) => a + f.amount, 0);
  const totalOut = -flows.filter(f => f.amount < 0).reduce((a, f) => a + f.amount, 0);
  if (totalIn === 0 || totalOut === 0) return null;
  if (Math.abs(totalIn - totalOut) < 1e-9) {
    // Could still be non-zero if timing differs, but with equal totals the
    // natural answer is 0 unless flows are front-loaded. Check sign at 0.
    const at0 = npv(flows, 0);
    if (Math.abs(at0) < 1e-9) return 0;
  }
  let fLo = npv(flows, lo), fHi = npv(flows, hi);
  if (fLo * fHi > 0) {
    // Try widening before giving up.
    hi = 1000; fHi = npv(flows, hi);
    if (fLo * fHi > 0) return null;
  }
  let mid = 0;
  for (let k = 0; k < maxIter; k++) {
    mid = (lo + hi) / 2;
    const fm = npv(flows, mid);
    if (Math.abs(fm) < tol || (hi - lo) < tol) break;
    if (fLo * fm < 0) { hi = mid; fHi = fm; } else { lo = mid; fLo = fm; }
  }
  return mid;
}

/** Nominal APR and effective annual yield from a periodic rate. */
export function annualise(i, periodsPerYear) {
  if (i == null) return { apr: null, eay: null };
  return { apr: i * periodsPerYear, eay: Math.pow(1 + i, periodsPerYear) - 1 };
}

/** Standard annuity payment for a reducing-balance loan. */
export function annuityPayment(principal, periodicRate, n) {
  if (periodicRate === 0) return principal / n;
  const q = Math.pow(1 + periodicRate, n);
  return principal * periodicRate * q / (q - 1);
}

export function round2(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }

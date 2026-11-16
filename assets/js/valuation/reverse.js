// reverse.js — what growth does the price imply? Pure.
import { dcf } from "./dcf.js";

/**
 * Solve by bisection for the constant revenue growth that makes value per
 * share equal `price`, holding every other input fixed.
 * Returns { growth, iterations } or { growth: null, reason }.
 */
export function impliedGrowth(params, price, { lo = -0.5, hi = 1.0, tol = 1e-7, maxIter = 200 } = {}) {
  const f = g => {
    const v = dcf({ ...params, growth: g }).perShare;
    return (v == null || !isFinite(v)) ? NaN : v - price;
  };
  let fLo = f(lo), fHi = f(hi);
  if (isNaN(fLo) || isNaN(fHi)) return { growth: null, reason: "value could not be computed (check shares and WACC)" };
  if (fLo * fHi > 0) {
    if (fHi < 0) return { growth: null, reason: `no constant growth rate below ${Math.round(hi * 100)}% a year reproduces this price at the current margin and discount rate` };
    return { growth: null, reason: `even ${Math.round(lo * 100)}% a year growth gives a value above this price; the price implies shrinking faster than that or a lower margin` };
  }
  let i = 0;
  for (; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < tol * Math.max(1, price) || (hi - lo) < tol) return { growth: mid, iterations: i };
    if (fLo * fm < 0) { hi = mid; fHi = fm; } else { lo = mid; fLo = fm; }
  }
  return { growth: (lo + hi) / 2, iterations: i };
}

/** Grid of value per share across growth × wacc, for the heatmap. */
export function sensitivity(params, growths, waccs) {
  return growths.map(g => waccs.map(w => dcf({ ...params, growth: g, wacc: w }).perShare));
}

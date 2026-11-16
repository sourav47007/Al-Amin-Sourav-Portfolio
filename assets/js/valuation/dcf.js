// dcf.js — forward DCF (free cash flow to the firm). Pure.
//
// Inputs (all rates as decimals):
//   revenue        base-year revenue
//   growth         constant annual revenue growth for the explicit period
//   margin         operating (EBIT) margin, applied from year 1
//   salesToCapital revenue generated per unit of net reinvestment
//   taxRate        tax on operating income
//   wacc           discount rate
//   terminalGrowth growth after year N (capped at the risk-free rate by the caller)
//   years          explicit forecast years (default 10)
//   cash, debt     for the bridge to equity
//   shares         diluted shares
//
// FCFF_t = EBIT_t (1 − tax) − reinvestment_t, reinvestment_t = ΔRevenue_t / salesToCapital.
// Terminal value at N = FCFF_{N+1} / (wacc − g_T), with reinvestment in the
// terminal year set so that growth is funded: reinvestment = g_T / ROIC, where ROIC
// is taken as the WACC (no excess returns in perpetuity) when g_T > 0.

export function wacc({ riskFree, erp, beta, costOfDebt, taxRate, debtWeight }) {
  const ke = riskFree + beta * erp;
  const kd = costOfDebt * (1 - taxRate);
  return (1 - debtWeight) * ke + debtWeight * kd;
}

export function dcf(p) {
  const N = p.years || 10;
  const rows = [];
  let rev = p.revenue;
  let pv = 0;
  for (let t = 1; t <= N; t++) {
    const revNext = rev * (1 + p.growth);
    const ebit = revNext * p.margin;
    const nopat = ebit * (1 - p.taxRate);
    const reinvest = (revNext - rev) / p.salesToCapital;
    const fcff = nopat - reinvest;
    const df = Math.pow(1 + p.wacc, -t);
    pv += fcff * df;
    rows.push({ t, revenue: revNext, ebit, nopat, reinvest, fcff, df, pv: fcff * df });
    rev = revNext;
  }
  const gT = Math.min(p.terminalGrowth, p.wacc - 0.0001);
  const last = rows[N - 1];
  const nopatT = last.revenue * (1 + gT) * p.margin * (1 - p.taxRate);
  const reinvestRateT = gT > 0 ? gT / p.wacc : 0;          // reinvest enough to sustain g at ROIC = WACC
  const fcffT = nopatT * (1 - reinvestRateT);
  const terminalValue = fcffT / (p.wacc - gT);
  const pvTerminal = terminalValue * Math.pow(1 + p.wacc, -N);
  const enterpriseValue = pv + pvTerminal;
  const equityValue = enterpriseValue + (p.cash || 0) - (p.debt || 0);
  const perShare = p.shares ? equityValue / p.shares : null;
  return { rows, pvExplicit: pv, terminalValue, pvTerminal, enterpriseValue, equityValue, perShare, terminalShare: enterpriseValue ? pvTerminal / enterpriseValue : null, gT };
}

export function valuePerShare(p) { return dcf(p).perShare; }

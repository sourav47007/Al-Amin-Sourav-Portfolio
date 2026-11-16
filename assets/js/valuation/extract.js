// extract.js — turn an SEC "companyfacts" JSON into the small set of
// numbers the DCF needs. Pure; runs in the Vercel function, in the preset
// build script and in tests. Every fallback or estimate is recorded in
// `quality` so the page can show a data-quality note.
//
// Output shape:
// {
//   cik, name, ticker, currency, source: "SEC EDGAR companyfacts", fetchedAt,
//   years: [{ end: "2025-09-27", fy: 2025, revenue, operatingIncome, da, capex,
//             currentAssets, currentLiabilities, cash, debt, shares, taxRate }],
//   quality: ["revenue: used tag X", ...]
// }

const DAY = 86400000;

const TAGS = {
  revenue: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet",
    "RevenueFromContractWithCustomerIncludingAssessedTax", "RevenuesNetOfInterestExpense", "SalesRevenueGoodsNet"],
  operatingIncome: ["OperatingIncomeLoss"],
  pretax: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic"],
  interestExpense: ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt"],
  tax: ["IncomeTaxExpenseBenefit"],
  da: ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "DepreciationAmortizationAndAccretionNet",
    "DepreciationAmortizationAndOther", "Depreciation"],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets",
    "PaymentsForCapitalImprovements", "PaymentsToAcquireOtherPropertyPlantAndEquipment"],
  currentAssets: ["AssetsCurrent"],
  currentLiabilities: ["LiabilitiesCurrent"],
  cash: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "Cash"],
  stInvestments: ["ShortTermInvestments", "MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent"],
  ltDebt: ["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations", "LongTermDebt"],
  stDebt: ["LongTermDebtCurrent", "DebtCurrent", "ShortTermBorrowings", "CommercialPaper", "LongTermDebtAndCapitalLeaseObligationsCurrent"],
  sharesDiluted: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
  sharesBasic: ["WeightedAverageNumberOfSharesOutstandingBasic", "CommonStockSharesOutstanding"],
  sharesDei: ["EntityCommonStockSharesOutstanding"]
};

// All annual observations for a tag, keyed by period end. Duration facts
// must span roughly a year; the most recent filing for a period wins.
function annualSeries(facts, tag, { duration }) {
  // companyfacts nests taxonomies under `facts`: { cik, entityName, facts: { "us-gaap": {...}, dei: {...} } }
  const root = facts.facts || facts;
  const node = (root["us-gaap"] && root["us-gaap"][tag]) || (root["dei"] && root["dei"][tag]);
  if (!node) return null;
  const unitKey = Object.keys(node.units).find(u => u === "USD" || u === "shares") || Object.keys(node.units)[0];
  const obs = node.units[unitKey];
  const byEnd = new Map();
  for (const o of obs) {
    if (!/10-K|20-F|40-F/.test(o.form || "")) continue;
    if (duration) {
      if (!o.start) continue;
      const days = (Date.parse(o.end) - Date.parse(o.start)) / DAY;
      if (days < 340 || days > 390) continue;
    }
    const prev = byEnd.get(o.end);
    if (!prev || (o.filed || "") > (prev.filed || "")) byEnd.set(o.end, o);
  }
  if (!byEnd.size) return null;
  return { unit: unitKey, byEnd };
}

// Pick the tag whose data reaches the most recent period end, then fill any
// earlier period ends it lacks from the other candidate tags (companies
// switch tags over the years, e.g. "Revenues" → "RevenueFromContract…").
function firstAvailable(facts, tags, opts, quality = null, field = "") {
  const found = [];
  for (const t of tags) {
    const s = annualSeries(facts, t, opts);
    if (s && s.byEnd.size) found.push({ tag: t, ...s, latest: [...s.byEnd.keys()].sort().pop() });
  }
  if (!found.length) return null;
  found.sort((a, b) => (a.latest < b.latest ? 1 : a.latest > b.latest ? -1 : b.byEnd.size - a.byEnd.size));
  const primary = found[0];
  const merged = new Map(primary.byEnd);
  const filledFrom = [];
  for (const other of found.slice(1)) {
    for (const [end, o] of other.byEnd) {
      if (merged.has(end)) continue;
      // Avoid near-duplicate period ends (52/53-week drift) already covered.
      const t = Date.parse(end);
      if ([...merged.keys()].some(e => Math.abs(Date.parse(e) - t) < 40 * DAY)) continue;
      merged.set(end, o);
      if (!filledFrom.includes(other.tag)) filledFrom.push(other.tag);
    }
  }
  if (quality && filledFrom.length) quality.push(`${field}: earlier years filled from ${filledFrom.join(", ")}`);
  return { tag: primary.tag, unit: primary.unit, byEnd: merged };
}

// Value at a given end date, or the nearest end within ±40 days (fiscal
// year-ends drift by a few days for 52/53-week companies).
function at(series, end) {
  if (!series) return null;
  if (series.byEnd.has(end)) return series.byEnd.get(end).val;
  const t = Date.parse(end);
  let best = null, bestGap = 41 * DAY;
  for (const [e, o] of series.byEnd) {
    const gap = Math.abs(Date.parse(e) - t);
    if (gap < bestGap) { bestGap = gap; best = o.val; }
  }
  return best;
}

export function extractFinancials(facts, { ticker = "", maxYears = 5, now = new Date() } = {}) {
  const quality = [];
  const rev = firstAvailable(facts, TAGS.revenue, { duration: true }, quality, "revenue");
  if (!rev) throw new Error("No annual revenue found under any known XBRL tag.");
  if (rev.tag !== TAGS.revenue[0]) quality.push(`revenue: used tag ${rev.tag}`);
  // (quality notes about filled years were added by firstAvailable)

  const ends = [...rev.byEnd.keys()].sort().slice(-maxYears);
  const opInc = firstAvailable(facts, TAGS.operatingIncome, { duration: true });
  const pretax = firstAvailable(facts, TAGS.pretax, { duration: true });
  const intExp = firstAvailable(facts, TAGS.interestExpense, { duration: true });
  const tax = firstAvailable(facts, TAGS.tax, { duration: true });
  const da = firstAvailable(facts, TAGS.da, { duration: true }, quality, "D&A");
  const capex = firstAvailable(facts, TAGS.capex, { duration: true }, quality, "capex");
  const ca = firstAvailable(facts, TAGS.currentAssets, { duration: false });
  const cl = firstAvailable(facts, TAGS.currentLiabilities, { duration: false });
  const cash = firstAvailable(facts, TAGS.cash, { duration: false });
  const sti = firstAvailable(facts, TAGS.stInvestments, { duration: false });
  const ltd = firstAvailable(facts, TAGS.ltDebt, { duration: false });
  const std = firstAvailable(facts, TAGS.stDebt, { duration: false });
  const shD = firstAvailable(facts, TAGS.sharesDiluted, { duration: true });
  const shB = firstAvailable(facts, TAGS.sharesBasic, { duration: true }) || firstAvailable(facts, TAGS.sharesBasic, { duration: false });

  if (!opInc) quality.push("operating income: OperatingIncomeLoss missing; estimated as pre-tax income + interest expense");
  if (!da) quality.push("D&A: no depreciation tag found; set to 0");
  else if (da.tag !== TAGS.da[0]) quality.push(`D&A: used tag ${da.tag}`);
  if (!capex) quality.push("capex: no capital expenditure tag found; set to 0");
  else if (capex.tag !== TAGS.capex[0]) quality.push(`capex: used tag ${capex.tag}`);
  if (!ca || !cl) quality.push("working capital: current assets or liabilities missing; working-capital change set to 0");
  if (!cash) quality.push("cash: no cash tag found; set to 0");
  if (sti) quality.push(`cash: includes short-term investments (${sti.tag})`);
  if (!ltd && !std) quality.push("debt: no debt tags found; set to 0 (check the balance sheet)");
  if (!shD) quality.push(shB ? `shares: diluted share count missing; used ${shB.tag}` : "shares: no share count found");

  const years = ends.map(end => {
    const revenue = at(rev, end);
    let operatingIncome = at(opInc, end);
    if (operatingIncome == null && pretax) operatingIncome = (at(pretax, end) ?? 0) + (at(intExp, end) ?? 0);
    const pre = at(pretax, end), tx = at(tax, end);
    let taxRate = (pre && tx != null && pre > 0) ? tx / pre : null;
    if (taxRate != null && (taxRate < 0 || taxRate > 0.6)) taxRate = null;
    const cashV = (at(cash, end) ?? 0) + (at(sti, end) ?? 0);
    const debtV = (at(ltd, end) ?? 0) + (at(std, end) ?? 0);
    const shares = at(shD, end) ?? at(shB, end) ?? null;
    return {
      end, fy: Number(end.slice(0, 4)),
      revenue, operatingIncome, da: at(da, end) ?? 0, capex: Math.abs(at(capex, end) ?? 0),
      currentAssets: at(ca, end), currentLiabilities: at(cl, end),
      cash: cashV, debt: debtV, shares, taxRate
    };
  });

  // Tax rate: latest valid, else 3-year average, else statutory 21% (flagged).
  const latest = years[years.length - 1];
  const validRates = years.map(y => y.taxRate).filter(r => r != null);
  let taxRate = latest.taxRate;
  if (taxRate == null) {
    if (validRates.length) { taxRate = validRates.reduce((a, b) => a + b, 0) / validRates.length; quality.push("tax rate: latest year unusable; used average of available years"); }
    else { taxRate = 0.21; quality.push("tax rate: could not be computed; using 21% US statutory rate"); }
  }
  if (latest.shares == null) {
    const dei = firstAvailable(facts, TAGS.sharesDei, { duration: false });
    if (dei) { latest.shares = [...dei.byEnd.values()].sort((a, b) => a.end < b.end ? 1 : -1)[0].val; quality.push("shares: used dei:EntityCommonStockSharesOutstanding (cover page) for the latest year"); }
  }
  if (years.length < maxYears) quality.push(`only ${years.length} fiscal year(s) of revenue available`);

  return {
    cik: facts.cik, name: facts.entityName, ticker: ticker.toUpperCase(), currency: rev.unit,
    source: "SEC EDGAR XBRL companyfacts", fetchedAt: now.toISOString().slice(0, 10),
    years, taxRate, quality
  };
}

// The base-year inputs the DCF starts from.
export function baseInputs(fin) {
  const ys = fin.years;
  const y = ys[ys.length - 1], p = ys[ys.length - 2];
  // Non-cash working capital. Short-term debt inside current liabilities is not
  // separated out here, which slightly understates it for some companies.
  const wc = v => (v.currentAssets ?? 0) - (v.cash ?? 0) - (v.currentLiabilities ?? 0);
  const growthHist = ys.length > 1 ? Math.pow(y.revenue / ys[0].revenue, 1 / (ys.length - 1)) - 1 : 0;
  const margin = y.operatingIncome / y.revenue;
  // Sales-to-capital: average of (ΔRevenue / net reinvestment) over the history, bounded.
  let s2c = null;
  if (p) {
    const reinvest = (y.capex - y.da) + (wc(y) - wc(p));
    const dRev = y.revenue - p.revenue;
    if (reinvest > 0 && dRev > 0) s2c = dRev / reinvest;
  }
  if (s2c == null || !isFinite(s2c) || s2c < 0.5 || s2c > 10) s2c = 2.5;
  return {
    revenue: y.revenue, margin, growth: Math.max(-0.2, Math.min(0.4, growthHist)),
    salesToCapital: s2c, taxRate: fin.taxRate, cash: y.cash, debt: y.debt, shares: y.shares,
    historicalGrowth: growthHist
  };
}

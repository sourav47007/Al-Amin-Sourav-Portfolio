import { test } from "node:test";
import assert from "node:assert/strict";
import { dcf, wacc } from "../assets/js/valuation/dcf.js";
import { impliedGrowth, sensitivity } from "../assets/js/valuation/reverse.js";
import { extractFinancials, baseInputs } from "../assets/js/valuation/extract.js";

const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `expected ${a} ≈ ${b} (tol ${tol})`);

const base = {
  revenue: 100e9, growth: 0.08, margin: 0.25, salesToCapital: 3, taxRate: 0.21,
  wacc: 0.09, terminalGrowth: 0.03, years: 10, cash: 20e9, debt: 30e9, shares: 5e9
};

test("WACC builder", () => {
  const w = wacc({ riskFree: 0.04, erp: 0.05, beta: 1.2, costOfDebt: 0.05, taxRate: 0.21, debtWeight: 0.2 });
  // ke = 4% + 1.2×5% = 10%; kd after tax = 3.95%; 0.8×10% + 0.2×3.95% = 8.79%
  close(w, 0.0879, 1e-6);
});

test("zero growth, zero terminal growth: value = NOPAT / WACC", () => {
  const r = dcf({ ...base, growth: 0, terminalGrowth: 0 });
  const nopat = 100e9 * 0.25 * (1 - 0.21);
  close(r.enterpriseValue, nopat / 0.09, 1);           // 10-year annuity + perpetuity collapse to NOPAT/WACC
  close(r.equityValue, nopat / 0.09 + 20e9 - 30e9, 1);
});

test("reverse DCF round trip recovers the input growth", () => {
  for (const g of [-0.1, 0, 0.05, 0.12, 0.3]) {
    const price = dcf({ ...base, growth: g }).perShare;
    const { growth } = impliedGrowth(base, price);
    close(growth, g, 1e-5);
  }
});

test("reverse DCF reports when the price is out of range", () => {
  const r = impliedGrowth(base, 1e6);
  assert.equal(r.growth, null);
  assert.match(r.reason, /no constant growth rate/);
});

test("terminal growth is capped below WACC", () => {
  const r = dcf({ ...base, terminalGrowth: 0.2 });
  assert.ok(r.gT < base.wacc);
  assert.ok(isFinite(r.perShare));
});

test("sensitivity grid is monotone in growth and WACC", () => {
  const grid = sensitivity(base, [0, 0.05, 0.1], [0.08, 0.1, 0.12]);
  assert.ok(grid[0][0] < grid[1][0] && grid[1][0] < grid[2][0]);
  assert.ok(grid[0][0] > grid[0][1] && grid[0][1] > grid[0][2]);
});

// A minimal, synthetic companyfacts document to exercise tag fallbacks.
function fact(tag, rows, unit = "USD") {
  return { [tag]: { units: { [unit]: rows } } };
}
const yr = (fy, val, extra = {}) => ({ start: `${fy - 1}-10-01`, end: `${fy}-09-30`, val, form: "10-K", filed: `${fy}-11-01`, fy, fp: "FY", ...extra });
const inst = (fy, val) => ({ end: `${fy}-09-30`, val, form: "10-K", filed: `${fy}-11-01`, fy, fp: "FY" });
const facts = {
  cik: 1, entityName: "Synthetic Test Co",
  facts: { "us-gaap": {
    ...fact("Revenues", [2019, 2020, 2021].map(y => yr(y, 80 + (y - 2019) * 10))),           // old tag, stops in 2021
    ...fact("RevenueFromContractWithCustomerExcludingAssessedTax", [2021, 2022, 2023, 2024, 2025].map(y => yr(y, 100 + (y - 2021) * 10))),
    ...fact("OperatingIncomeLoss", [2021, 2022, 2023, 2024, 2025].map(y => yr(y, 20 + (y - 2021) * 2))),
    ...fact("IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", [2024, 2025].map(y => yr(y, 20))),
    ...fact("IncomeTaxExpenseBenefit", [2024, 2025].map(y => yr(y, 4))),
    ...fact("DepreciationAndAmortization", [2024, 2025].map(y => yr(y, 5))),
    ...fact("PaymentsToAcquirePropertyPlantAndEquipment", [2024, 2025].map(y => yr(y, 8))),
    ...fact("AssetsCurrent", [2024, 2025].map(y => inst(y, 50))),
    ...fact("LiabilitiesCurrent", [2024, 2025].map(y => inst(y, 30))),
    ...fact("CashAndCashEquivalentsAtCarryingValue", [2024, 2025].map(y => inst(y, 10))),
    ...fact("LongTermDebtNoncurrent", [2024, 2025].map(y => inst(y, 25))),
    ...fact("WeightedAverageNumberOfDilutedSharesOutstanding", [2024, 2025].map(y => yr(y, 1000)), "shares"),
    // A quarterly row that must be ignored (duration ≈ 90 days)
    ...fact("Revenues", [{ start: "2025-07-01", end: "2025-09-30", val: 999, form: "10-Q", fy: 2025, fp: "Q3" }])
  } }
};

test("extractFinancials uses tag fallbacks, ignores quarters, and reports quality notes", () => {
  const fin = extractFinancials(facts, { ticker: "test" });
  assert.equal(fin.years.length, 5);
  assert.equal(fin.years[4].revenue, 140);
  assert.equal(fin.years[4].operatingIncome, 28);
  assert.equal(fin.years[4].cash, 10);
  assert.equal(fin.years[4].debt, 25);
  assert.equal(fin.years[4].shares, 1000);
  close(fin.taxRate, 0.2, 1e-12);
  assert.ok(fin.quality.some(q => q.startsWith("revenue: used tag")));
  assert.equal(fin.years[0].end, "2021-09-30");   // the five most recent, from the newer tag
  assert.ok(fin.quality.some(q => q.startsWith("D&A: used tag")));
  const b = baseInputs(fin);
  close(b.margin, 0.2, 1e-12);
  close(b.historicalGrowth, Math.pow(1.4, 0.25) - 1, 1e-12);
});

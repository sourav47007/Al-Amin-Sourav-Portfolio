import { test } from "node:test";
import assert from "node:assert/strict";
import { periodicRate, annualise, annuityPayment, npv } from "../assets/js/truecost/irr.js";
import { bnpl, zeroEmi, instalmentLoan, creditCard, flatToReducing } from "../assets/js/truecost/cashflows.js";

const close = (a, b, tol = 1e-4) => assert.ok(Math.abs(a - b) <= tol, `expected ${a} ≈ ${b} (tol ${tol})`);

// Published example — Regulation Z, 12 CFR Part 1026, Appendix J(c), Example (i)
// "Monthly payments (regular first period)": amount advanced $5,000, 24 monthly
// payments of $230, APR = 9.69%.
// https://www.consumerfinance.gov/rules-policy/regulations/1026/j/
test("Reg Z Appendix J example (i): $5,000, 24 × $230 monthly → APR 9.69%", () => {
  const flows = [{ t: 0, amount: 5000 }];
  for (let k = 1; k <= 24; k++) flows.push({ t: k, amount: -230 });
  const i = periodicRate(flows);
  const { apr } = annualise(i, 12);
  close(apr, 0.0969, 0.0001);          // Reg Z rounds to the nearest 1/4 of 1%; actuarial value is 9.69%
  close(npv(flows, i), 0, 1e-6);       // the rate really zeroes the flows
});

test("loan at 12% reducing, 12 months: IRR recovers 12% nominal", () => {
  const s = instalmentLoan({ principal: 1000, months: 12, rate: 0.12, basis: "reducing" });
  close(s.apr, 0.12, 1e-9);
  close(s.payment, annuityPayment(1000, 0.01, 12), 1e-9);
  close(s.eay, Math.pow(1.01, 12) - 1, 1e-9);
});

test("flat 9% over 12 months is about 16.2% reducing (hand-checked)", () => {
  // Flat: interest = 1000 × 9% = 90; 12 payments of 90.833.
  // Solving 1000 = 90.833 × a(12, i) gives i ≈ 1.351%/month → 16.2% nominal.
  const s = instalmentLoan({ principal: 1000, months: 12, rate: 0.09, basis: "flat" });
  close(s.payment, 1090 / 12, 1e-9);
  close(s.apr, 0.1622, 0.001);
  close(flatToReducing(0.09, 12), s.apr, 1e-12);
});

test("pay-in-4 with no fees has APR 0 and zero extra cost", () => {
  const s = bnpl({ price: 200, instalments: 4, period: "fortnight", firstAtPurchase: true });
  close(s.apr, 0, 1e-9);
  assert.equal(s.extraCost, 0);
  assert.equal(s.totalPaid, 200);
});

test("pay-in-4 with a $10 upfront fee on $200 (first at checkout): hand-checked APR", () => {
  // Flows: +190 at t0, −50 at t0,1,2,3 (fortnights). Net t0 = +140, then −50 ×3.
  // Solve 140 = 50 × [1/(1+i) + 1/(1+i)^2 + 1/(1+i)^3] → i ≈ 3.53% per fortnight → APR ≈ 91.8%
  const s = bnpl({ price: 200, instalments: 4, period: "fortnight", firstAtPurchase: true, upfrontFee: 10 });
  close(s.periodicRate, 0.0353, 0.0002);
  close(s.apr, s.periodicRate * 26, 1e-12);
  assert.equal(s.extraCost, 10);
});

test("a late payment adds the fee and pushes the instalment one period later", () => {
  const base = bnpl({ price: 400, instalments: 4, period: "fortnight", firstAtPurchase: false });
  const late = bnpl({ price: 400, instalments: 4, period: "fortnight", firstAtPurchase: false, lateFee: 8, latePayment: 2 });
  assert.equal(late.totalPaid - base.totalPaid, 8);
  assert.equal(late.schedule[1].t, 3);
  assert.ok(late.apr > base.apr);
});

test("0% EMI with a 2% processing fee and 5% cash discount forgone", () => {
  // Price 1000, cash price 950, fee 20. You give up 50 + pay 20 to borrow 950 over 6 months.
  const s = zeroEmi({ price: 1000, months: 6, processingFee: 20, cashDiscount: 50 });
  assert.equal(s.cashPrice, 950);
  assert.equal(s.extraCost, 70);
  // 930 received, 6 × 166.67 paid → i ≈ 2.1%/month → APR ≈ 25%
  close(s.apr, 0.253, 0.01);
  close(npv(s.flows, s.periodicRate), 0, 1e-6);
});

test("credit card: fixed payment equal to the annuity clears in exactly n months", () => {
  const pay = annuityPayment(5000, 0.18 / 12, 24);
  const r = creditCard({ balance: 5000, apr: 0.18, fixedPayment: pay });
  assert.equal(r.months, 24);
  close(r.totalPaid, pay * 24, 0.02);
});

test("credit card: minimum payment that only covers interest never pays off", () => {
  const r = creditCard({ balance: 1000, apr: 0.24, minPct: 0.015, minFloor: 0 });
  // 1.5% of balance ≈ 15; interest at 2%/month = 20 → the balance grows, so it stalls.
  assert.equal(r.months, Infinity);
  assert.equal(r.stalled, true);
});

test("credit card: 1% + floor on $3,000 at 20% pays off in a plausible time", () => {
  const r = creditCard({ balance: 3000, apr: 0.20, minPct: 0.03, minFloor: 25 });
  assert.ok(r.months > 100 && r.months < 300, `months=${r.months}`);
  assert.ok(r.totalInterest > 1500, `interest=${r.totalInterest}`);
});

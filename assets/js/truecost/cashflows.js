// cashflows.js — turn a credit offer into cash flows and summary numbers.
// Pure functions; no DOM. Currency-neutral.
import { periodicRate, annualise, annuityPayment, round2 } from "./irr.js";

export const PERIODS = {
  week: { label: "weekly", perYear: 52 },
  fortnight: { label: "every 2 weeks", perYear: 26 },
  month: { label: "monthly", perYear: 12 }
};

/** Pay-in-4 / Buy Now Pay Later.
 *  price            cash price of the goods
 *  instalments      number of equal payments (default 4)
 *  period           "fortnight" | "month" | "week"
 *  firstAtPurchase  true if the first instalment is paid at checkout
 *  upfrontFee       fee paid at checkout (service / account fee)
 *  perPaymentFee    fee added to every instalment
 *  lateFee          fee charged if a payment is missed
 *  latePayment      index (1-based) of a payment paid one period late, or 0
 */
export function bnpl(o) {
  const n = Math.max(1, Math.round(o.instalments || 4));
  const per = PERIODS[o.period || "fortnight"];
  const inst = o.price / n;
  const flows = [{ t: 0, amount: o.price - (o.upfrontFee || 0), label: "Goods received, upfront fee paid" }];
  const schedule = [];
  for (let k = 0; k < n; k++) {
    let t = o.firstAtPurchase ? k : k + 1;
    let amount = inst + (o.perPaymentFee || 0);
    let note = "";
    if (o.latePayment && o.latePayment === k + 1) {
      t += 1; amount += (o.lateFee || 0); note = "paid one period late + late fee";
    }
    flows.push({ t, amount: -amount, label: `Instalment ${k + 1}${note ? " (" + note + ")" : ""}` });
    schedule.push({ n: k + 1, t, amount, note });
  }
  return summarise(flows, per.perYear, o.price, schedule, per);
}

/** "0% EMI" with a processing fee and/or a cash discount forgone.
 *  price           sticker price financed over n months
 *  months          number of monthly instalments
 *  processingFee   paid at purchase
 *  cashDiscount    amount you would have saved by paying cash instead
 *  lateFee / latePayment as above
 */
export function zeroEmi(o) {
  const n = Math.max(1, Math.round(o.months || 12));
  const per = PERIODS.month;
  const cashPrice = o.price - (o.cashDiscount || 0);
  const emi = o.price / n;
  const flows = [{ t: 0, amount: cashPrice - (o.processingFee || 0), label: "Goods received (cash price), fee paid" }];
  const schedule = [];
  for (let k = 1; k <= n; k++) {
    let t = k, amount = emi, note = "";
    if (o.latePayment && o.latePayment === k) { t += 1; amount += (o.lateFee || 0); note = "late"; }
    flows.push({ t, amount: -amount, label: `EMI ${k}` });
    schedule.push({ n: k, t, amount, note });
  }
  return summarise(flows, per.perYear, cashPrice, schedule, per);
}

/** Instalment loan quoted at a flat rate or a reducing-balance rate.
 *  principal, months, rate (annual, as a decimal), basis "flat"|"reducing",
 *  upfrontFee (deducted from the amount you actually receive),
 *  lateFee / latePayment.
 */
export function instalmentLoan(o) {
  const n = Math.max(1, Math.round(o.months || 12));
  const per = PERIODS.month;
  let payment;
  if (o.basis === "flat") {
    const interest = o.principal * o.rate * (n / 12);
    payment = (o.principal + interest) / n;
  } else {
    payment = annuityPayment(o.principal, o.rate / 12, n);
  }
  const flows = [{ t: 0, amount: o.principal - (o.upfrontFee || 0), label: "Loan received less upfront fee" }];
  const schedule = [];
  for (let k = 1; k <= n; k++) {
    let t = k, amount = payment, note = "";
    if (o.latePayment && o.latePayment === k) { t += 1; amount += (o.lateFee || 0); note = "late"; }
    flows.push({ t, amount: -amount, label: `Payment ${k}` });
    schedule.push({ n: k, t, amount, note });
  }
  const s = summarise(flows, per.perYear, o.principal, schedule, per);
  s.payment = payment;
  return s;
}

/** Credit card minimum-payment payoff simulation.
 *  balance, apr (nominal annual, decimal), minPct (of balance, decimal),
 *  minFloor (absolute minimum payment), fixedPayment (optional override),
 *  maxMonths safety cap.
 *  Interest accrues monthly at apr/12 on the opening balance; payment is
 *  applied after interest. Minimum = max(minFloor, minPct × balance), or
 *  the whole balance if smaller.
 */
export function creditCard(o) {
  const r = o.apr / 12;
  let bal = o.balance;
  const rows = [];
  let totalInterest = 0, totalPaid = 0, month = 0;
  const cap = o.maxMonths || 600;
  while (bal > 0.005 && month < cap) {
    month++;
    const interest = bal * r;
    bal += interest;
    totalInterest += interest;
    let pay = o.fixedPayment ? o.fixedPayment : Math.max(o.minFloor || 0, (o.minPct || 0) * bal);
    pay = Math.min(pay, bal);
    if (pay <= interest && !o.fixedPayment && month > 1) {
      // Never pays down: stop and flag.
      rows.push({ month, interest, payment: pay, balance: bal - pay });
      return { months: Infinity, totalInterest: Infinity, totalPaid: Infinity, rows, stalled: true };
    }
    bal -= pay;
    totalPaid += pay;
    rows.push({ month, interest, payment: pay, balance: Math.max(0, bal) });
    if (o.fixedPayment && pay <= interest) {
      return { months: Infinity, totalInterest: Infinity, totalPaid: Infinity, rows, stalled: true };
    }
  }
  return { months: month, totalInterest, totalPaid, rows, stalled: bal > 0.005 };
}

function summarise(flows, perYear, cashAlternative, schedule, per) {
  const i = periodicRate(flows);
  const { apr, eay } = annualise(i, perYear);
  const totalPaid = -flows.filter(f => f.amount < 0).reduce((a, f) => a + f.amount, 0) + Math.max(0, cashAlternative - flows[0].amount);
  // totalPaid = all instalments + upfront fees (cashAlternative − received)
  const extraCost = totalPaid - cashAlternative;
  return {
    flows, schedule, periodsPerYear: perYear, periodLabel: per.label,
    periodicRate: i, apr, eay,
    totalPaid: round2(totalPaid), cashPrice: round2(cashAlternative), extraCost: round2(extraCost)
  };
}

/** Run an offer by type name. */
export function runOffer(type, params) {
  switch (type) {
    case "bnpl": return bnpl(params);
    case "zeroEmi": return zeroEmi(params);
    case "loan": return instalmentLoan(params);
    default: throw new Error("Unknown offer type " + type);
  }
}

/** Convert a flat rate to its reducing-balance equivalent for a given term. */
export function flatToReducing(rate, months) {
  const s = instalmentLoan({ principal: 1000, months, rate, basis: "flat" });
  return s.apr;
}

// sample.js — generates the SYNTHETIC demo data set. Every name, number
// and date here is invented. Deterministic (seeded), so the tests and the
// files in /data/recon-sample agree.

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const CUSTOMERS = [
  "Blue Fern Traders", "Northgate Supplies", "Kestrel Logistics", "Mirror Lake Foods",
  "Pennant Textiles", "Orchard Row Electronics", "Saltmarsh Pharma", "Tidewater Apparel",
  "Granite Peak Hardware", "Lantern Street Books"
];
const DAY = 86400000;
const AS_OF = Date.UTC(2026, 10, 16); // 16 Nov 2026

const iso = ms => new Date(ms).toISOString().slice(0, 10);
const r2 = x => Math.round(x * 100) / 100;

/**
 * Build the sample.
 * n = number of invoices on side A. Returns { a, b, expected, asOf } where
 * a/b are arrays of plain row objects (as they would be read from CSV) and
 * expected lists the matches the engine should find.
 */
export function generateSample(n = 60, seed = 20261116) {
  const rnd = mulberry32(seed);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const usedAmounts = new Set();
  const reserve = v => usedAmounts.add(Math.round(v * 100));
  const amount = () => {
    for (;;) {
      const v = r2(100 + rnd() * 49900);
      const k = Math.round(v * 100);
      let clash = false; for (let d = -10; d <= 10; d++) if (usedAmounts.has(k + d)) { clash = true; break; }
      if (!clash) { usedAmounts.add(k); return v; }
    }
  };

  const a = [], b = [], expected = [];
  let invNo = 1001, txn = 500100;
  const invoice = (date, customer, amt, desc) => {
    const row = { "Invoice No": `INV-2026-${invNo++}`, "Invoice Date": iso(date), "Customer": customer, "Amount": amt.toFixed(2), "Description": desc };
    a.push(row); return row;
  };
  const payment = (date, payer, amt, ref) => {
    const row = { "Value Date": iso(date), "Payer": payer, "Amount": amt.toFixed(2), "Reference": ref, "Bank Txn ID": `TXN${txn++}` };
    b.push(row); return row;
  };
  const recentDate = () => AS_OF - Math.floor(rnd() * 100 + 5) * DAY;

  // Scenario mix, scaled with n.
  const counts = {
    clean: Math.max(1, Math.round(n * 0.68)),
    noRef: Math.max(1, Math.round(n * 0.06)),
    cents: Math.max(1, Math.round(n * 0.03)),
    typo: Math.max(1, Math.round(n * 0.05)),
    partial: Math.max(1, Math.round(n * 0.04)),
    batch: Math.max(1, Math.round(n * 0.02)),
    dup: 1,
    aged: Math.max(1, Math.round(n * 0.06)),
    strayPayments: Math.max(1, Math.round(n * 0.03))
  };

  // 1. Clean: same reference, same amount → rule 1
  for (let i = 0; i < counts.clean; i++) {
    const c = pick(CUSTOMERS), d = recentDate(), amt = amount();
    const inv = invoice(d, c, amt, "Goods supplied");
    const style = rnd();
    const ref = style < 0.6 ? inv["Invoice No"] : style < 0.8 ? inv["Invoice No"].replace(/-/g, "/").toLowerCase() : `Payment for ${inv["Invoice No"]}`;
    const p = payment(d + Math.floor(rnd() * 12) * DAY, c, amt, ref);
    expected.push({ rule: 1, a: [inv["Invoice No"]], b: [p["Bank Txn ID"]], why: "same reference and amount" });
  }
  // 2. No reference, paid within a few days → rule 2 (timing difference)
  for (let i = 0; i < counts.noRef; i++) {
    const c = pick(CUSTOMERS), d = recentDate(), amt = amount();
    const inv = invoice(d, c, amt, "Goods supplied");
    const p = payment(d + (1 + Math.floor(rnd() * 5)) * DAY, c, amt, "ONLINE TRANSFER");
    expected.push({ rule: 2, a: [inv["Invoice No"]], b: [p["Bank Txn ID"]], why: "no reference; amount and date agree" });
  }
  // 3. A few cents off (bank charges / rounding) → rule 2
  for (let i = 0; i < counts.cents; i++) {
    const c = pick(CUSTOMERS), d = recentDate(), amt = amount();
    const inv = invoice(d, c, amt, "Goods supplied");
    const p = payment(d + 2 * DAY, c, r2(amt - 0.03), inv["Invoice No"]); reserve(amt - 0.03);
    expected.push({ rule: 2, a: [inv["Invoice No"]], b: [p["Bank Txn ID"]], why: "amount 3 cents short" });
  }
  // 4. Typo in the reference, paid late (outside the date window) → rule 3
  for (let i = 0; i < counts.typo; i++) {
    const c = pick(CUSTOMERS), d = recentDate(), amt = amount();
    const inv = invoice(d, c, amt, "Goods supplied");
    const no = inv["Invoice No"];
    const typo = i % 2 === 0 ? no.replace(/0/, "O") : no.slice(0, -2) + no.slice(-1) + no.slice(-2, -1); // O for 0, or swapped last digits
    const p = payment(d + (20 + Math.floor(rnd() * 20)) * DAY, c, amt, typo);
    expected.push({ rule: 3, a: [inv["Invoice No"]], b: [p["Bank Txn ID"]], why: `reference typed as ${typo}` });
  }
  // 5. Partial payments: one invoice, two payments → rule 4
  for (let i = 0; i < counts.partial; i++) {
    const c = pick(CUSTOMERS), d = recentDate(), amt = amount();
    const inv = invoice(d, c, amt, "Goods supplied (instalments)");
    const first = r2(amt * (0.3 + rnd() * 0.4)); reserve(first); reserve(amt - first);
    const p1 = payment(d + 5 * DAY, c, first, `${inv["Invoice No"]} PART 1`);
    const p2 = payment(d + 25 * DAY, c, r2(amt - first), `${inv["Invoice No"]} PART 2`);
    expected.push({ rule: 4, a: [inv["Invoice No"]], b: [p1["Bank Txn ID"], p2["Bank Txn ID"]], why: "two partial payments" });
  }
  // 6. One payment covering three invoices → rule 4
  for (let i = 0; i < counts.batch; i++) {
    const c = pick(CUSTOMERS), d = recentDate();
    const invs = [0, 1, 2].map(k => invoice(d + k * 3 * DAY, c, amount(), "Goods supplied"));
    const total = r2(invs.reduce((s, x) => s + Number(x.Amount), 0)); reserve(total);
    const p = payment(d + 15 * DAY, c, total, "SETTLEMENT 3 INVOICES");
    expected.push({ rule: 4, a: invs.map(x => x["Invoice No"]), b: [p["Bank Txn ID"]], why: "one payment settles three invoices" });
  }
  // 7. Duplicate payment → one matches (rule 1), the copy is flagged
  for (let i = 0; i < counts.dup; i++) {
    const c = pick(CUSTOMERS), d = recentDate(), amt = amount();
    const inv = invoice(d, c, amt, "Goods supplied");
    const p1 = payment(d + 3 * DAY, c, amt, inv["Invoice No"]);
    const p2 = payment(d + 3 * DAY, c, amt, inv["Invoice No"]);
    expected.push({ rule: 1, a: [inv["Invoice No"]], b: [p1["Bank Txn ID"]], why: "paid once; the second payment is a duplicate", duplicate: p2["Bank Txn ID"] });
  }
  // 8. Aged, unpaid invoices spread across the ageing buckets
  const ages = [10, 45, 75, 120, 200];
  for (let i = 0; i < counts.aged; i++) {
    const c = pick(CUSTOMERS);
    invoice(AS_OF - ages[i % ages.length] * DAY, c, amount(), "Goods supplied (unpaid)");
  }
  // 9. Stray payments with no invoice
  for (let i = 0; i < counts.strayPayments; i++) {
    payment(recentDate(), pick(CUSTOMERS), amount(), i % 2 ? "ADVANCE" : "CREDIT NOTE REFUND");
  }

  // Shuffle both sides so order carries no information.
  shuffle(a, rnd); shuffle(b, rnd);
  return { a, b, expected, asOf: AS_OF, counts };
}

function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
}

export const SAMPLE_MAPPING = {
  a: { date: "Invoice Date", amount: "Amount", ref: "Invoice No", party: "Customer" },
  b: { date: "Value Date", amount: "Amount", ref: "Reference", party: "Payer" }
};

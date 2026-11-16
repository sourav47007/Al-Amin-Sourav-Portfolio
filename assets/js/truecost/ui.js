// ui.js — True Cost interface. All maths lives in cashflows.js / irr.js.
import { runOffer, creditCard, flatToReducing, PERIODS } from "./cashflows.js";
import { fmtMoney, fmtPct, fmtNum } from "/assets/js/shared/format.js";
import { copyShareLink } from "/assets/js/shared/urlstate.js";
import { loadChart, applyChartTheme } from "/assets/js/shared/chart-theme.js";
import { lazyMath } from "/assets/js/shared/katex-lazy.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const CURRENCIES = ["USD", "GBP", "EUR", "BDT", "INR", "PKR", "AUD", "CAD", "SGD", "AED", "JPY", "NGN", "KES", "ZAR"];

// ---- offer schemas: field definitions per type --------------------------
const SCHEMAS = {
  bnpl: {
    label: "Pay-in-4 / Buy Now Pay Later",
    fields: [
      { k: "price", label: "Purchase price", type: "money", def: 200 },
      { k: "instalments", label: "Number of instalments", type: "int", def: 4, min: 1, max: 48 },
      { k: "period", label: "Paid every", type: "select", def: "fortnight", options: Object.entries(PERIODS).map(([v, p]) => [v, p.label]) },
      { k: "firstAtPurchase", label: "First instalment at checkout", type: "bool", def: true },
      { k: "upfrontFee", label: "Upfront / service fee", type: "money", def: 0 },
      { k: "perPaymentFee", label: "Fee per instalment", type: "money", def: 0 },
      { k: "lateFee", label: "Late fee (if a payment is missed)", type: "money", def: 7 }
    ]
  },
  zeroEmi: {
    label: "\"0% EMI\" instalment plan",
    fields: [
      { k: "price", label: "Sticker price (financed)", type: "money", def: 60000 },
      { k: "months", label: "Months", type: "int", def: 12, min: 1, max: 60 },
      { k: "processingFee", label: "Processing fee (paid upfront)", type: "money", def: 1200 },
      { k: "cashDiscount", label: "Cash discount you give up", type: "money", def: 3000 },
      { k: "lateFee", label: "Late fee", type: "money", def: 500 }
    ]
  },
  loan: {
    label: "Instalment loan (flat or reducing rate)",
    fields: [
      { k: "principal", label: "Loan amount", type: "money", def: 100000 },
      { k: "months", label: "Months", type: "int", def: 24, min: 1, max: 360 },
      { k: "rate", label: "Quoted annual rate (%)", type: "pct", def: 9 },
      { k: "basis", label: "Rate basis", type: "select", def: "flat", options: [["flat", "flat (on original amount)"], ["reducing", "reducing balance"]] },
      { k: "upfrontFee", label: "Upfront fee (deducted)", type: "money", def: 1000 },
      { k: "lateFee", label: "Late fee", type: "money", def: 500 }
    ]
  }
};

// ---- state ---------------------------------------------------------------
const defaults = () => ({
  cur: "USD", tab: "single", type: "bnpl",
  p: defaultParams("bnpl"), late: 0,
  cmp: [],                                  // [{type, p, name}]
  cc: { balance: 3000, apr: 24, minPct: 3, minFloor: 25, fixed: 0 }
});
function defaultParams(type) {
  const o = {};
  for (const f of SCHEMAS[type].fields) o[f.k] = f.def;
  return o;
}
let state = defaults();

function loadState() {
  try {
    const h = new URLSearchParams(location.hash.slice(1)).get("s");
    if (h) {
      const parsed = JSON.parse(decodeURIComponent(h));
      state = { ...defaults(), ...parsed };
      if (!SCHEMAS[state.type]) state.type = "bnpl";
      state.p = { ...defaultParams(state.type), ...(state.p || {}) };
      state.cmp = (state.cmp || []).filter(c => SCHEMAS[c.type]).slice(0, 3);
    }
  } catch { state = defaults(); }
}
function saveState() {
  const s = encodeURIComponent(JSON.stringify(state));
  history.replaceState(null, "", "#s=" + s);
}

// ---- helpers -------------------------------------------------------------
const money = v => fmtMoney(v, state.cur, state.cur === "JPY" ? 0 : 2);
function toModel(type, p) {
  // Convert UI params (percent as 9) to model params (rate as 0.09).
  const m = { ...p };
  if ("rate" in m) m.rate = Number(m.rate) / 100;
  for (const k of Object.keys(m)) if (typeof m[k] === "string" && m[k] !== "" && !isNaN(m[k]) && k !== "basis" && k !== "period") m[k] = Number(m[k]);
  return m;
}
function aprText(apr) {
  if (apr == null) return "n/a";
  if (apr > 10) return "> 1,000%";
  return fmtPct(apr, 2);
}

// ---- rendering: single offer --------------------------------------------
function renderForm() {
  const sch = SCHEMAS[state.type];
  const wrap = $("#offer-fields");
  wrap.innerHTML = sch.fields.map(f => {
    const id = "f-" + f.k;
    const v = state.p[f.k];
    if (f.type === "select") {
      return `<div class="field"><label for="${id}">${f.label}</label><select id="${id}" data-k="${f.k}">${f.options.map(([val, lab]) => `<option value="${val}"${val === v ? " selected" : ""}>${lab}</option>`).join("")}</select></div>`;
    }
    if (f.type === "bool") {
      return `<div class="field"><label class="toggle"><input type="checkbox" id="${id}" data-k="${f.k}"${v ? " checked" : ""}> ${f.label}</label></div>`;
    }
    const step = f.type === "int" ? 1 : f.type === "pct" ? 0.05 : "any";
    return `<div class="field"><label for="${id}">${f.label}${f.type === "money" ? ` (${state.cur})` : ""}</label><input type="number" id="${id}" data-k="${f.k}" value="${v}" step="${step}" min="${f.min ?? 0}"${f.max ? ` max="${f.max}"` : ""} inputmode="decimal"></div>`;
  }).join("");
  $$("[data-k]", wrap).forEach(el => el.addEventListener("input", () => {
    const k = el.dataset.k;
    state.p[k] = el.type === "checkbox" ? el.checked : el.value;
    update();
  }));
  // Late-payment selector
  const n = Number(state.p.instalments || state.p.months || 4);
  const sel = $("#late-which");
  sel.innerHTML = `<option value="0">No late payment</option>` + Array.from({ length: n }, (_, i) => `<option value="${i + 1}"${state.late === i + 1 ? " selected" : ""}>Payment ${i + 1} is one period late</option>`).join("");
}

function renderResults() {
  const out = $("#offer-results");
  let s;
  try { s = runOffer(state.type, toModel(state.type, state.p)); }
  catch (e) { out.innerHTML = `<p class="notice notice--err">${e.message}</p>`; return; }
  const lateS = state.late ? runOffer(state.type, { ...toModel(state.type, state.p), latePayment: state.late }) : null;

  const perYear = s.periodsPerYear;
  let extraLine = "";
  if (state.type === "loan") {
    const p = toModel("loan", state.p);
    if (p.basis === "flat") extraLine = `<p class="small">A flat ${fmtPct(p.rate, 2)} over ${p.months} months works out to about <b class="num">${fmtPct(flatToReducing(p.rate, p.months), 2)}</b> on a reducing-balance basis, before fees.</p>`;
    extraLine += `<p class="small">Monthly payment: <b class="num">${money(s.payment)}</b></p>`;
  }
  out.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="kpi__label">APR (actuarial)</div><div class="kpi__value">${aprText(s.apr)}</div><div class="kpi__sub">nominal, ${perYear} periods/yr</div></div>
      <div class="kpi"><div class="kpi__label">Effective annual yield</div><div class="kpi__value">${aprText(s.eay)}</div><div class="kpi__sub">compounded</div></div>
      <div class="kpi"><div class="kpi__label">Total paid</div><div class="kpi__value">${money(s.totalPaid)}</div><div class="kpi__sub">vs ${money(s.cashPrice)} cash</div></div>
      <div class="kpi"><div class="kpi__label">Extra cost</div><div class="kpi__value ${s.extraCost > 0 ? "down" : "flat"}">${money(s.extraCost)}</div><div class="kpi__sub">${s.cashPrice ? fmtPct(s.extraCost / s.cashPrice, 1) + " of cash price" : ""}</div></div>
    </div>
    ${extraLine}
    ${lateS ? `<div class="notice notice--warn">If payment ${state.late} is one period late: APR <b>${aprText(lateS.apr)}</b>, total paid <b>${money(lateS.totalPaid)}</b> (extra ${money(lateS.totalPaid - s.totalPaid)} on top).</div>` : ""}
    <details><summary class="pixel small">Payment schedule</summary>
      <div class="table-wrap"><table><thead><tr><th>#</th><th>Period</th><th class="num">Amount</th><th>Note</th></tr></thead><tbody>
      ${(lateS || s).schedule.map(r => `<tr><td class="num">${r.n}</td><td class="num">${r.t}</td><td class="num">${money(r.amount)}</td><td>${r.note || ""}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="small muted">Period = ${s.periodLabel}. Period 0 is the purchase date.</p>
    </details>
    <p class="small" id="single-summary">${summarySentence(s)}</p>`;
}

function summarySentence(s) {
  if (s.apr == null) return "There is nothing to repay, so no rate applies.";
  if (Math.abs(s.apr) < 1e-9) return "This offer costs the same as paying cash. Its real rate is 0%. Fees and late payments are what change that.";
  return `Borrowing ${money(s.cashPrice)} this way costs ${money(s.extraCost)} more than cash, which is an annual rate of ${aprText(s.apr)}.`;
}

// ---- compare mode -------------------------------------------------------
function renderCompare() {
  const box = $("#compare-table");
  if (!state.cmp.length) { box.innerHTML = `<p class="muted small">No offers added yet. Set one up on the first tab and press “Add to compare”.</p>`; return; }
  const rows = state.cmp.map((c, i) => {
    const s = runOffer(c.type, toModel(c.type, c.p));
    return { i, name: c.name || SCHEMAS[c.type].label, s };
  });
  const finite = rows.filter(r => r.s.apr != null);
  const bestApr = finite.length ? Math.min(...finite.map(r => r.s.apr)) : null;
  const bestCost = Math.min(...rows.map(r => r.s.extraCost));
  box.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Offer</th><th class="num">APR</th><th class="num">Eff. yield</th><th class="num">Total paid</th><th class="num">Extra vs cash</th><th></th></tr></thead>
    <tbody>${rows.map(r => `<tr${r.s.apr === bestApr ? ' class="is-matched"' : ""}>
      <td>${r.name}${r.s.apr === bestApr ? ' <span class="tag tag--up">cheapest by APR</span>' : ""}${r.s.extraCost === bestCost && r.s.apr !== bestApr ? ' <span class="tag">lowest extra cost</span>' : ""}</td>
      <td class="num">${aprText(r.s.apr)}</td><td class="num">${aprText(r.s.eay)}</td><td class="num">${money(r.s.totalPaid)}</td><td class="num">${money(r.s.extraCost)}</td>
      <td><button class="btn btn--small" data-remove="${r.i}">remove</button></td></tr>`).join("")}</tbody></table></div>
    <p class="small muted">Cheapest is judged by APR, which adjusts for how long you hold the money. The lowest total extra cost is also flagged because a short, expensive offer can still cost fewer units of currency overall.</p>`;
  $$("[data-remove]", box).forEach(b => b.addEventListener("click", () => { state.cmp.splice(Number(b.dataset.remove), 1); update(); }));
}

// ---- credit card mode ---------------------------------------------------
let ccChart;
async function renderCard() {
  const cc = state.cc;
  const p = { balance: Number(cc.balance), apr: Number(cc.apr) / 100, minPct: Number(cc.minPct) / 100, minFloor: Number(cc.minFloor), fixedPayment: Number(cc.fixed) || 0 };
  const r = creditCard(p);
  const years = r.months === Infinity ? null : r.months / 12;
  const out = $("#cc-results");
  out.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="kpi__label">Months to pay off</div><div class="kpi__value">${r.months === Infinity ? "never" : fmtNum(r.months)}</div><div class="kpi__sub">${years ? `about ${years.toFixed(1)} years` : "payments do not cover interest"}</div></div>
      <div class="kpi"><div class="kpi__label">Total interest</div><div class="kpi__value down">${r.months === Infinity ? "unbounded" : money(r.totalInterest)}</div><div class="kpi__sub">on ${money(p.balance)}</div></div>
      <div class="kpi"><div class="kpi__label">Total paid</div><div class="kpi__value">${r.months === Infinity ? "—" : money(r.totalPaid)}</div><div class="kpi__sub">${r.months === Infinity ? "" : fmtPct(r.totalPaid / p.balance - 1, 0) + " more than the balance"}</div></div>
    </div>
    <p class="small" id="cc-summary">${r.months === Infinity
      ? "At these settings the minimum payment never clears the balance; it only tracks the interest."
      : `Paying only the minimum, a ${money(p.balance)} balance at ${fmtPct(p.apr, 1)} takes ${r.months} months to clear and costs ${money(r.totalInterest)} in interest.`}</p>`;
  const Chart = await loadChart();
  applyChartTheme(Chart);
  const c = applyChartTheme(Chart);
  const rows = r.rows.slice(0, 600);
  const labels = rows.map(x => x.month);
  if (ccChart) ccChart.destroy();
  ccChart = new Chart($("#cc-chart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Balance", data: rows.map(x => x.balance), borderColor: c.ink, pointRadius: 0 },
        { label: "Cumulative interest", data: rows.map((x, i) => rows.slice(0, i + 1).reduce((a, y) => a + y.interest, 0)), borderColor: c.down, pointRadius: 0 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: { title: { display: true, text: "month" }, grid: { lineWidth: 1 }, ticks: { maxTicksLimit: 10 } }, y: { grid: { lineWidth: 1 }, ticks: { callback: v => fmtNum(v) } } },
      plugins: { legend: { position: "bottom" } }
    }
  });
}

// ---- tabs, events --------------------------------------------------------
function showTab(name) {
  state.tab = name;
  $$(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === name ? "true" : "false"));
  $$("[data-panel]").forEach(p => { p.hidden = p.dataset.panel !== name; });
  if (name === "card") renderCard();
}

function update() {
  renderResults();
  renderCompare();
  saveState();
}

function init() {
  loadState();
  const curSel = $("#currency");
  curSel.innerHTML = CURRENCIES.map(c => `<option${c === state.cur ? " selected" : ""}>${c}</option>`).join("");
  curSel.addEventListener("change", () => { state.cur = curSel.value; renderForm(); update(); if (state.tab === "card") renderCard(); });

  const typeSel = $("#offer-type");
  typeSel.innerHTML = Object.entries(SCHEMAS).map(([k, s]) => `<option value="${k}"${k === state.type ? " selected" : ""}>${s.label}</option>`).join("");
  typeSel.addEventListener("change", () => { state.type = typeSel.value; state.p = defaultParams(state.type); state.late = 0; renderForm(); update(); });

  $("#late-which").addEventListener("change", e => { state.late = Number(e.target.value); update(); });
  $("#reset").addEventListener("click", () => { state.p = defaultParams(state.type); state.late = 0; renderForm(); update(); });
  $("#add-compare").addEventListener("click", () => {
    if (state.cmp.length >= 3) { alert("Compare holds three offers. Remove one first."); return; }
    const name = `Offer ${state.cmp.length + 1}: ${SCHEMAS[state.type].label}`;
    state.cmp.push({ type: state.type, p: { ...state.p }, name });
    update(); showTab("compare");
  });
  $$(".tabs button").forEach(b => b.addEventListener("click", () => { showTab(b.dataset.tab); saveState(); }));
  $$("#share").forEach(b => b.addEventListener("click", () => copyShareLink(b)));

  // Credit card inputs
  for (const k of ["balance", "apr", "minPct", "minFloor", "fixed"]) {
    const el = $("#cc-" + k);
    el.value = state.cc[k];
    el.addEventListener("input", () => { state.cc[k] = el.value; saveState(); renderCard(); });
  }

  renderForm();
  update();
  showTab(state.tab || "single");
  lazyMath();
  document.addEventListener("themechange", () => { if (state.tab === "card") renderCard(); });
}

init();

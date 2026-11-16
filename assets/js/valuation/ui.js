// ui.js — What's Priced In? interface. Maths in dcf.js / reverse.js;
// data shaping in extract.js. This file only reads inputs and draws.
import { dcf, wacc as buildWacc } from "./dcf.js";
import { impliedGrowth, sensitivity } from "./reverse.js";
import { baseInputs } from "./extract.js";
import { fmtCompact, fmtPct, fmtNum, fmtMoney, fmtDate } from "/assets/js/shared/format.js";
import { readState, writeState, copyShareLink } from "/assets/js/shared/urlstate.js";
import { lazyMath } from "/assets/js/shared/katex-lazy.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Driver definitions: key, label, min, max, step, unit ("%" shown ×100)
const DRIVERS = [
  { k: "growth", label: "Revenue growth (years 1–10)", min: -20, max: 50, step: 0.5, pct: true },
  { k: "margin", label: "Operating margin", min: -20, max: 60, step: 0.5, pct: true },
  { k: "s2c", label: "Sales-to-capital ratio", min: 0.5, max: 10, step: 0.1, pct: false },
  { k: "tax", label: "Tax rate", min: 0, max: 40, step: 0.5, pct: true },
  { k: "rf", label: "Risk-free rate", min: 0, max: 10, step: 0.05, pct: true },
  { k: "erp", label: "Equity risk premium", min: 2, max: 10, step: 0.1, pct: true },
  { k: "beta", label: "Beta", min: 0, max: 3, step: 0.05, pct: false },
  { k: "kd", label: "Pre-tax cost of debt", min: 0, max: 15, step: 0.1, pct: true },
  { k: "dw", label: "Debt weight in capital", min: 0, max: 80, step: 1, pct: true },
  { k: "tg", label: "Terminal growth (capped at risk-free)", min: 0, max: 6, step: 0.1, pct: true }
];

const defaults = {
  ticker: "AAPL", price: 0, asof: "", tab: "tool", mode: "api",
  growth: 8, margin: 25, s2c: 2.5, tax: 21, rf: 4.2, erp: 4.5, beta: 1.1, kd: 5, dw: 10, tg: 3,
  // manual-entry data
  m_rev: 0, m_oi: 0, m_cash: 0, m_debt: 0, m_shares: 0, m_name: ""
};
let st = readState(defaults);
let fin = null;             // financials object from the API / preset
let baseline = null;        // driver values derived from data, for Reset

// ---------- data loading ----------
async function loadTicker(ticker, { quiet = false } = {}) {
  setStatus(`Loading ${ticker} from SEC EDGAR…`);
  try {
    const r = await fetch(`/api/sec?ticker=${encodeURIComponent(ticker)}`);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    applyFinancials(j, "api");
    setStatus(`${j.name} · SEC EDGAR, fetched ${fmtDate(j.fetchedAt)}`);
    return true;
  } catch (e) {
    const preset = await loadPreset(ticker, true);
    if (preset) return true;
    if (!quiet) setStatus(`Could not load ${ticker}: ${e.message}. Try a preset or enter numbers manually.`, "err");
    return false;
  }
}
async function loadPreset(ticker, silent = false) {
  try {
    const r = await fetch(`/data/presets/${ticker.toUpperCase()}.json`);
    if (!r.ok) throw new Error("no snapshot");
    const j = await r.json();
    applyFinancials(j, "preset");
    setStatus(`${j.name} · offline snapshot of SEC EDGAR data, fetched ${fmtDate(j.fetchedAt)}`, "warn");
    return true;
  } catch (e) {
    if (!silent) setStatus(`No offline snapshot for ${ticker}.`, "err");
    return false;
  }
}
async function loadPresetList() {
  try {
    const list = await (await fetch("/data/presets/index.json")).json();
    const sel = $("#preset");
    if (!list.length) { sel.innerHTML = `<option value="">[DATA NEEDED] no snapshots built yet</option>`; sel.disabled = true; return; }
    sel.innerHTML = `<option value="">Offline snapshots…</option>` + list.map(p => `<option value="${esc(p.ticker)}">${esc(p.ticker)} · ${esc(p.name)} (${esc(p.latest)})</option>`).join("");
  } catch { /* leave as is */ }
}

function applyFinancials(f, mode) {
  fin = f; st.mode = mode; st.ticker = f.ticker || st.ticker;
  const b = baseInputs(f);
  baseline = { growth: round(b.growth * 100, 1), margin: round(b.margin * 100, 1), s2c: round(b.salesToCapital, 1), tax: round(b.taxRate * 100, 1) };
  // Only overwrite drivers if the URL did not carry explicit values for this ticker.
  if (!st._fromUrl) Object.assign(st, baseline);
  st._fromUrl = false;
  renderSummary();
  renderSliders();
  update();
}

function manualFinancials() {
  const rev = Number(st.m_rev), oi = Number(st.m_oi);
  if (!(rev > 0) || !(Number(st.m_shares) > 0)) return null;
  return {
    name: st.m_name || "Manual entry", ticker: "", currency: "USD", source: "manual entry", fetchedAt: "",
    years: [{ end: "", fy: "", revenue: rev, operatingIncome: oi, da: 0, capex: 0, cash: Number(st.m_cash), debt: Number(st.m_debt), shares: Number(st.m_shares), taxRate: st.tax / 100 }],
    taxRate: st.tax / 100, quality: ["manual entry: numbers typed by the user, not fetched"]
  };
}

// ---------- rendering ----------
function setStatus(msg, kind = "ok") {
  const el = $("#status");
  el.textContent = msg;
  el.className = `notice notice--${kind}`;
}

function renderSummary() {
  const box = $("#summary");
  if (!fin) { box.innerHTML = ""; return; }
  const ys = fin.years;
  const rows = [
    ["Revenue", y => fmtCompact(y.revenue)],
    ["Growth", (y, i) => i ? fmtPct(y.revenue / ys[i - 1].revenue - 1) : "—"],
    ["Operating income", y => fmtCompact(y.operatingIncome)],
    ["Operating margin", y => fmtPct(y.operatingIncome / y.revenue)],
    ["D&A", y => fmtCompact(y.da)],
    ["Capex", y => fmtCompact(y.capex)],
    ["Cash", y => fmtCompact(y.cash)],
    ["Debt", y => fmtCompact(y.debt)],
    ["Diluted shares", y => fmtCompact(y.shares, 2)],
    ["Tax rate", y => y.taxRate == null ? "—" : fmtPct(y.taxRate)]
  ];
  box.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>${esc(fin.currency)}, fiscal year end</th>${ys.map(y => `<th class="num">${esc(y.end)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(([lab, f]) => `<tr><td>${lab}</td>${ys.map((y, i) => `<td class="num">${f(y, i)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
    ${fin.quality.length ? `<div class="notice notice--warn"><b>Data quality:</b> ${fin.quality.map(esc).join("; ")}.</div>` : `<p class="small muted">All fields found under their primary XBRL tags.</p>`}
    <p class="small muted">Source: ${esc(fin.source)}${fin.fetchedAt ? ", fetched " + fmtDate(fin.fetchedAt) : ""}. Figures as reported in 10-K filings; no adjustments.</p>`;
}

function renderSliders() {
  const box = $("#sliders");
  box.innerHTML = DRIVERS.map(d => `
    <div class="slider-row">
      <label for="sl-${d.k}"><span>${d.label}</span><span class="num" id="sv-${d.k}"></span></label>
      <input type="range" id="sl-${d.k}" data-k="${d.k}" min="${d.min}" max="${d.max}" step="${d.step}" value="${st[d.k]}">
      <input type="number" id="nb-${d.k}" data-k="${d.k}" min="${d.min}" max="${d.max}" step="${d.step}" value="${st[d.k]}" aria-label="${d.label} value">
    </div>`).join("");
  $$("input", box).forEach(el => el.addEventListener("input", () => {
    const k = el.dataset.k; const v = Number(el.value);
    st[k] = v;
    $(`#sl-${k}`).value = v; $(`#nb-${k}`).value = v;
    update();
  }));
}

function params() {
  const data = fin || manualFinancials();
  if (!data) return null;
  const y = data.years[data.years.length - 1];
  const rf = st.rf / 100;
  const w = buildWacc({ riskFree: rf, erp: st.erp / 100, beta: st.beta, costOfDebt: st.kd / 100, taxRate: st.tax / 100, debtWeight: st.dw / 100 });
  return {
    revenue: y.revenue, growth: st.growth / 100, margin: st.margin / 100, salesToCapital: st.s2c, taxRate: st.tax / 100,
    wacc: w, terminalGrowth: Math.min(st.tg / 100, rf), years: 10, cash: y.cash, debt: y.debt, shares: y.shares, _wacc: w, _rf: rf
  };
}

function update() {
  const p = params();
  const out = $("#output");
  DRIVERS.forEach(d => { const el = $(`#sv-${d.k}`); if (el) el.textContent = d.pct ? `${st[d.k]}%` : st[d.k]; });
  if (!p) { out.innerHTML = `<p class="muted">Load a ticker, pick a snapshot, or enter numbers manually to start.</p>`; writeState(st, defaults); return; }
  const r = dcf(p);
  const price = Number(st.price) || 0;
  const vps = r.perShare;
  const diff = price ? vps / price - 1 : null;

  // Reverse DCF
  let sentence = "";
  if (price > 0) {
    const ig = impliedGrowth(p, price);
    if (ig.growth != null) {
      sentence = `At ${fmtMoney(price)}, the market is pricing in <b class="num">${fmtPct(ig.growth, 1)}</b> revenue growth a year for 10 years, at a ${fmtPct(p.margin, 1)} operating margin and a ${fmtPct(p.wacc, 1)} discount rate.`;
      if (fin && fin.years.length > 1) {
        const hist = Math.pow(fin.years[fin.years.length - 1].revenue / fin.years[0].revenue, 1 / (fin.years.length - 1)) - 1;
        sentence += ` Over the last ${fin.years.length - 1} fiscal years revenue grew ${fmtPct(hist, 1)} a year.`;
      }
    } else sentence = `Reverse DCF: ${ig.reason}.`;
  } else sentence = "Enter a share price to see what growth it implies.";

  out.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="kpi__label">Value per share</div><div class="kpi__value">${vps == null ? "—" : fmtMoney(vps)}</div><div class="kpi__sub">WACC ${fmtPct(p.wacc, 2)} · terminal g ${fmtPct(p.terminalGrowth, 1)}</div></div>
      <div class="kpi"><div class="kpi__label">Market price</div><div class="kpi__value">${price ? fmtMoney(price) : "—"}</div><div class="kpi__sub">${st.asof ? "as of " + fmtDate(st.asof) : "typed by you"}</div></div>
      <div class="kpi"><div class="kpi__label">Value vs price</div><div class="kpi__value ${diff == null ? "" : diff >= 0 ? "up" : "down"}">${diff == null ? "—" : fmtPct(Math.abs(diff), 0)}</div><div class="kpi__sub">${diff == null ? "" : diff >= 0 ? "value above price" : "value below price"}</div></div>
      <div class="kpi"><div class="kpi__label">Terminal value share</div><div class="kpi__value">${r.terminalShare == null ? "—" : fmtPct(r.terminalShare, 0)}</div><div class="kpi__sub">of enterprise value</div></div>
    </div>
    ${gauge(vps, price)}
    <p class="lead" id="reverse-sentence">${sentence}</p>
    <h3>Sensitivity: value per share across growth × WACC</h3>
    ${heatmap(p, price, vps)}
    <details><summary class="pixel small">Forecast table (FCFF)</summary>
      <div class="table-wrap"><table><thead><tr><th>Year</th><th class="num">Revenue</th><th class="num">EBIT</th><th class="num">NOPAT</th><th class="num">Reinvestment</th><th class="num">FCFF</th><th class="num">PV</th></tr></thead>
      <tbody>${r.rows.map(x => `<tr><td class="num">${x.t}</td><td class="num">${fmtCompact(x.revenue)}</td><td class="num">${fmtCompact(x.ebit)}</td><td class="num">${fmtCompact(x.nopat)}</td><td class="num">${fmtCompact(x.reinvest)}</td><td class="num">${fmtCompact(x.fcff)}</td><td class="num">${fmtCompact(x.pv)}</td></tr>`).join("")}
      <tr><td>Terminal</td><td colspan="4" class="muted">FCFF<sub>11</sub> / (WACC − g)</td><td class="num">${fmtCompact(r.terminalValue)}</td><td class="num">${fmtCompact(r.pvTerminal)}</td></tr>
      <tr><td>Enterprise value</td><td colspan="5"></td><td class="num">${fmtCompact(r.enterpriseValue)}</td></tr>
      <tr><td>+ cash − debt</td><td colspan="5"></td><td class="num">${fmtCompact((p.cash || 0) - (p.debt || 0))}</td></tr>
      <tr><td>Equity value</td><td colspan="5"></td><td class="num">${fmtCompact(r.equityValue)}</td></tr>
      </tbody></table></div></details>`;
  writeState(st, defaults);
}

function gauge(vps, price) {
  if (vps == null) return "";
  const max = Math.max(vps, price, 1) * 1.25;
  const n = 24;
  const on = Math.round(Math.max(0, vps) / max * n);
  const mark = price ? Math.round(price / max * n) : -1;
  const blocks = Array.from({ length: n }, (_, i) => `<i class="${i === mark ? "mark" : i < on ? "on" : ""}"></i>`).join("");
  return `<div class="gauge" role="img" aria-label="Value per share ${fmtMoney(vps)} against market price ${price ? fmtMoney(price) : "not set"}">
    <div class="gauge__bar">${blocks}</div>
    <div class="gauge__labels"><span>0</span><span class="up">■ value ${fmtMoney(vps)}</span>${price ? `<span style="color:var(--amber)">■ price ${fmtMoney(price)}</span>` : ""}<span>${fmtMoney(max)}</span></div></div>`;
}

function heatmap(p, price, vps) {
  const gs = [-10, -5, 0, 5, 10, 15, 20, 25, 30].map(x => x / 100);
  const center = p.growth;
  // Centre the growth axis on the current growth, in 2.5-point steps.
  const growths = Array.from({ length: 9 }, (_, i) => round(center + (i - 4) * 0.025, 4));
  const waccs = Array.from({ length: 7 }, (_, i) => round(p.wacc + (i - 3) * 0.01, 4)).filter(w => w > 0.01);
  const grid = sensitivity(p, growths, waccs);
  const all = grid.flat().filter(v => v != null && isFinite(v));
  const ref = price || vps || 1;
  const cell = v => {
    if (v == null || !isFinite(v)) return `<div class="c">—</div>`;
    const rel = Math.max(-1, Math.min(1, (v - ref) / ref));
    const pctMix = Math.round(Math.abs(rel) * 55 + 8);
    const col = rel >= 0 ? "var(--up)" : "var(--down)";
    const mk = price && Math.abs(v - price) / price < 0.05 ? " mk" : "";
    return `<div class="c${mk}" style="background:color-mix(in srgb, ${col} ${pctMix}%, var(--surface))">${fmtNum(v, 0)}</div>`;
  };
  const summary = `Value per share ranges from ${fmtMoney(Math.min(...all))} to ${fmtMoney(Math.max(...all))} across growth from ${fmtPct(growths[0], 1)} to ${fmtPct(growths[8], 1)} and WACC from ${fmtPct(waccs[0], 1)} to ${fmtPct(waccs[waccs.length - 1], 1)}.${price ? " Cells within 5% of the market price are outlined in amber." : ""}`;
  return `<div class="heat" style="grid-template-columns: 72px repeat(${waccs.length}, 1fr)" role="img" aria-label="${esc(summary)}">
    <div class="h">g ↓ WACC →</div>${waccs.map(w => `<div class="h">${fmtPct(w, 1)}</div>`).join("")}
    ${growths.map((g, i) => `<div class="h">${fmtPct(g, 1)}</div>${grid[i].map(cell).join("")}`).join("")}
  </div><p class="small muted">${summary}</p>`;
}

function round(x, d) { const m = Math.pow(10, d); return Math.round(x * m) / m; }

// ---------- tabs & init ----------
function showTab(name) {
  st.tab = name;
  $$(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === name ? "true" : "false"));
  $$("[data-panel]").forEach(p => { p.hidden = p.dataset.panel !== name; });
  writeState(st, defaults);
}

async function init() {
  st._fromUrl = location.hash.length > 1;
  $("#ticker").value = st.ticker;
  $("#price").value = st.price || "";
  $("#asof").value = st.asof || "";
  for (const k of ["m_rev", "m_oi", "m_cash", "m_debt", "m_shares", "m_name"]) {
    const el = $("#" + k); el.value = st[k] || "";
    el.addEventListener("input", () => { st[k] = el.value; if (st.mode === "manual") { fin = null; update(); } });
  }
  $("#load").addEventListener("click", () => { st._fromUrl = false; loadTicker($("#ticker").value.trim().toUpperCase()); });
  $("#ticker").addEventListener("keydown", e => { if (e.key === "Enter") $("#load").click(); });
  $("#preset").addEventListener("change", e => { if (e.target.value) { st._fromUrl = false; loadPreset(e.target.value); } });
  $("#manual-toggle").addEventListener("click", () => {
    st.mode = "manual"; fin = null; $("#manual").hidden = false; renderSummary(); renderSliders();
    setStatus("Manual entry: type the base-year figures from the latest annual report.", "warn"); update();
  });
  $("#price").addEventListener("input", e => { st.price = Number(e.target.value) || 0; update(); });
  $("#asof").addEventListener("input", e => { st.asof = e.target.value; update(); });
  $("#reset").addEventListener("click", () => {
    Object.assign(st, { rf: defaults.rf, erp: defaults.erp, beta: defaults.beta, kd: defaults.kd, dw: defaults.dw, tg: defaults.tg }, baseline || { growth: defaults.growth, margin: defaults.margin, s2c: defaults.s2c, tax: defaults.tax });
    renderSliders(); update();
  });
  $("#share").addEventListener("click", e => copyShareLink(e.target));
  $$(".tabs button").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
  showTab(st.tab || "tool");
  renderSliders();
  lazyMath();
  loadPresetList();
  if (st.mode === "manual") { $("#manual").hidden = false; setStatus("Manual entry: numbers typed by the user, not fetched.", "warn"); update(); }
  else if (st.mode === "preset") { if (!(await loadPreset(st.ticker))) loadTicker(st.ticker); }
  else loadTicker(st.ticker);
}
init();

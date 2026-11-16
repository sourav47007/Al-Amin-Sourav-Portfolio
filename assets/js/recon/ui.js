// ui.js — Recon interface. Parsing on the main thread, matching in a Worker.
import { parseFile, parseCsvText, guessMapping, toRecords } from "./parse.js";
import { DEFAULT_OPTIONS, RULES } from "./match.js";
import { exportCsv, exportXlsx } from "./export.js";
import { fmtNum, fmtPct, fmtDate } from "/assets/js/shared/format.js";
import { readState, writeState, copyShareLink } from "/assets/js/shared/urlstate.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const sides = { A: null, B: null };     // { headers, rows, name, mapping }
let result = null, records = { A: [], B: [] };
let worker;

const defaults = {
  tol: DEFAULT_OPTIONS.amountTolerance, tolPct: DEFAULT_OPTIONS.amountTolerancePct,
  win: DEFAULT_OPTIONS.dateWindowDays, fuzzy: DEFAULT_OPTIONS.fuzzyThreshold,
  gwin: DEFAULT_OPTIONS.groupWindowDays, dayFirst: true, asOf: ""
};
let opts = readState(defaults);

// ---- file loading ----
async function loadSide(side, file) {
  const parsed = await parseFile(file);
  setSide(side, parsed, file.name);
}
function setSide(side, parsed, name) {
  sides[side] = { ...parsed, name, mapping: guessMapping(parsed.headers) };
  $(`#file-${side}-info`).textContent = `${name}: ${fmtNum(parsed.rows.length)} rows, ${parsed.headers.length} columns`;
  renderMapping(side);
  checkReady();
}
async function loadDemo() {
  const [a, b] = await Promise.all([
    fetch("/data/recon-sample/side_a_invoices.csv").then(r => r.text()),
    fetch("/data/recon-sample/side_b_bank_payments.csv").then(r => r.text())
  ]);
  setSide("A", parseCsvText(a), "side_a_invoices.csv (synthetic demo)");
  setSide("B", parseCsvText(b), "side_b_bank_payments.csv (synthetic demo)");
  $("#asOf").value = "2026-11-16"; opts.asOf = "2026-11-16";
  $("#demo-note").hidden = false;
  run();
}

function renderMapping(side) {
  const s = sides[side];
  const box = $(`#map-${side}`);
  const fields = [["date", "Date"], ["amount", "Amount *"], ["ref", "Reference / description"], ["party", "Counterparty"]];
  box.innerHTML = fields.map(([k, label]) => `
    <div class="field"><label for="map-${side}-${k}">${label}</label>
    <select id="map-${side}-${k}" data-side="${side}" data-k="${k}">
      <option value="">— none —</option>
      ${s.headers.map(h => `<option value="${esc(h)}"${s.mapping[k] === h ? " selected" : ""}>${esc(h)}</option>`).join("")}
    </select></div>`).join("");
  $$("select", box).forEach(sel => sel.addEventListener("change", () => { sides[side].mapping[sel.dataset.k] = sel.value; checkReady(); }));
  $(`#map-${side}-wrap`).hidden = false;
}

function checkReady() {
  const ok = sides.A && sides.B && sides.A.mapping.amount && sides.B.mapping.amount;
  $("#run").disabled = !ok;
}

// ---- run ----
function run() {
  if (!sides.A || !sides.B) return;
  readOptionsFromForm();
  const ra = toRecords(sides.A.rows, sides.A.mapping, "A", { dayFirst: opts.dayFirst });
  const rb = toRecords(sides.B.rows, sides.B.mapping, "B", { dayFirst: opts.dayFirst });
  records = { A: ra.records, B: rb.records };
  const skipped = ra.skipped.length + rb.skipped.length;
  $("#skipped").textContent = skipped ? `${skipped} row(s) skipped because the amount could not be read.` : "";
  const asOf = opts.asOf ? Date.parse(opts.asOf) : Math.max(...records.A.concat(records.B).map(r => r.date || 0), Date.now());
  const options = { amountTolerance: Number(opts.tol), amountTolerancePct: Number(opts.tolPct), dateWindowDays: Number(opts.win), fuzzyThreshold: Number(opts.fuzzy), groupWindowDays: Number(opts.gwin) };

  $("#progress").hidden = false; $("#results").hidden = true;
  $("#run").disabled = true;
  const t0 = performance.now();
  // Strip raw rows before posting to keep the message small; re-attach by id after.
  const slim = r => ({ id: r.id, date: r.date, amount: r.amount, ref: r.ref, party: r.party });
  if (worker) worker.terminate();
  worker = new Worker("/assets/js/recon/match.worker.js", { type: "module" });
  worker.onmessage = e => {
    const m = e.data;
    if (m.type === "progress") { $("#progress-bar").style.width = m.pct + "%"; $("#progress-text").textContent = m.stage; return; }
    if (m.type === "error") { $("#progress-text").textContent = "Error: " + m.message; $("#run").disabled = false; return; }
    result = m.result;
    result.ms = Math.round(performance.now() - t0);
    $("#progress").hidden = true; $("#run").disabled = false;
    renderResults();
  };
  worker.postMessage({ A: records.A.map(slim), B: records.B.map(slim), options, asOf });
}

function readOptionsFromForm() {
  for (const k of ["tol", "tolPct", "win", "fuzzy", "gwin", "asOf"]) opts[k] = $("#" + k).value;
  opts.dayFirst = $("#dayFirst").checked;
  writeState(opts, defaults);
}
function writeOptionsToForm() {
  for (const k of ["tol", "tolPct", "win", "fuzzy", "gwin", "asOf"]) $("#" + k).value = opts[k];
  $("#dayFirst").checked = !!opts.dayFirst;
}

// ---- results ----
const byId = { A: new Map(), B: new Map() };
function rec(side, id) { return byId[side].get(id); }

function renderResults() {
  byId.A = new Map(records.A.map(r => [r.id, r])); byId.B = new Map(records.B.map(r => [r.id, r]));
  const s = result.stats;
  $("#results").hidden = false;
  $("#kpis").innerHTML = `
    <div class="kpi"><div class="kpi__label">Match rate (count, side A)</div><div class="kpi__value">${fmtPct(s.matchRateCountA, 1)}</div><div class="kpi__sub">${fmtNum(s.matchedA)} of ${fmtNum(s.countA)}</div></div>
    <div class="kpi"><div class="kpi__label">Match rate (value, side A)</div><div class="kpi__value">${fmtPct(s.matchRateValueA, 1)}</div><div class="kpi__sub">${fmtNum(s.matchedValueA, 2)} of ${fmtNum(s.valueA, 2)}</div></div>
    <div class="kpi"><div class="kpi__label">Unmatched value A</div><div class="kpi__value ${s.unmatchedValueA ? "down" : "flat"}">${fmtNum(s.unmatchedValueA, 2)}</div><div class="kpi__sub">${fmtNum(result.unmatchedA.length)} items</div></div>
    <div class="kpi"><div class="kpi__label">Unmatched value B</div><div class="kpi__value ${s.unmatchedValueB ? "down" : "flat"}">${fmtNum(s.unmatchedValueB, 2)}</div><div class="kpi__sub">${fmtNum(result.unmatchedB.length)} items</div></div>
    <div class="kpi"><div class="kpi__label">Time</div><div class="kpi__value">${fmtNum(result.ms)} ms</div><div class="kpi__sub">${Object.entries(s.byRule).filter(([k]) => k !== "5").map(([k, v]) => `R${k}:${v}`).join(" ")}</div></div>`;
  $("#summary-text").textContent = `Side A has ${s.countA} rows and side B ${s.countB}. ${result.matches.length} matches were found: ${Object.entries(s.byRule).filter(([k]) => k !== "5").map(([k, v]) => `${v} by rule ${k} (${RULES[k].toLowerCase()})`).join(", ")}. ${result.unmatchedA.length} side-A and ${result.unmatchedB.length} side-B items remain unmatched. ${result.duplicatesA.length + result.duplicatesB.length} possible duplicates were flagged.`;
  renderTable("matched"); renderTable("unA"); renderTable("unB"); renderTable("dups"); renderAgeing();
  showTab("matched");
}

function label(side, id) {
  const r = rec(side, id);
  return `${esc(r.rawRef || "(no ref)")} · ${fmtNum(r.amount, 2)}${r.date ? " · " + fmtDate(r.date) : ""}`;
}
function tables() {
  return {
    matched: result.matches.map(m => ({
      rule: m.rule, "rule name": m.label, confidence: m.confidence,
      "side A": m.a.map(id => rec("A", id).rawRef).join(" + "),
      "A amount": m.a.reduce((s, id) => s + rec("A", id).amount, 0).toFixed(2),
      "A date": m.a.map(id => rec("A", id).date ? fmtDate(rec("A", id).date) : "").join(" / "),
      "side B": m.b.map(id => rec("B", id).rawRef).join(" + "),
      "B amount": m.b.reduce((s, id) => s + rec("B", id).amount, 0).toFixed(2),
      "B date": m.b.map(id => rec("B", id).date ? fmtDate(rec("B", id).date) : "").join(" / "),
      "A rows": m.a.map(id => rec("A", id).row).join(" "), "B rows": m.b.map(id => rec("B", id).row).join(" "),
      note: m.note
    })),
    unA: result.unmatchedA.map(r => ({ row: r.row, ...rec("A", r.id).raw, "days outstanding": r.date ? Math.floor((asOfMs() - r.date) / 86400000) : "" })),
    unB: result.unmatchedB.map(r => ({ row: r.row, ...rec("B", r.id).raw })),
    dups: [...result.duplicatesA.map(d => ({ side: "A", row: rec("A", d.id).row, "duplicate of row": rec("A", d.duplicateOf).row, ...rec("A", d.id).raw })),
           ...result.duplicatesB.map(d => ({ side: "B", row: rec("B", d.id).row, "duplicate of row": rec("B", d.duplicateOf).row, ...rec("B", d.id).raw }))],
    ageing: result.ageing.map(b => ({ bucket: b.label, count: b.count, value: b.value.toFixed(2) }))
  };
}
function asOfMs() { return opts.asOf ? Date.parse(opts.asOf) : Date.now(); }

function renderTable(name) {
  const rows = tables()[name];
  const box = $(`#tab-${name}`);
  $(`[data-tab="${name}"] .count`).textContent = rows.length;
  if (!rows.length) { box.innerHTML = `<p class="muted small">Nothing here.</p>`; return; }
  const cols = Object.keys(rows[0]);
  const limit = 500;
  box.innerHTML = `<div class="table-wrap"><table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>
    ${rows.slice(0, limit).map(r => `<tr${r.rule ? ' class="is-matched"' : name === "dups" ? ' class="is-dup"' : ""}>${cols.map(c => `<td${/amount|confidence|row/i.test(c) ? ' class="num"' : ""}>${esc(r[c])}</td>`).join("")}</tr>`).join("")}
  </tbody></table></div>${rows.length > limit ? `<p class="small muted">Showing the first ${limit} of ${rows.length}. Export to see everything.</p>` : ""}`;
}

function renderAgeing() {
  const rows = tables().ageing;
  const total = rows.reduce((s, r) => s + Number(r.value), 0);
  $("#tab-ageing").innerHTML = `<div class="table-wrap"><table><thead><tr><th>Bucket</th><th class="num">Items</th><th class="num">Value</th><th class="num">Share</th><th>Bar</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${r.bucket}</td><td class="num">${r.count}</td><td class="num">${fmtNum(Number(r.value), 2)}</td><td class="num">${total ? fmtPct(Number(r.value) / total, 0) : "—"}</td><td><div class="gauge__bar" style="grid-auto-columns:auto;height:12px;width:${total ? Math.round(100 * Number(r.value) / total) : 0}%"><i class="on" style="background:${/90\+/.test(r.bucket) ? "var(--down)" : /61/.test(r.bucket) ? "var(--amber)" : "var(--accent)"}"></i></div></td></tr>`).join("")}
  </tbody></table></div><p class="small muted">Ageing of unmatched side-A items as of ${fmtDate(asOfMs())}. Change the “as of” date above to re-run.</p>`;
  $(`[data-tab="ageing"] .count`).textContent = result.unmatchedA.length;
}

function showTab(name) {
  $$(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === name ? "true" : "false"));
  $$("[data-panel]").forEach(p => { p.hidden = p.dataset.panel !== name; });
  $("#export-csv").dataset.table = name;
}

// ---- init ----
function init() {
  writeOptionsToForm();
  $("#file-A").addEventListener("change", e => e.target.files[0] && loadSide("A", e.target.files[0]));
  $("#file-B").addEventListener("change", e => e.target.files[0] && loadSide("B", e.target.files[0]));
  $("#demo").addEventListener("click", loadDemo);
  $("#run").addEventListener("click", run);
  $$(".tabs button").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
  $("#export-csv").addEventListener("click", e => {
    const t = e.target.dataset.table; const rows = tables()[t];
    if (rows.length) exportCsv(rows, `recon-${t}.csv`);
  });
  $("#export-xlsx").addEventListener("click", () => {
    const t = tables();
    exportXlsx({ Matched: t.matched, "Unmatched A": t.unA, "Unmatched B": t.unB, Duplicates: t.dups, Ageing: t.ageing }, "recon-results.xlsx");
  });
  $("#share").addEventListener("click", e => { readOptionsFromForm(); copyShareLink(e.target); });
  if (!("Worker" in window)) $("#run").textContent = "Your browser lacks Web Workers";
}
init();

// parse.js — read CSV/XLSX files into rows, guess the column mapping and
// turn mapped rows into engine records. Uses the Papa Parse and SheetJS
// globals loaded on the page. Everything stays in the browser.
import { normaliseRef } from "./match.js";

export function parseFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".xlsm")) return parseXlsx(file);
  return parseCsv(file);
}

function parseCsv(file) {
  return new Promise((resolve, reject) => {
    window.Papa.parse(file, {
      header: true, skipEmptyLines: "greedy", dynamicTyping: false,
      transformHeader: h => String(h).trim(),
      complete: res => resolve({ headers: res.meta.fields || [], rows: res.data }),
      error: reject
    });
  });
}

export function parseCsvText(text) {
  const res = window.Papa.parse(text, { header: true, skipEmptyLines: "greedy", transformHeader: h => String(h).trim() });
  return { headers: res.meta.fields || [], rows: res.data };
}

async function parseXlsx(file) {
  const buf = await file.arrayBuffer();
  const wb = window.XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(ws, { raw: false, dateNF: "yyyy-mm-dd", defval: "" });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return { headers, rows, sheet: wb.SheetNames[0] };
}

// Guess which column is which from header names.
export function guessMapping(headers) {
  const h = headers.map(x => x.toLowerCase());
  const find = (...pats) => {
    for (const p of pats) { const i = h.findIndex(x => p.test(x)); if (i >= 0) return headers[i]; }
    return "";
  };
  return {
    date: find(/^date$/, /value date/, /invoice date/, /posting/, /date/),
    amount: find(/^amount$/, /amount/, /^value$/, /total/, /debit|credit/),
    ref: find(/invoice no/, /reference/, /^ref/, /description/, /narration/, /memo|details|particulars/, /invoice/, /^id$/),
    party: find(/customer/, /payer|payee/, /counterparty/, /vendor|supplier/, /name/, /party/)
  };
}

export function parseAmount(v) {
  if (v == null) return NaN;
  if (typeof v === "number") return v;
  let s = String(v).trim();
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/^-/.test(s)) { neg = true; s = s.slice(1); }
  if (/(cr|dr)$/i.test(s)) { if (/cr$/i.test(s)) neg = !neg; s = s.slice(0, -2); }
  s = s.replace(/[^0-9.,]/g, "").replace(/^[.,]+/, "");
  // Decide the decimal separator. If both appear, the last one wins.
  // If only commas appear and every comma is followed by exactly 3 digits
  // ("12,000" or "1,234,567"), they are thousands separators.
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot === -1 && lastComma !== -1 && /^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, "");
  else if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? NaN : (neg ? -n : n);
}

// Returns ms since epoch (UTC midnight) or null. dayFirst decides ambiguous dd/mm vs mm/dd.
export function parseDate(v, dayFirst = true) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v) ? null : Date.UTC(v.getFullYear(), v.getMonth(), v.getDate());
  const s = String(v).trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/))) {
    let a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000;
    let d, mo;
    if (a > 12) { d = a; mo = b; } else if (b > 12) { d = b; mo = a; } else if (dayFirst) { d = a; mo = b; } else { d = b; mo = a; }
    return Date.UTC(y, mo - 1, d);
  }
  if ((m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3,})[ -,]+(\d{4})$/))) {
    const mo = monthIndex(m[2]); if (mo >= 0) return Date.UTC(+m[3], mo, +m[1]);
  }
  if ((m = s.match(/^([A-Za-z]{3,})[ -](\d{1,2}),?[ -](\d{4})$/))) {
    const mo = monthIndex(m[1]); if (mo >= 0) return Date.UTC(+m[3], mo, +m[2]);
  }
  if (/^\d{5}$/.test(s)) { // Excel serial
    return Date.UTC(1899, 11, 30) + Number(s) * 86400000;
  }
  const t = Date.parse(s);
  if (!isNaN(t)) { const d = new Date(t); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); }
  return null;
}
function monthIndex(name) {
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(name.slice(0, 3).toLowerCase());
}

// Build engine records. Rows whose amount cannot be read are returned in `skipped`.
export function toRecords(rows, mapping, side, { dayFirst = true } = {}) {
  const out = [], skipped = [];
  rows.forEach((row, i) => {
    const amount = parseAmount(row[mapping.amount]);
    if (isNaN(amount)) { skipped.push({ row: i + 1, reason: "amount not readable" }); return; }
    out.push({
      id: `${side}${i + 1}`,
      row: i + 1,
      date: mapping.date ? parseDate(row[mapping.date], dayFirst) : null,
      amount,
      ref: mapping.ref ? normaliseRef(row[mapping.ref]) : "",
      rawRef: mapping.ref ? String(row[mapping.ref] ?? "") : "",
      party: mapping.party ? String(row[mapping.party] ?? "").trim().toUpperCase() : "",
      raw: row
    });
  });
  return { records: out, skipped };
}

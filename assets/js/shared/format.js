// format.js — number and date formatting helpers (pure).

export function fmtMoney(v, currency = "USD", digits = 2) {
  if (v == null || !isFinite(v)) return "—";
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
  } catch {
    return `${currency} ${v.toFixed(digits)}`;
  }
}

export function fmtNum(v, digits = 0) {
  if (v == null || !isFinite(v)) return "—";
  return new Intl.NumberFormat("en", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
}

export function fmtPct(v, digits = 1) {
  if (v == null || !isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

// Compact money for financial statements: 1234567890 -> "1.23B"
export function fmtCompact(v, digits = 2) {
  if (v == null || !isFinite(v)) return "—";
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1e12) return `${sign}${(a / 1e12).toFixed(digits)}T`;
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(digits)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(digits)}M`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(digits)}K`;
  return `${sign}${a.toFixed(digits)}`;
}

// "16 Nov 2026"
export function fmtDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date)) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function upDown(v, text) {
  if (v > 0) return `<span class="up">${text}</span>`;
  if (v < 0) return `<span class="down">${text}</span>`;
  return `<span class="flat">${text}</span>`;
}

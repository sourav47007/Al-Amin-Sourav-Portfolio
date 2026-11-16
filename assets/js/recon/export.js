// export.js — download result tables as CSV (Papa Parse) or XLSX (SheetJS).
// Nothing leaves the browser; downloads are built from in-memory data.

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

export function exportCsv(rows, filename) {
  const csv = window.Papa.unparse(rows);
  download(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), filename);
}

// sheets: { "Sheet name": rows[] }
export function exportXlsx(sheets, filename) {
  const wb = window.XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = window.XLSX.utils.json_to_sheet(rows.length ? rows : [{ note: "empty" }]);
    window.XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  const out = window.XLSX.write(wb, { bookType: "xlsx", type: "array" });
  download(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}

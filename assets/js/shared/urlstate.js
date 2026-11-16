// urlstate.js — save and restore a tool's state in the URL hash, so a
// scenario can be shared by copying the link. State is a flat object of
// strings/numbers/booleans. Nothing is sent anywhere.

export function readState(defaults = {}) {
  const out = { ...defaults };
  const hash = location.hash.replace(/^#/, "");
  if (!hash) return out;
  const params = new URLSearchParams(hash);
  for (const [k, v] of params) {
    if (!(k in defaults)) { out[k] = v; continue; }
    const d = defaults[k];
    if (typeof d === "number") out[k] = Number(v);
    else if (typeof d === "boolean") out[k] = v === "1" || v === "true";
    else out[k] = v;
  }
  return out;
}

export function writeState(state, defaults = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) {
    if (v == null || v === "" || v === defaults[k]) continue;
    params.set(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
  }
  const s = params.toString();
  history.replaceState(null, "", s ? `#${s}` : location.pathname);
}

export async function copyShareLink(button) {
  try {
    await navigator.clipboard.writeText(location.href);
    const old = button.textContent;
    button.textContent = "Link copied";
    setTimeout(() => { button.textContent = old; }, 1500);
  } catch {
    prompt("Copy this link:", location.href);
  }
}

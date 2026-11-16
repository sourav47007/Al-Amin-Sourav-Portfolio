// site.js — header, nav, footer, theme toggle, ticker, and content injection.
// Loaded on every page as an ES module.
import { site } from "/content/site.js";
import { icons } from "/assets/js/shared/icons.js";

const THEME_KEY = "theme";

function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key, v) { try { localStorage.setItem(key, v); } catch { /* storage unavailable */ } }

function currentTheme() {
  const saved = safeGet(THEME_KEY);
  if (saved === "dark" || saved === "light") return saved;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.innerHTML = t === "dark" ? icons.sun : icons.moon;
    btn.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function navLink(href, label, path) {
  const active = path === href || (href !== "/" && path.startsWith(href));
  return `<a href="${href}"${active ? ' aria-current="page"' : ""}>${label}</a>`;
}

function renderHeader() {
  const path = location.pathname.replace(/\/$/, "") || "/";
  const tickerItems = site.ticker.map(t => `<span>${escapeHtml(t)}</span>`).join("");
  const header = `
    <div class="ticker" aria-hidden="true"><div class="ticker__track">${tickerItems}${tickerItems}</div></div>
    <header class="header">
      <div class="header__in">
        <a class="logo" href="/">${escapeHtml(site.shortName.toUpperCase())}</a>
        <nav class="nav" aria-label="Main">
          ${navLink("/#projects", "projects", path)}
          ${navLink("/about", "about", path)}
          ${navLink("/notes", "notes", path)}
          <a href="${site.cvFile}" download>cv</a>
          <button id="theme-toggle" class="btn btn--small" type="button" aria-label="Toggle theme"></button>
        </nav>
      </div>
    </header>`;
  document.body.insertAdjacentHTML("afterbegin", header);
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    safeSet(THEME_KEY, next);
    applyTheme(next);
    document.dispatchEvent(new CustomEvent("themechange", { detail: next }));
  });
}

function renderFooter() {
  const year = new Date().getFullYear();
  const footer = `
    <footer class="footer">
      <div class="footer__in">
        <div>
          <a href="mailto:${escapeHtml(site.email)}">email</a> ·
          <a href="${escapeHtml(site.linkedin)}" rel="me noopener">LinkedIn</a> ·
          <a href="${escapeHtml(site.github)}" rel="me noopener">GitHub</a>
        </div>
        <div><span style="font-family:var(--font-body)">©</span> ${year} ${escapeHtml(site.name)}</div>
      </div>
    </footer>`;
  document.body.insertAdjacentHTML("beforeend", footer);
}

// Fill any element with data-site="key" from the content file.
function injectContent() {
  document.querySelectorAll("[data-site]").forEach(el => {
    const key = el.dataset.site;
    const val = key.split(".").reduce((o, k) => (o == null ? o : o[k]), site);
    if (val == null) return;
    if (Array.isArray(val)) {
      el.innerHTML = val.map(p => `<p>${escapeHtml(p)}</p>`).join("");
    } else if (el.dataset.attr) {
      el.setAttribute(el.dataset.attr, val);
    } else {
      el.textContent = val;
    }
  });
  // Project-specific blocks: data-project="slug" with data-field="why"
  document.querySelectorAll("[data-project]").forEach(el => {
    const p = site.projects.find(x => x.slug === el.dataset.project);
    if (!p) return;
    const v = p[el.dataset.field];
    if (v != null) el.textContent = v;
  });
  document.querySelectorAll("[data-icon]").forEach(el => {
    el.innerHTML = icons[el.dataset.icon] || "";
  });
  document.querySelectorAll("[data-repo-link]").forEach(el => {
    el.href = site.repo + (el.dataset.repoLink ? "/tree/main/" + el.dataset.repoLink : "");
  });
}

applyTheme(currentTheme());
renderHeader();
applyTheme(currentTheme());
injectContent();
renderFooter();

export { site, escapeHtml, currentTheme };

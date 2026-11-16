// katex-lazy.js — load KaTeX only when a formula block scrolls into view.
// Formulas are written in the HTML as $$...$$ (display) or \(...\) (inline).

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}
function loadCss(href) {
  const l = document.createElement("link");
  l.rel = "stylesheet"; l.href = href;
  document.head.appendChild(l);
}

let loading;
async function ensureKatex() {
  if (window.renderMathInElement) return;
  if (!loading) {
    loadCss("/assets/vendor/katex/katex.min.css");
    loading = loadScript("/assets/vendor/katex/katex.min.js")
      .then(() => loadScript("/assets/vendor/katex/contrib/auto-render.min.js"));
  }
  await loading;
}

export function renderMath(root) {
  return ensureKatex().then(() => {
    window.renderMathInElement(root, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\(", right: "\\)", display: false }
      ],
      throwOnError: false
    });
  });
}

export function lazyMath(selector = ".math") {
  const nodes = [...document.querySelectorAll(selector)];
  if (!nodes.length) return;
  if (!("IntersectionObserver" in window)) { nodes.forEach(renderMath); return; }
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { renderMath(e.target); io.unobserve(e.target); }
    });
  }, { rootMargin: "200px" });
  nodes.forEach(n => io.observe(n));
}

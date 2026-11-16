// chart-theme.js — Chart.js defaults that match the site: pixel mono
// labels, square markers, 1px gridlines, no gradients. Re-applied on
// theme change.

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function themeColors() {
  return {
    ink: cssVar("--ink"), grid: cssVar("--grid"), muted: cssVar("--muted"),
    up: cssVar("--up"), down: cssVar("--down"), amber: cssVar("--amber"),
    accent: cssVar("--accent"), surface: cssVar("--surface"), paper: cssVar("--paper")
  };
}

export function applyChartTheme(Chart) {
  const c = themeColors();
  Chart.defaults.font.family = '"Departure Mono", monospace';
  Chart.defaults.font.size = 12;
  Chart.defaults.color = c.muted;
  Chart.defaults.borderColor = c.grid;
  Chart.defaults.elements.point.pointStyle = "rect";
  Chart.defaults.elements.point.radius = 3;
  Chart.defaults.elements.line.borderWidth = 2;
  Chart.defaults.elements.line.tension = 0;
  Chart.defaults.elements.bar.borderWidth = 0;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
  Chart.defaults.plugins.tooltip.cornerRadius = 0;
  Chart.defaults.plugins.tooltip.backgroundColor = c.ink;
  Chart.defaults.plugins.tooltip.titleColor = c.surface;
  Chart.defaults.plugins.tooltip.bodyColor = c.surface;
  Chart.defaults.animation = false;
  Chart.defaults.scales = Chart.defaults.scales || {};
  return c;
}

// Load Chart.js once, on demand.
let chartPromise;
export function loadChart() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (!chartPromise) {
    chartPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/assets/vendor/chartjs/chart.umd.min.js";
      s.onload = () => resolve(window.Chart);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return chartPromise;
}

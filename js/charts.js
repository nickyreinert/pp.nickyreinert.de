// Tiny dependency-free bar charts (CSS widths/heights). Deterministic, static-friendly.

function fmtVal(v) {
  if (v >= 10000) return `${Math.round(v / 1000)}k`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toLocaleString("de");
}

export function barChart(title, rows) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const bars = rows
    .map((r) => {
      const pct = Math.round((r.value / max) * 100);
      return `<div class="bar"><span class="label" title="${r.label}">${r.label}</span>`
        + `<span class="track"><span class="fill" style="width:${pct}%"></span></span>`
        + `<span class="val">${r.value.toLocaleString("de")}</span></div>`;
    })
    .join("");
  return `<div class="chart"><h3>${title}</h3>${bars}</div>`;
}

// PLOT_H must match CSS .vchart .vbars height minus label space (~100px for vval+vlabel).
const PLOT_H = 160;

export function vertBarChart(title, rows) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const bars = rows.map((r) => {
    const h = Math.max(2, Math.round((r.value / max) * PLOT_H));
    return `<div class="vbar">`
      + `<div class="vbar-plot">`
      + `<span class="vval">${fmtVal(r.value)}</span>`
      + `<span class="vfill" style="height:${h}px"></span>`
      + `</div>`
      + `<span class="vlabel" title="${r.label}">${r.label}</span>`
      + `</div>`;
  }).join("");
  return `<div class="chart vchart"><h3>${title}</h3><div class="vscroll"><div class="vbars">${bars}</div></div></div>`;
}

// Bucket numeric values into a vertical histogram bar chart.
export function histogram(title, values, bucket, unit) {
  if (!values.length) return `<div class="chart"><h3>${title}</h3><p class="muted">keine Daten</p></div>`;
  const max = Math.max(...values);
  const n = Math.max(1, Math.ceil((max + 1) / bucket));
  const counts = new Array(n).fill(0);
  values.forEach((v) => counts[Math.min(n - 1, Math.floor(v / bucket))]++);
  const rows = counts.map((c, i) => ({ label: `${i * bucket}${unit ? unit : ""}`, value: c }));
  return vertBarChart(title, rows);
}

// SVG scatter plot: all sessions as dots, coloured by WP, outliers highlighted.
export function sessionScatter(title, sessions) {
  if (!sessions || !sessions.length)
    return `<div class="chart"><h3>${title}</h3><p class="muted">keine Daten</p></div>`;
  const W = 900, H = 220, PT = 16, PR = 10, PB = 40, PL = 48;
  const plotW = W - PL - PR, plotH = H - PT - PB;
  const maxY = Math.max(1, ...sessions.map((s) => s.speeches));
  const wps = [...new Set(sessions.map((s) => s.period))].sort((a, b) => +a - +b);
  const wpColor = {};
  wps.forEach((w, i) => { wpColor[w] = `hsl(${Math.round((i / wps.length) * 300)},55%,46%)`; });
  const N = sessions.length;
  const xOf = (i) => (PL + (N > 1 ? (i / (N - 1)) : 0.5) * plotW).toFixed(1);
  const yOf = (v) => (PT + (1 - v / maxY) * plotH).toFixed(1);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = Math.round(maxY * f), y = yOf(v);
    return `<line x1="${PL}" x2="${PL + plotW}" y1="${y}" y2="${y}" stroke="${f === 0 ? "#bbb" : "#eee"}"/>`
      + `<text x="${PL - 4}" y="${y}" text-anchor="end" font-size="10" dy="3" fill="#888">${fmtVal(v)}</text>`;
  }).join("");
  let lastWp = null;
  const wpLines = sessions.map((s, i) => {
    if (s.period === lastWp) return "";
    lastWp = s.period;
    const x = xOf(i);
    return `<line x1="${x}" x2="${x}" y1="${PT}" y2="${PT + plotH + 4}" stroke="#ccc" stroke-dasharray="2,2"/>`
      + `<text x="${x}" y="${H - 4}" font-size="8" fill="#aaa" text-anchor="middle">WP${s.period}</text>`;
  }).join("");
  const dots = sessions.map((s, i) => {
    const fill = s.speeches === 0 ? "#c0392b"
      : (s.unassigned || 0) > 50 ? "#d35400"
      : wpColor[s.period];
    const tip = `WP${s.period} S${s.session}${s.date ? " " + s.date : ""}: ${s.speeches} Redebeiträge, ${s.unassigned || 0} unzugeordnet`;
    return `<circle cx="${xOf(i)}" cy="${yOf(s.speeches)}" r="2.2" fill="${fill}" fill-opacity=".75"><title>${tip}</title></circle>`;
  }).join("");
  return `<div class="chart"><h3>${title}</h3>`
    + `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">`
    + yTicks + wpLines + dots + `</svg>`
    + `<p style="font-size:11px;color:#888;margin:4px 0 0">`
    + `<span style="color:#c0392b">&#9679;</span> 0 Redebeiträge&ensp;`
    + `<span style="color:#d35400">&#9679;</span> Unzugeordnet&nbsp;&gt;50&ensp;`
    + `<span style="color:#6c8cb0">&#9679;</span> Normal (WP&nbsp;1 links &rarr; WP&nbsp;19 rechts)</p></div>`;
}

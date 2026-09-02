import { vertBarChart, histogram, sessionScatter } from "./charts.js";
import { refUrl, xmlFileLink } from "./data.js";

function median(sorted) {
  if (!sorted.length) return 0;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : Math.round((sorted[m - 1] + sorted[m]) / 2);
}

function speakersPerWp(speakers) {
  const by = {};
  (speakers || []).forEach((s) => (s.periods || []).forEach((p) => { by[p] = (by[p] || 0) + 1; }));
  return by;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function pair(a, b) {
  return `<div class="vchart-row">${a}${b}</div>`;
}

function allPartiesTable(by_party) {
  const total = by_party.reduce((s, p) => s + p.speeches, 0);
  const rows = by_party.map((p) => {
    const pct = ((p.speeches / total) * 100).toFixed(1);
    return `<tr><td class="td-left">${esc(p.party)}</td>`
      + `<td>${p.speeches.toLocaleString("de")}</td><td>${pct}%</td></tr>`;
  }).join("");
  return `<div class="chart">
    <h3>Redebeiträge pro Partei (alle ${by_party.length})</h3>
    <div style="max-height:320px;overflow-y:auto">
      <table class="session-table">
        <thead><tr><th class="td-left">Partei</th><th>Redebeiträge</th><th>Anteil</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

// Canonical input file stem from period+session: "05079" for period=5, session=79.
function sessionStem(period, session) {
  return String(period).padStart(2, "0") + String(session).padStart(3, "0");
}

function sessionFile(period, session) {
  const stem = sessionStem(period, session);
  const p = stem.slice(0, 2);
  return `input/pp${p}/${stem}.xml`;
}

// Human-readable labels for pipeline anomaly categories.
const ANOMALY_LABELS = {
  very_short:                "Strukturell: sehr kurze Sitzung",
  appendix_heavy:            "Strukturell: Anhang / schriftliche Anlagen",
  multi_session_split:       "Strukturell: Mehrsitzungs-Split",
  multi_day_split:           "Strukturell: Mehrtagessitzung-Split",
  session_in_multiple_inputs:"Strukturell: Sitzung in mehreren Dateien",
  high_unassigned:           "Statistisch: hoher Unzugeordnet-Anteil",
  low_coverage:              "Statistisch: niedrige Zeilenabdeckung",
  low_resolution:            "Statistisch: niedrige Sprecher:innen-Auflösung",
  duration_discrepancy:      "Statistisch: Zeitangabe-Diskrepanz",
};

// Build a stem→[category,...] lookup from the anomalies dataset.
function buildAnomalyLookup(anomalies) {
  const lookup = {};
  for (const [cat, items] of Object.entries(anomalies || {})) {
    if (!Array.isArray(items)) continue;
    for (const d of items) {
      // d.file is like "05079.json" or "01020_session20.json"
      const stem = d.file.replace(/\.json$/, "").split("_")[0];
      (lookup[stem] = lookup[stem] || []).push(cat);
    }
  }
  return lookup;
}

// Pipeline anomaly overview — the full classified list with deeplinks.
function anomalyOverview(anomalies) {
  const ORDER = [
    "high_unassigned", "very_short", "appendix_heavy",
    "multi_session_split", "multi_day_split", "session_in_multiple_inputs",
    "low_coverage", "low_resolution", "duration_discrepancy",
  ];
  const cats = ORDER.filter((c) => anomalies[c]);
  if (!cats.length) return "";

  const sections = cats.map((cat) => {
    const items = anomalies[cat];
    const label = ANOMALY_LABELS[cat] || cat;
    const rows = items.map((d) => {
      const stem = d.file.replace(/\.json$/, "").split("_")[0];
      const period = parseInt(stem.slice(0, 2), 10);
      const session = parseInt(stem.slice(2), 10);
      const file = sessionFile(period, session);
      const pdfHref = refUrl(file);
      const xmlRef = xmlFileLink(file);
      const links = [
        pdfHref ? `<a href="${pdfHref}" target="_blank" style="color:#2a6">PDF</a>` : "",
        xmlRef ? `<a href="${xmlRef.href}" target="_blank" style="color:#2a6">XML</a>` : "",
      ].filter(Boolean).join(" ");
      return `<tr>`
        + `<td>${stem.slice(0, 2)}</td><td>${session || "—"}</td>`
        + `<td>${d.speeches != null ? d.speeches : "—"}</td>`
        + `<td>${d.unassigned != null ? d.unassigned : "—"}</td>`
        + `<td>${links}</td></tr>`;
    }).join("");
    return `<details style="margin-bottom:8px">`
      + `<summary style="cursor:pointer;font-weight:600;font-size:13px">`
      + `${label} (${items.length})</summary>`
      + `<div style="max-height:200px;overflow-y:auto;margin-top:6px">`
      + `<table class="session-table"><thead>`
      + `<tr><th>WP</th><th>Sitzung</th><th>Redebeiträge</th><th>Unzugeordnet</th><th>Quellen</th></tr>`
      + `</thead><tbody>${rows}</tbody></table></div></details>`;
  }).join("");

  return `<div class="chart"><h3>Pipeline-Anomalien (klassifiziert)</h3>
    <p class="muted" style="margin-bottom:10px">Dateien, die der Qualitaets-Check als Grenzfall eingestuft hat. Aufklappen fuer Details und Quellen.</p>
    ${sections}</div>`;
}

// Per-WP unassigned threshold mirrors the pipeline logic: max(3 × median, 30).
// Avoids the WP14 false-positive flood from the old flat-50 cutoff.
function wpUnassignedThresholds(sessions) {
  const byWp = {};
  sessions.forEach((s) => { (byWp[s.period] = byWp[s.period] || []).push(s.unassigned || 0); });
  const thresholds = {};
  for (const [wp, vals] of Object.entries(byWp)) {
    const sorted = vals.slice().sort((a, b) => a - b);
    const m = Math.floor(sorted.length / 2);
    const med = sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
    thresholds[wp] = Math.max(med * 3, 30);
  }
  return thresholds;
}

function edgeCasesSection(sessions, anomalies) {
  const lookup = buildAnomalyLookup(anomalies);
  const llmReasons = (anomalies || {})._llm_reasons || {};
  const wpThresholds = wpUnassignedThresholds(sessions);
  const highUn = sessions.filter((s) => (s.unassigned || 0) > (wpThresholds[s.period] || 50));
  const veryShort = sessions.filter((s) => s.speeches > 0 && s.speeches < 10);

  const VERDICT_LABEL = {
    genuine_short: "Kurzsitzung (erwartet)",
    parser_miss:   "Parser-Fehler (pruefen)",
    appendix_only: "Anhang / schriftlich",
    unknown:       "LLM: unbekannt",
  };

  const reasonBadge = (period, session) => {
    const stem = sessionStem(period, session);
    const cats = lookup[stem] || [];
    const llm = llmReasons[stem];
    if (!cats.length && !llm)
      return `<span style="color:#c0392b;font-size:11px">unklassifiziert</span>`;
    const parts = cats.map((c) => {
      const lbl = (ANOMALY_LABELS[c] || c).replace(/^(Strukturell|Statistisch): /, "");
      const col = c.startsWith("high") || c.startsWith("low") ? "#d35400" : "#1a6b3a";
      return `<span style="font-size:11px;color:${col}">${lbl}</span>`;
    });
    if (llm) {
      const lbl = VERDICT_LABEL[llm.verdict] || llm.verdict;
      const col = llm.verdict === "parser_miss" ? "#c0392b" : "#1a6b3a";
      parts.push(`<span style="font-size:11px;color:${col}">${lbl}</span>`);
    }
    return parts.join("<br>");
  };

  const tbl = (label, rows, cls) => {
    if (!rows.length) return "";
    const trs = rows.map((r) => {
      const file = sessionFile(r.period, r.session);
      const pdfHref = refUrl(file);
      const xmlRef = xmlFileLink(file);
      const links = [
        pdfHref ? `<a href="${pdfHref}" target="_blank" style="color:#2a6">PDF</a>` : "",
        xmlRef ? `<a href="${xmlRef.href}" target="_blank" style="color:#2a6">XML</a>` : "",
      ].filter(Boolean).join(" ");
      return `<tr${cls ? ` class="${cls}"` : ""}>`
        + `<td>WP${r.period}</td><td>${r.session}</td>`
        + `<td class="td-left">${r.date || "—"}</td>`
        + `<td>${r.speeches}</td><td>${r.unassigned || 0}</td>`
        + `<td>${r.minutes != null ? r.minutes : "—"}</td>`
        + `<td class="td-left">${reasonBadge(r.period, r.session)}</td>`
        + `<td>${links}</td></tr>`;
    }).join("");
    return `<h4 style="margin:12px 0 4px;font-size:13px">${label} (${rows.length})</h4>`
      + `<div style="max-height:240px;overflow-y:auto"><table class="session-table">`
      + `<thead><tr><th>WP</th><th>Sitzung</th><th class="td-left">Datum</th>`
      + `<th>Redebeiträge</th><th>Unzugeordnet</th><th>min</th>`
      + `<th class="td-left">Grund (Pipeline)</th><th>Quellen</th></tr></thead>`
      + `<tbody>${trs}</tbody></table></div>`;
  };

  return `<div class="chart"><h3>Ausreißer und Grenzfälle (Schwellenwert-Erkennung)</h3>`
    + `<p class="muted" style="margin-bottom:10px">Gruen = Pipeline kennt den Grund (wahrscheinlich OK). Rot = unklassifiziert (LLM-Pruefung empfohlen).</p>`
    + tbl("Unzugeordnet > 50", highUn, "s-warn")
    + tbl("Sehr kurze Sitzungen (unter 10 Redebeiträgen)", veryShort, "")
    + `</div>`;
}

function sessionTable(sessions, wp) {
  const rows = wp === "all" ? sessions : sessions.filter((s) => s.period === wp);
  if (!rows.length) return '<p class="muted">keine Daten</p>';
  const tableRows = rows.map((r) => {
    const ua = r.unassigned || 0;
    const sp = r.speeches || 0;
    const cls = ua > 50 ? ' class="s-warn"' : sp < 10 ? ' class="s-warn"' : "";
    return `<tr${cls}>`
      + `<td>${r.period}</td><td>${r.session}</td><td class="td-left">${r.date || "—"}</td>`
      + `<td>${sp.toLocaleString("de")}</td>`
      + `<td>${(r.interjections || 0).toLocaleString("de")}</td>`
      + `<td>${ua.toLocaleString("de")}</td>`
      + `<td>${r.minutes != null ? r.minutes : "—"}</td>`
      + "</tr>";
  }).join("");
  return `<table class="session-table">
    <thead><tr><th>WP</th><th>Sitzung</th><th class="td-left">Datum</th>
      <th>Redebeiträge</th><th>Zwischenrufe</th><th>Unzugeordnet</th><th>min</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>`;
}

export function renderStats(stats, speakers, anomalies = {}) {
  const el = document.getElementById("charts");
  const bp = (stats.by_period || []).slice().sort((a, b) => +a.period - +b.period);
  const spk = speakersPerWp(speakers);
  const dur = stats.session_minutes || [];
  const sessions = stats.by_session || [];
  const wp = (f) => bp.map((p) => ({ label: "WP " + p.period, value: f(p) }));

  // Avg session duration per WP from by_session.
  const minSum = {}, minCnt = {};
  sessions.forEach((s) => {
    if (s.minutes != null) {
      minSum[s.period] = (minSum[s.period] || 0) + s.minutes;
      minCnt[s.period] = (minCnt[s.period] || 0) + 1;
    }
  });
  const avgMinWp = bp.map((p) => ({
    label: "WP " + p.period,
    value: minCnt[p.period] ? Math.round(minSum[p.period] / minCnt[p.period]) : 0,
  }));

  const topSpeakers = (speakers || []).slice().sort((a, b) => b.count - a.count).slice(0, 20)
    .map((s) => ({ label: s.raw, value: s.count }));

  el.innerHTML = [
    `<p class="muted">${bp.reduce((a, p) => a + p.speeches, 0).toLocaleString("de")} Redebeiträge | `
      + `${bp.reduce((a, p) => a + p.files, 0).toLocaleString("de")} Sitzungen | `
      + `${bp.reduce((a, p) => a + p.interjections, 0).toLocaleString("de")} Zwischenrufe</p>`,

    pair(
      vertBarChart("Redebeiträge pro Wahlperiode", wp((p) => p.speeches)),
      vertBarChart("Sprecher:innen pro Wahlperiode", bp.map((p) => ({ label: "WP " + p.period, value: spk[p.period] || 0 }))),
    ),
    pair(
      vertBarChart("Sitzungen pro Wahlperiode", wp((p) => p.files)),
      vertBarChart("Zwischenrufe pro Wahlperiode", wp((p) => p.interjections)),
    ),
    pair(
      vertBarChart("Zwischenrufe je 100 Redebeiträge (WP)", wp((p) => Math.round(100 * p.interjections / (p.speeches || 1)))),
      vertBarChart("Ø Sitzungsdauer min (WP)", avgMinWp),
    ),
    pair(
      vertBarChart("Top 20 Sprecher:innen (nach Redebeiträgen)", topSpeakers),
      histogram("Sitzungsdauer-Verteilung (min)", dur, 60, ""),
    ),

    vertBarChart("Redebeiträge pro Jahr", stats.by_year.map((y) => ({ label: y.year, value: y.speeches }))),

    allPartiesTable(stats.by_party),

    sessionScatter("Redebeiträge je Sitzung – alle 4373 Sitzungen", sessions),

    anomalyOverview(anomalies),

    edgeCasesSection(sessions, anomalies),

    `<div class="chart" style="font-size:12px;color:#555">`
      + `Sitzungen mit Zeitangabe: ${dur.length.toLocaleString("de")} | `
      + `Median: ${median(dur)} min | Max: ${dur[dur.length - 1] || 0} min</div>`,
  ].join("");

  if (!sessions.length) return;

  const wps = [...new Set(sessions.map((s) => s.period))].sort((a, b) => +a - +b);
  const wpOpts = wps.map((w) => `<option value="${w}">WP ${w}</option>`).join("")
    + `<option value="all">alle (${sessions.length})</option>`;

  el.innerHTML += `<div class="chart" id="session-table-wrap">
    <h3>Redebeiträge pro Sitzung (Tabelle)</h3>
    <div class="controls" style="margin-bottom:8px">
      <select id="session-wp-filter" style="padding:5px 8px;border:1px solid #bbb;border-radius:4px">${wpOpts}</select>
      <span class="muted">gelb = Unzugeordnet &gt; 50 oder unter 10 Redebeiträge</span>
    </div>
    <div style="max-height:400px;overflow-y:auto" id="session-table-body">${sessionTable(sessions, wps[0])}</div>
  </div>`;

  document.getElementById("session-wp-filter").addEventListener("change", (e) => {
    document.getElementById("session-table-body").innerHTML = sessionTable(sessions, e.target.value);
  });
}

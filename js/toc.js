// Tagesordnung tab: official agenda (TOPs + main speakers), grouped by
// Wahlperiode into collapsible groups. Source = official Bundestag DIP agenda
// (Phase 5.2); it only exists for WP7-19 (WP1-6 has no DIP agenda).

import { isSelected, toggle } from "./selection.js";
import { setRoute } from "./router.js";
import { loadToc } from "./data.js";

let ALL = [];
let _loaded = false;
let _loading = false;
let _onLoaded = null;
const MAX_ROWS = 400;

export function initToc(sessions, onLoaded) {
  ALL = sessions || [];
  _loaded = ALL.length > 0;
  _onLoaded = onLoaded || null;
  const search = document.getElementById("toc-search");
  if (search) search.addEventListener("input", () => { render(); setRoute("toc", { q: tocQuery() }, true); });
  document.getElementById("toc-list").addEventListener("change", (e) => {
    if (e.target.matches(".sel input"))
      toggle(e.target.dataset.key, "toc_session",
             { key: e.target.dataset.key, period: e.target.dataset.period, session: e.target.dataset.session });
  });
  render();
}

export function rerenderToc() { render(); }

const tocQuery = () => (document.getElementById("toc-search").value || "").trim();

// Restore the agenda search from #toc?q. Lazy-loads the per-Wahlperiode shards
// (fetched in parallel) on first visit.
export async function routeToc(route) {
  if (!_loaded && !_loading) {
    _loading = true;
    document.getElementById("toc-list").innerHTML = '<p class="muted">Lade Tagesordnung...</p>';
    document.getElementById("toc-count").textContent = "";
    ALL = await loadToc();
    _loaded = true;
    _loading = false;
    if (_onLoaded) _onLoaded(ALL);
  }
  const q = route.params.get("q") || "";
  const search = document.getElementById("toc-search");
  if (search && search.value !== q) search.value = q;
  render();
}

function filtered() {
  const q = (document.getElementById("toc-search").value || "").trim().toLowerCase();
  if (!q) return ALL;
  const wp = q.match(/^wp\s*(\d+)$/);   // "wp 3" / "WP3" -> period 3
  return ALL.filter((s) => {
    if (wp) return String(s.period) === wp[1];
    if (String(s.period) === q) return true;
    if (s.dokumentnummer && s.dokumentnummer.toLowerCase().includes(q)) return true;
    return s.tops.some((t) =>
      (t.title || "").toLowerCase().includes(q) ||
      t.speakers.some((sp) => (sp.name || "").toLowerCase().includes(q)));
  });
}

function render() {
  const rows = filtered();
  const byWp = {};
  rows.forEach((s) => (byWp[s.period] = byWp[s.period] || []).push(s));
  const wps = Object.keys(byWp).sort((a, b) => +a - +b);
  const list = document.getElementById("toc-list");
  list.innerHTML = wps.map((wp) => wpGroupHtml(wp, byWp[wp])).join("")
    || `<p class="muted">Keine Tagesordnung fuer diese Suche. `
       + `Hinweis: die offizielle DIP-Agenda liegt nur fuer WP7-19 vor (WP1-6 fehlt).</p>`;
  document.getElementById("toc-count").textContent =
    `${rows.length.toLocaleString("de")} Sitzungen in ${wps.length} Wahlperioden`;
}

function wpGroupHtml(wp, sessions) {
  const open = sessions.length <= 5 ? "open" : "";
  const inner = sessions.slice(0, MAX_ROWS).map(sessionHtml).join("");
  return `<details class="wp-group" ${open}><summary>`
    + `<strong>Wahlperiode ${wp}</strong> <span class="muted">${sessions.length} Sitzungen</span>`
    + `</summary>${inner}</details>`;
}

function sessionHtml(s) {
  const tops = s.tops.map(topHtml).join("");
  const key = `toc:${s.period}/${s.session}`;
  const src = s.source === "parsed" ? ' <span class="muted">(aus Protokoll)</span>' : "";
  return `<div class="toc-wrap"><label class="sel"><input type="checkbox" ${isSelected(key) ? "checked" : ""}`
    + ` data-key="${esc(key)}" data-period="${esc(s.period)}" data-session="${esc(s.session)}"></label>`
    + `<details class="toc-session"><summary>`
    + `<strong>Sitzung ${esc(s.session)}</strong>`
    + ` <span class="muted">${s.top_count} Tagesordnungspunkte</span>${src}</summary>`
    + `<div class="toc-tops">${tops}</div></details></div>`;
}

function topHtml(t) {
  const title = pdfLink(t.pdf_url, esc(t.title || t.type || "Tagesordnungspunkt"));
  const speakers = t.speakers.map(speakerHtml).join("");
  const more = t.speaker_count > t.speakers.length
    ? `<div class="muted">+${t.speaker_count - t.speakers.length} weitere</div>` : "";
  return `<div class="toc-top"><div class="toc-title">${title}</div>`
    + `<div class="toc-speakers">${speakers}${more}</div></div>`;
}

function speakerHtml(sp) {
  const label = [sp.name, sp.party].filter(Boolean).map(esc).join(" - ");
  const page = sp.page ? ` <span class="muted">S. ${esc(sp.page)}</span>` : "";
  return `<div class="toc-speaker">${pdfLink(sp.pdf_url, label)}${page}</div>`;
}

function pdfLink(url, label) {
  return url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${label}</a>` : label;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Offene-Sprecher view: unresolved speakers (classes A/A2/B/C/X) for transparency.
// Renders category cards + a bar chart (groups + speeches per class), a paginated
// group list filtered by category, per-group source deeplinks (PDF/XML), and a
// "copy LLM batch JSON" button producing the disambig_batchN_research.json shape.

import { refUrl, xmlLink } from "./data.js";
import { copyFixPacket } from "./fixpacket.js";

let GROUPS = [];
let BY_CLASS = {};
const PAGE_SIZE = 50;
let PAGE = 0;
const CLASS_ORDER = ["C", "B", "A", "A2", "X"];

// --- INIT ---

export function initUnresolved(payload) {
  GROUPS = (payload && payload.groups) || [];
  BY_CLASS = (payload && payload.by_class) || {};
  renderCategories();
  renderChart();
  fillCategoryOptions();
  document.getElementById("ur-category").addEventListener("change", () => { PAGE = 0; render(); });
  document.getElementById("ur-search").addEventListener("input", () => { PAGE = 0; render(); });
  document.getElementById("ur-list").addEventListener("click", onListClick);
  render();
}

export function rerenderUnresolved() { render(); }

const urCat = () => document.getElementById("ur-category").value;
const urQuery = () => document.getElementById("ur-search").value.trim().toLowerCase();

// --- CATEGORY CARDS + CHART ---

function renderCategories() {
  const host = document.getElementById("ur-categories");
  host.innerHTML = CLASS_ORDER.map((c) => {
    const d = BY_CLASS[c] || { groups: 0, speeches: 0, description: "" };
    return `<div class="ur-card cat-${esc(c)}">`
      + `<div class="ur-card-h"><span class="badge cat-${esc(c)}">${esc(c)}</span>`
      + `<span class="ur-card-n">${fmt(d.groups)} Gruppen | ${fmt(d.speeches)} Redebeiträge</span></div>`
      + `<div class="ur-card-d">${esc(d.description)}</div></div>`;
  }).join("");
}

function renderChart() {
  const host = document.getElementById("ur-chart");
  const maxSpeeches = Math.max(1, ...CLASS_ORDER.map((c) => (BY_CLASS[c] || {}).speeches || 0));
  const rows = CLASS_ORDER.map((c) => {
    const d = BY_CLASS[c] || { groups: 0, speeches: 0 };
    const pct = Math.round(((d.speeches || 0) / maxSpeeches) * 100);
    return `<div class="ur-bar-row">`
      + `<span class="ur-bar-lbl"><span class="badge cat-${esc(c)}">${esc(c)}</span></span>`
      + `<span class="ur-bar-track"><span class="ur-bar-fill cat-${esc(c)}" style="width:${pct}%"></span></span>`
      + `<span class="ur-bar-val">${fmt(d.speeches)} Redebeiträge / ${fmt(d.groups)} Gruppen</span></div>`;
  }).join("");
  host.innerHTML = `<div class="ur-bars">${rows}</div>`;
}

function fillCategoryOptions() {
  const sel = document.getElementById("ur-category");
  const total = GROUPS.length;
  const opts = [`<option value="C">C - mehrdeutig (${fmt((BY_CLASS.C || {}).groups || 0)})</option>`,
                `<option value="">alle Kategorien (${fmt(total)})</option>`];
  for (const c of CLASS_ORDER) {
    if (c === "C") continue;
    const n = (BY_CLASS[c] || {}).groups || 0;
    opts.push(`<option value="${c}">${c} (${fmt(n)})</option>`);
  }
  sel.innerHTML = opts.join("");
}

// --- GROUP LIST ---

function filtered() {
  const cat = urCat();
  const q = urQuery();
  return GROUPS.filter((g) => {
    if (cat && g.class !== cat) return false;
    if (!q) return true;
    const hay = (g.surname + " " + (g.top_raws || []).map((r) => r.raw).join(" ")).toLowerCase();
    return hay.includes(q);
  });
}

function render() {
  const rows = filtered();
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (PAGE >= totalPages) PAGE = totalPages - 1;
  if (PAGE < 0) PAGE = 0;
  const pageRows = rows.slice(PAGE * PAGE_SIZE, (PAGE + 1) * PAGE_SIZE);
  const list = document.getElementById("ur-list");
  list.innerHTML = pageRows.map(groupHtml).join("")
    || `<p class="muted">Keine offenen Sprecher:innen. Erst <code>build_webdata.py</code> ausführen.</p>`;
  document.getElementById("ur-count").textContent =
    `${fmt(total)} Gruppen` + (total > PAGE_SIZE ? ` (Seite ${PAGE + 1}/${totalPages})` : "");
  renderPagination(total, totalPages);
}

function renderPagination(total, totalPages) {
  const pag = document.getElementById("ur-pagination");
  if (total <= PAGE_SIZE) { pag.innerHTML = ""; return; }
  pag.innerHTML = `<button id="ur-prev"${PAGE === 0 ? " disabled" : ""}>&#8249;</button>`
    + `<span class="muted">Seite ${PAGE + 1} / ${totalPages}</span>`
    + `<button id="ur-next"${PAGE >= totalPages - 1 ? " disabled" : ""}>&#8250;</button>`;
  const list = document.getElementById("ur-list");
  document.getElementById("ur-prev").addEventListener("click", () => { PAGE--; render(); list.scrollIntoView(); });
  document.getElementById("ur-next").addEventListener("click", () => { PAGE++; render(); list.scrollIntoView(); });
}

function groupId(g) {
  return "ur:" + g.period + ":" + g.surname;
}

function groupHtml(g) {
  const cands = (g.candidates || []).length;
  const raws = (g.top_raws || []).map((r) => `${esc(r.raw)} (${r.count})`).join(", ");
  return `<div class="row ur-row" data-id="${esc(groupId(g))}">`
    + `<div class="ur-row-main">`
    + `<div class="nm"><span class="badge cat-${esc(g.class)}">${esc(g.class)}</span> `
    + `WP${esc(g.period)} <b>${esc(g.surname)}</b> `
    + `<span class="muted">n=${g.n}, ${cands} Kandidat(en)</span></div>`
    + `<div class="sub">${raws}</div></div>`
    + `<button class="ur-toggle" type="button">Details</button></div>`
    + `<div class="ur-detail" data-for="${esc(groupId(g))}" hidden></div>`;
}

// --- DETAIL (lazy, on expand) ---

function onListClick(e) {
  const btn = e.target.closest(".ur-toggle");
  if (btn) {
    const row = btn.closest(".ur-row");
    const panel = row.nextElementSibling;
    if (!panel || !panel.classList.contains("ur-detail")) return;
    const open = !panel.hidden;
    if (open) { panel.hidden = true; return; }
    const g = GROUPS.find((x) => groupId(x) === row.dataset.id);
    if (g && !panel.dataset.filled) { panel.innerHTML = detailHtml(g); panel.dataset.filled = "1"; }
    panel.hidden = false;
    return;
  }
  const copyBtn = e.target.closest(".ur-copy");
  if (copyBtn) {
    const g = GROUPS.find((x) => groupId(x) === copyBtn.dataset.id);
    if (g) copyBatch(g, copyBtn);
  }
  const fixBtn = e.target.closest(".ur-fixpacket");
  if (fixBtn) {
    const g = GROUPS.find((x) => groupId(x) === fixBtn.dataset.id);
    if (g) copyFixPacket("unresolved_group", g, fixBtn);
  }
}

function detailHtml(g) {
  const cands = (g.candidates || []).map((c) =>
    `<li><code>${esc(c.id)}</code> ${esc(c.name)} `
    + `<span class="muted">${esc(c.party || "?")}`
    + `${c.role ? ", " + esc(c.role) : ""}, WP ${(c.periods || []).join("/")}</span></li>`
  ).join("") || `<li class="muted">keine Kandidaten in der Datenbank</li>`;
  const lines = (g.first_lines || []).map((l) => `<div class="ur-line">${esc(l)}</div>`).join("");
  const srcs = (g.sources || []).map(sourceHtml).join("") || `<span class="muted">keine Quellen</span>`;
  return `<div class="ur-detail-grid">`
    + `<div><h4>Kandidaten</h4><ul class="ur-cands">${cands}</ul></div>`
    + `<div><h4>Erste Zeilen</h4>${lines || '<span class="muted">-</span>'}</div>`
    + `</div>`
    + `<h4>Fundstellen (${(g.sources || []).length})</h4><div class="ur-sources">${srcs}</div>`
    + `<button class="ur-fixpacket" type="button" data-id="${esc(groupId(g))}">Fix-Paket kopieren</button>`
    + `<button class="ur-copy" type="button" data-id="${esc(groupId(g))}">LLM-Recherche-JSON kopieren</button>`
    + `<p class="muted">Fix-Paket: ins Agenten-Fenster einfuegen, Anleitung in docs/MANUAL_FIXES.md.</p>`;
}

function sourceHtml(src) {
  const pdf = refUrl(src.file);
  const pdfLink = pdf
    ? `<a href="${esc(pdf)}${src.page ? `#page=${src.page}` : ""}" target="_blank" rel="noopener">PDF${src.page ? ` S.${src.page}` : ""}</a>`
    : "";
  const x = xmlLink(src);
  const xmlA = x ? `<a href="${esc(x.href)}">${esc(x.text)}</a>` : "";
  const ref = src.file ? shortFile(src.file) + (src.line ? ":" + src.line : "") : "?";
  return `<span class="ur-src">${esc(ref)} ${pdfLink} ${xmlA}</span>`;
}

// --- LLM BATCH COPY ---

// Build the disambig_batchN_research.json group shape: candidates + raw variants +
// an empty resolution[] for the LLM to fill, plus the task rules used by the repo
// workflow. Pasting the LLM result back drives the cache update.
function batchObject(g) {
  return {
    period: g.period,
    surname: g.surname,
    class: g.class,
    persons_candidates: g.candidates || [],
    raw_variants: (g.top_raws || []).map((r) => r.raw),
    first_lines: g.first_lines || [],
    task: "Resolve each raw_variant to a person_id from persons_candidates, or null. "
      + "Rule 1: an Ort (Stadt/Wahlkreis) in the raw MUST match the candidate; never ignore a mismatch. "
      + "Rule 2: the party label MUST be compatible (CDU/CSU covers CDU and CSU). "
      + "Rule 3: the candidate's periods MUST include " + g.period + "; else null. "
      + "Rule 4: if no Ort and several share a party, output null. Never guess.",
    resolution: (g.top_raws || []).map((r) => ({ raw: r.raw, person_id: null, reason: "" })),
  };
}

function copyBatch(g, btn) {
  const text = JSON.stringify(batchObject(g), null, 2);
  const done = () => { const o = btn.textContent; btn.textContent = "kopiert"; setTimeout(() => { btn.textContent = o; }, 1500); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, done) {
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); done(); } catch (e) { /* no-op */ }
  document.body.removeChild(ta);
}

// --- UTIL ---

function shortFile(f) {
  const parts = String(f).split("/");
  return parts.slice(-2).join("/");
}

function fmt(n) {
  return Number(n || 0).toLocaleString("de");
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

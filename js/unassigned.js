// Unassigned tab: garbage-collected lines to review for missed content (5.4).
// Each line shows its file:line + category, deep-links to the source (PDF / XML),
// and is checkbox-selectable to collect for the manual-corrections pipeline.

import { refUrl, xmlLink } from "./data.js";
import { isSelected, toggle } from "./selection.js";
import { setRoute } from "./router.js";

let ALL = [];
let BY_CAT = {};
const MAX_ROWS = 500;
const CATS = ["other", "ocr_junk", "toc", "furniture"];

function lineId(u) {
  return "un:" + (u.file || "?") + ":" + (u.line ?? "?");
}

export function initUnassigned(payload) {
  ALL = (payload && payload.lines) || [];
  BY_CAT = (payload && payload.by_category) || {};
  document.getElementById("un-search").addEventListener("input", () => { render(); syncUrl(true); });
  document.getElementById("un-category").addEventListener("change", () => { render(); syncUrl(true); });
  fillCategoryOptions();
  // A line click deep-links the exact line (its inline PDF/XML links still work).
  document.getElementById("un-list").addEventListener("click", (e) => {
    if (e.target.closest(".sel") || e.target.closest("a")) return;
    const row = e.target.closest(".row[data-id]");
    if (row) setRoute("unassigned", { id: row.dataset.id, q: unQuery(), cat: unCat() });
  });
  render();
}

export function rerenderUnassigned() { render(); }

const unQuery = () => document.getElementById("un-search").value.trim();
const unCat = () => document.getElementById("un-category").value;

function syncUrl(replace) {
  setRoute("unassigned", { q: unQuery(), cat: unCat() }, replace);
}

// Restore filters from #unassigned/<id>?q&cat and highlight the deep-linked line.
export function routeUnassigned(route) {
  const q = route.params.get("q") || "";
  const cat = route.params.get("cat");
  const search = document.getElementById("un-search");
  const catSel = document.getElementById("un-category");
  if (search && search.value !== q) search.value = q;
  if (catSel && cat != null && catSel.value !== cat) catSel.value = cat;
  render();
  if (route.id) highlightLine(route.id);
}

function highlightLine(id) {
  const list = document.getElementById("un-list");
  for (const row of list.querySelectorAll(".row[data-id]")) {
    const hit = row.dataset.id === id;
    row.classList.toggle("hl", hit);
    if (hit) row.scrollIntoView({ block: "center" });
  }
}

function fillCategoryOptions() {
  const sel = document.getElementById("un-category");
  const opts = ['<option value="other">nur Kandidaten (other)</option>',
                '<option value="">alle Kategorien</option>'];
  for (const c of CATS) {
    if (c === "other") continue;
    const n = BY_CAT[c] || 0;
    opts.push(`<option value="${c}">${c} (${n.toLocaleString("de")})</option>`);
  }
  sel.innerHTML = opts.join("");
}

function filtered() {
  const q = document.getElementById("un-search").value.trim().toLowerCase();
  const cat = document.getElementById("un-category").value;
  return ALL.filter((u) => {
    if (cat && u.category !== cat) return false;
    if (!q) return true;
    return (u.text + " " + u.file).toLowerCase().includes(q);
  });
}

function render() {
  const rows = filtered();
  const list = document.getElementById("un-list");
  const shown = rows.slice(0, MAX_ROWS);
  list.innerHTML = shown.map(rowHtml).join("")
    || `<p class="muted">Keine unzugeordneten Zeilen. Erst <code>build_webdata.py</code> ausfuehren.</p>`;
  shown.forEach((u, i) => {
    const cb = list.children[i] && list.children[i].querySelector(".sel input");
    if (cb) cb.addEventListener("change", () => toggle(lineId(u), "unassigned", {
      key: lineId(u), text: u.text, file: u.file, line: u.line, category: u.category }));
  });
  document.getElementById("un-count").textContent =
    `${rows.length.toLocaleString("de")} Zeilen`
    + (rows.length > MAX_ROWS ? ` (zeige ${MAX_ROWS})` : "");
}

function rowHtml(u) {
  const ref = u.file ? `${shortFile(u.file)}:${u.line ?? "?"}` : "?";
  const url = refUrl(u.file);
  const pdf = url ? ` <a href="${esc(url)}" target="_blank" rel="noopener">PDF</a>` : "";
  const x = xmlLink(u);
  const xml = x ? ` <a href="${esc(x.href)}">${esc(x.text)}</a>` : "";
  const checked = isSelected(lineId(u)) ? "checked" : "";
  return `<div class="row un-row" data-id="${esc(lineId(u))}"><label class="sel"><input type="checkbox" ${checked}></label>`
    + `<div><div class="nm">${esc(u.text)}</div>`
    + `<div class="sub">${esc(ref)}${pdf}${xml}</div></div>`
    + `<span class="badge cat-${esc(u.category)}">${esc(u.category)}</span></div>`;
}

// "input/pp13/13218.xml" -> "pp13/13218.xml" for a compact reference.
function shortFile(f) {
  const parts = f.split("/");
  return parts.slice(-2).join("/");
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

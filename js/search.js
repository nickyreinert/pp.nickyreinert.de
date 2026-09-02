// Unified search across ALL item types (speakers, agenda, polls, interjections,
// unassigned). Static approach: every dataset is already in memory, so we build
// one flat index once and substring-match it; results are grouped by type and
// jump to the owning tab with that tab's filter pre-set.

import { speakerId } from "./speakers.js";
import { setRoute } from "./router.js";

let INDEX = [];
let DATA = {};

const TYPE_LABEL = {
  speakers: "Sprecher:innen", toc: "Tagesordnung", polls: "Abstimmungen",
  interjections: "Zwischenrufe", unassigned: "Unzugeordnet",
};

// Build a flat [{type, text, label, sub, term, id}] index from all datasets.
// id is the deep-link target for the owning tab (where one exists), so a hit can
// open the exact detail rather than only pre-filling that tab's filter.
function buildIndex({ speakers, toc, structured, unassigned }) {
  const idx = [];
  (speakers || []).forEach((s) => idx.push({
    type: "speakers", term: s.raw, id: speakerId(s),
    text: `${s.raw} ${s.name || ""} ${(s.parties || []).join(" ")} ${(s.variants || []).join(" ")}`,
    label: s.raw, sub: [s.name, (s.parties || []).join(", ")].filter(Boolean).join(" - "),
  }));
  (toc || []).forEach((t) => (t.tops || []).forEach((top) => idx.push({
    type: "toc", term: `${t.period}/${t.session}`,
    text: `${t.period}/${t.session} ${top.title || ""} ${(top.speakers || []).map((x) => x.name).join(" ")}`,
    label: top.title || `Sitzung ${t.period}/${t.session}`, sub: `Sitzung ${t.period}/${t.session}`,
  })));
  ((structured || {}).polls || []).forEach((p) => idx.push({
    type: "polls", term: p.session || "", id: `${p.period}/${p.session}`,
    text: `${p.session || ""} ${p.kind || ""} ${p.subject || ""}`,
    label: p.subject || p.kind || "Abstimmung", sub: `Sitzung ${p.period}/${p.session || "?"} - ${p.kind || ""}`,
  }));
  ((structured || {}).people || []).forEach((p) => idx.push({
    type: "interjections", term: p.name || p.raw || "",
    text: `${p.name || ""} ${p.raw || ""}`, label: p.name || p.raw, sub: `${p.count || 0} Zwischenrufe`,
  }));
  ((unassigned || {}).lines || []).forEach((l) => idx.push({
    type: "unassigned", term: l.text || "",
    id: "un:" + (l.file || "?") + ":" + (l.line ?? "?"),
    text: `${l.text || ""} ${l.file || ""}`, label: (l.text || "").slice(0, 80), sub: l.file || "",
  }));
  return idx;
}

function search(q, limit = 40) {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  const hits = [];
  for (const it of INDEX) {
    if (it.text.toLowerCase().includes(t)) { hits.push(it); if (hits.length >= limit * 5) break; }
  }
  return hits.slice(0, limit);
}

function group(hits) {
  const g = {};
  hits.forEach((h) => (g[h.type] = g[h.type] || []).push(h));
  return g;
}

// Jump to a hit's deep-link. Types with a detail target (speakers, polls,
// unassigned) open it directly via the route; the rest pre-fill the tab filter.
function jumpTo(type, term, id) {
  if (id && type === "speakers") setRoute("speakers", { id, q: term });
  else if (id && type === "polls") setRoute("polls", { id, q: term });
  else if (id && type === "unassigned") setRoute("unassigned", { id, q: term });
  else setRoute(type, { q: term });
  document.getElementById("global-results").classList.remove("open");
}

function render(hits) {
  const box = document.getElementById("global-results");
  if (!hits.length) { box.classList.remove("open"); box.innerHTML = ""; return; }
  const g = group(hits);
  box.innerHTML = Object.entries(g).map(([type, items]) =>
    `<div class="gs-group"><div class="gs-head">${TYPE_LABEL[type]} (${items.length})</div>`
    + items.map((h, i) =>
        `<div class="gs-item" data-type="${type}" data-term="${esc(h.term)}" data-id="${esc(h.id || "")}">`
        + `<span class="gs-label">${esc(h.label)}</span>`
        + `<span class="gs-sub">${esc(h.sub || "")}</span></div>`).join("")
    + "</div>").join("");
  box.classList.add("open");
  box.querySelectorAll(".gs-item").forEach((el) =>
    el.addEventListener("click", () => jumpTo(el.dataset.type, el.dataset.term, el.dataset.id)));
}

export function initGlobalSearch(data) {
  DATA = data;
  INDEX = buildIndex(DATA);
  const input = document.getElementById("global-search");
  if (!input) return;
  input.addEventListener("input", () => render(search(input.value)));
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".global-search")) document.getElementById("global-results").classList.remove("open");
  });
}

// Rebuild the index once the lazily-loaded agenda arrives, so TOC hits become
// searchable (the initial index is built from an empty toc array).
export function updateSearchToc(toc) {
  DATA = { ...DATA, toc };
  INDEX = buildIndex(DATA);
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

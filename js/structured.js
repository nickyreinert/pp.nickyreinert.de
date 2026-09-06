// Structured tabs: roll-call votes (Abstimmungen) + interjection breakdown
// (Typen, Personen, Fraktionen, meist unterbrochene Redner).
// Built from output_structured/ via build_webdata + normalize_interjections.

import { refUrl, xmlLink } from "./data.js";
import { isSelected, toggle } from "./selection.js";
import { setRoute } from "./router.js";

let POLLS = [];
let TYPES = [];
let PEOPLE = [];
let GROUPS = [];
let TARGETS = [];
const MAX = 500;

function pollId(p) { return `${p.period}/${p.session}`; }

export function initStructured(payload) {
  POLLS = (payload && payload.polls) || [];
  TYPES = (payload && payload.types) || [];
  PEOPLE = (payload && payload.people) || [];
  GROUPS = (payload && payload.groups) || [];
  TARGETS = (payload && payload.targets) || [];

  document.getElementById("poll-search")
    .addEventListener("input", () => { renderPolls(); setRoute("polls", { q: pollQuery() }, true); });
  document.getElementById("ij-people-search")
    .addEventListener("input", () => { renderPeople(); setRoute("interjections", { q: ijQuery("people") }, true); });
  document.getElementById("ij-groups-search")
    .addEventListener("input", () => { renderGroups(); setRoute("interjections", { q: ijQuery("groups") }, true); });
  document.getElementById("ij-targets-search")
    .addEventListener("input", () => { renderTargets(); });

  wireSelect("poll-list", "poll",
    (d) => ({ key: d.key, period: d.period, session: d.session, kind: d.kind, file: d.file }));
  wireSelect("ij-people-list", "interjector",
    (d) => ({ key: d.key, name: d.name, count: +d.count }));

  document.getElementById("ij-people-list").addEventListener("click", (e) => {
    if (e.target.closest(".sel")) return;
    const row = e.target.closest(".row[data-name]");
    if (row) showPerson(PEOPLE.find((p) => p.name === row.dataset.name));
  });

  document.getElementById("poll-list").addEventListener("click", (e) => {
    if (e.target.closest(".sel") || e.target.closest("a")) return;
    const row = e.target.closest(".row[data-id]");
    if (row) setRoute("polls", { id: row.dataset.id, q: pollQuery() });
  });

  renderTypes();
  renderPolls();
  renderPeople();
  renderGroups();
  renderTargets();
}

export function rerenderStructured() {
  renderPolls();
  renderPeople();
  renderGroups();
  renderTargets();
}

const pollQuery = () => document.getElementById("poll-search").value.trim();
const ijQuery = (id) => document.getElementById(`ij-${id}-search`).value.trim();

export function routePolls(route) {
  const q = route.params.get("q") || "";
  const input = document.getElementById("poll-search");
  if (input && input.value !== q) input.value = q;
  renderPolls();
  if (route.id) {
    const p = POLLS.find((x) => pollId(x) === route.id);
    if (p) showPoll(p);
  }
}

export function routeInterjections(route) {
  const q = route.params.get("q") || "";
  const peopleInput = document.getElementById("ij-people-search");
  if (peopleInput && peopleInput.value !== q) peopleInput.value = q;
  renderPeople();
}

function wireSelect(listId, type, payload) {
  document.getElementById(listId).addEventListener("change", (e) => {
    if (e.target.matches(".sel input"))
      toggle(e.target.dataset.key, type, payload(e.target.dataset));
  });
}

// --- POLLS ---

function pollsFiltered() {
  const q = document.getElementById("poll-search").value.trim().toLowerCase();
  if (!q) return POLLS;
  const wp = q.match(/^wp\s*(\d+)$/);
  return POLLS.filter((p) =>
    wp ? String(p.period) === wp[1]
       : (`wp${p.period} ${p.period}/${p.session} ${p.kind || ""}`).toLowerCase().includes(q));
}

function renderPolls() {
  const rows = pollsFiltered();
  const byWp = {};
  rows.forEach((p) => (byWp[p.period] = byWp[p.period] || []).push(p));
  const wps = Object.keys(byWp).sort((a, b) => +a - +b);
  document.getElementById("poll-list").innerHTML =
    wps.map((wp) => {
      const ps = byWp[wp];
      const open = ps.length <= 8 ? "open" : "";
      return `<details class="wp-group" ${open}><summary><strong>Wahlperiode ${wp}</strong>`
        + ` <span class="muted">${ps.length} Abstimmungen</span></summary>`
        + ps.slice(0, MAX).map(pollHtml).join("") + `</details>`;
    }).join("")
    || `<p class="muted">Keine Abstimmungen. Erst <code>build_webdata.py</code> ausfuehren.</p>`;
  document.getElementById("poll-count").textContent =
    `${rows.length.toLocaleString("de")} namentliche Abstimmungen in ${wps.length} Wahlperioden`;
}

function pollPdf(p) {
  const url = refUrl(p.file);
  if (!url) return null;
  return { href: url + (p.page ? `#page=${p.page}` : ""), text: `PDF${p.page ? ` S.${p.page}` : ""}` };
}

function pollXml(p) {
  return p.xml_line ? xmlLink(p) : null;
}

function pollHtml(p) {
  const u = pollPdf(p);
  const pdf = u ? ` <a href="${esc(u.href)}" target="_blank" rel="noopener">${esc(u.text)}</a>` : "";
  const x = pollXml(p);
  const xml = x ? ` <a href="${esc(x.href)}" target="_blank" rel="noopener">${esc(x.text)}</a>` : "";
  const tally = [`${p.ja ?? "?"} Ja`, `${p.nein ?? "?"} Nein`,
                 `${p.enthalten ?? "?"} Enth.`].join(" / ");
  const flag = p.validated
    ? `<span class="badge cat-other">Roster ${p.roster}</span>`
    : `<span class="badge">Roster ${p.roster}${p.abgegeben ? "/" + p.abgegeben : ""}</span>`;
  const key = `poll:${p.period}/${p.session}`;
  return `<div class="row" data-id="${esc(pollId(p))}"><label class="sel"><input type="checkbox" ${isSelected(key) ? "checked" : ""}`
    + ` data-key="${esc(key)}" data-period="${esc(p.period)}" data-session="${esc(p.session)}"`
    + ` data-kind="${esc(p.kind || "")}" data-file="${esc(p.file || "")}"></label>`
    + `<div><div class="nm">WP${p.period} Sitzung ${p.session}`
    + ` <span class="muted">${esc(p.kind || "")}</span></div>`
    + `<div class="sub">${tally}${p.abgegeben ? ` (${p.abgegeben} abgegeben)` : ""}${pdf}${xml}</div></div>`
    + `${flag}</div>`;
}

function showPoll(p) {
  const u = pollPdf(p);
  const pdf = u ? `<a href="${esc(u.href)}" target="_blank" rel="noopener">Offizielles PDF-Ergebnis${p.page ? ` (S. ${esc(p.page)})` : ""}</a>` : "";
  const x = pollXml(p);
  const xmlLabel = p.xml_line ? `${esc(x.text)} (Zeile ${esc(p.xml_line)})` : `${esc(x.text)} (Quelldatei)`;
  const xml = x ? `<a href="${esc(x.href)}" target="_blank" rel="noopener">${xmlLabel}</a>` : "";
  const rows = [["Ja", p.ja], ["Nein", p.nein], ["Enthalten", p.enthalten],
                ["Abgegeben", p.abgegeben], ["Roster (erwartet)", p.roster]]
    .filter(([, v]) => v != null)
    .map(([k, v]) => `<div class="bar"><span class="label">${k}</span>`
      + `<span class="val">${Number(v).toLocaleString("de")}</span></div>`).join("");
  const status = p.validated
    ? `<span class="badge ok">validiert</span>`
    : `<span class="badge no">nicht validiert (Roster ${p.roster}${p.abgegeben ? "/" + p.abgegeben : ""})</span>`;
  document.getElementById("poll-detail").innerHTML =
    `<h3>WP${p.period} Sitzung ${p.session}</h3>`
    + `<p class="muted">${esc(p.kind || "Namentliche Abstimmung")} ${status}</p>`
    + `<h4>Ergebnis</h4>${rows}`
    + `<h4>Quellen</h4><div class="src">${pdf}</div><div class="src">${xml}</div>`
    + (p.xml_line ? ""
       : `<p class="muted">Hinweis: fuer diese Abstimmung wurde keine Zeile aufgeloest; `
         + `der XML-Link verweist auf die Sitzungsdatei.</p>`);
}

// --- INTERJECTION TYPES ---

function renderTypes() {
  const total = TYPES.reduce((a, k) => a + k.count, 0) || 1;
  document.getElementById("ij-types").innerHTML = TYPES.map((k) => {
    const pct = Math.round((k.count / total) * 100);
    return `<span class="ij-kind">${esc(k.type)} `
      + `<b>${k.count.toLocaleString("de")}</b> (${pct}%)</span>`;
  }).join("");
}

// --- PEOPLE (named individuals) ---

function renderPeople() {
  const q = document.getElementById("ij-people-search").value.trim().toLowerCase();
  const rows = q ? PEOPLE.filter((i) => i.name.toLowerCase().includes(q)) : PEOPLE;
  document.getElementById("ij-people-list").innerHTML =
    rows.slice(0, MAX).map(personHtml).join("")
    || `<p class="muted">Keine Zwischenrufer.</p>`;
  document.getElementById("ij-people-count").textContent =
    `${PEOPLE.length.toLocaleString("de")} Personen${q ? ` – ${rows.length} Treffer` : ""}`;
}

function personHtml(i) {
  const key = `ij:${i.name}`;
  return `<div class="row" data-name="${esc(i.name)}"><label class="sel"><input type="checkbox" ${isSelected(key) ? "checked" : ""}`
    + ` data-key="${esc(key)}" data-name="${esc(i.name)}" data-count="${i.count}"></label>`
    + `<div class="nm">${esc(i.name)}</div>`
    + `<div class="cnt">${i.count.toLocaleString("de")}</div></div>`;
}

// Detail panel for a clicked interjector: sample shouts + PDF/XML deeplinks.
function showPerson(i) {
  const host = document.getElementById("ij-people-detail");
  if (!i) { host.innerHTML = ""; return; }
  const samples = (i.samples || []).map(sampleHtml).join("")
    || `<p class="muted">Keine Beispiel-Zwischenrufe gespeichert.</p>`;
  host.innerHTML = `<h3>${esc(i.name)}</h3>`
    + `<p class="muted">${i.count.toLocaleString("de")} Zwischenrufe`
    + ` (Auswahl: ${(i.samples || []).length})</p>${samples}`;
}

function sampleHtml(s) {
  const u = refUrl(s.file);
  const pdf = u ? ` <a href="${esc(u + (s.page ? `#page=${s.page}` : ""))}" target="_blank" rel="noopener">PDF${s.page ? ` S.${s.page}` : ""}</a>` : "";
  const x = s.xml_line ? xmlLink(s) : null;
  const xml = x ? ` <a href="${esc(x.href)}" target="_blank" rel="noopener">${esc(x.text)}</a>` : "";
  const where = `WP${s.period}${s.session ? `/${s.session}` : ""}`;
  const target = s.target ? ` an ${esc(s.target)}` : "";
  return `<div class="ij-sample"><div class="ij-sample-raw">${esc(s.raw || s.text || "")}</div>`
    + `<div class="sub"><span class="badge cat-furniture">${esc(s.kind || "")}</span> ${where}${target}${pdf}${xml}</div></div>`;
}

// --- GROUPS (factions / parties) ---

function renderGroups() {
  const q = document.getElementById("ij-groups-search").value.trim().toLowerCase();
  const rows = q ? GROUPS.filter((g) => g.name.toLowerCase().includes(q)) : GROUPS;
  document.getElementById("ij-groups-list").innerHTML =
    rows.slice(0, MAX).map(groupHtml).join("")
    || `<p class="muted">Keine Fraktionen.</p>`;
  document.getElementById("ij-groups-count").textContent =
    `${GROUPS.length.toLocaleString("de")} Fraktionen${q ? ` – ${rows.length} Treffer` : ""}`;
}

function groupHtml(g) {
  return `<div class="row">`
    + `<div class="nm">${esc(g.name)}</div>`
    + `<div class="cnt">${g.count.toLocaleString("de")}</div></div>`;
}

// --- TARGETS (most interrupted speakers) ---

function renderTargets() {
  const q = document.getElementById("ij-targets-search").value.trim().toLowerCase();
  const rows = q ? TARGETS.filter((t) => t.name.toLowerCase().includes(q)) : TARGETS;
  document.getElementById("ij-targets-list").innerHTML =
    rows.slice(0, MAX).map(targetHtml).join("")
    || `<p class="muted">Keine Daten.</p>`;
  document.getElementById("ij-targets-count").textContent =
    `${TARGETS.length.toLocaleString("de")} Redner${q ? ` – ${rows.length} Treffer` : ""}`;
}

function targetHtml(t) {
  return `<div class="row">`
    + `<div class="nm">${esc(t.name)}</div>`
    + `<div class="cnt">${t.count.toLocaleString("de")}</div></div>`;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

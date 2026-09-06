// Fehlliste tab: excused (absent) members per sitting + a per-person
// absenteeism leaderboard, with PDF/XML source links per session.
// Built from output_structured/ fehlliste via build_webdata.

import { refUrl, xmlLink } from "./data.js";

let SESSIONS = [];
let PEOPLE = [];
const MAX = 500;

function sessionId(s) { return `${s.period}/${s.session}`; }

export function initFehlliste(payload) {
  SESSIONS = (payload && payload.sessions) || [];
  PEOPLE = (payload && payload.people) || [];

  document.getElementById("fl-people-search")
    .addEventListener("input", renderPeople);
  document.getElementById("fl-sessions-search")
    .addEventListener("input", renderSessions);

  document.getElementById("fl-sessions-list").addEventListener("click", (e) => {
    const row = e.target.closest(".row[data-id]");
    if (row) showSession(SESSIONS.find((s) => sessionId(s) === row.dataset.id));
  });

  renderPeople();
  renderSessions();
}

// --- PEOPLE (most-excused leaderboard) ---

function renderPeople() {
  const q = document.getElementById("fl-people-search").value.trim().toLowerCase();
  const rows = q ? PEOPLE.filter((p) => p.name.toLowerCase().includes(q)) : PEOPLE;
  document.getElementById("fl-people-list").innerHTML =
    rows.slice(0, MAX).map(personHtml).join("")
    || `<p class="muted">Keine Daten.</p>`;
  document.getElementById("fl-people-count").textContent =
    `${PEOPLE.length.toLocaleString("de")} Personen${q ? ` – ${rows.length} Treffer` : ""}`;
}

function personHtml(p) {
  return `<div class="row"><div class="nm">${esc(p.name)}</div>`
    + `<div class="cnt">${p.count.toLocaleString("de")}x entschuldigt</div></div>`;
}

// --- SESSIONS ---

function sessionsFiltered() {
  const q = document.getElementById("fl-sessions-search").value.trim().toLowerCase();
  if (!q) return SESSIONS;
  const wp = q.match(/^wp\s*(\d+)$/);
  return SESSIONS.filter((s) =>
    wp ? String(s.period) === wp[1]
       : (`wp${s.period} ${s.period}/${s.session}`).toLowerCase().includes(q));
}

function renderSessions() {
  const rows = sessionsFiltered();
  const byWp = {};
  rows.forEach((s) => (byWp[s.period] = byWp[s.period] || []).push(s));
  const wps = Object.keys(byWp).sort((a, b) => +a - +b);
  document.getElementById("fl-sessions-list").innerHTML =
    wps.map((wp) => {
      const ss = byWp[wp];
      const open = ss.length <= 8 ? "open" : "";
      return `<details class="wp-group" ${open}><summary><strong>Wahlperiode ${wp}</strong>`
        + ` <span class="muted">${ss.length} Sitzungen</span></summary>`
        + ss.slice(0, MAX).map(sessionHtml).join("") + `</details>`;
    }).join("")
    || `<p class="muted">Keine Sitzungen mit Fehlliste.</p>`;
  document.getElementById("fl-sessions-count").textContent =
    `${rows.length.toLocaleString("de")} Sitzungen in ${wps.length} Wahlperioden`;
}

function sessionHtml(s) {
  return `<div class="row" data-id="${esc(sessionId(s))}">`
    + `<div><div class="nm">WP${s.period} Sitzung ${s.session}</div></div>`
    + `<div class="cnt">${s.count.toLocaleString("de")} entschuldigt</div></div>`;
}

function showSession(s) {
  if (!s) return;
  const host = document.getElementById("fl-session-detail");
  const u = refUrl(s.file);
  const pdf = u ? `<a href="${esc(u + (s.page ? `#page=${s.page}` : ""))}" target="_blank" rel="noopener">PDF${s.page ? ` S.${s.page}` : ""}</a>` : "";
  const x = s.xml_line ? xmlLink(s) : null;
  const xml = x ? `<a href="${esc(x.href)}" target="_blank" rel="noopener">${esc(x.text)}</a>` : "";
  const members = (s.members || []).map((m) =>
    `<div class="ij-sample"><div class="ij-sample-raw">${esc(m.name)}</div>`
    + `<div class="sub"><span class="badge cat-furniture">${esc(m.faction || "")}</span>`
    + `${m.until ? ` bis ${esc(m.until)}` : ""}</div></div>`).join("")
    || `<p class="muted">Keine Eintraege.</p>`;
  host.innerHTML = `<h3>WP${s.period} Sitzung ${s.session}</h3>`
    + `<p class="muted">${s.count.toLocaleString("de")} entschuldigte Abgeordnete</p>`
    + `<div class="src">${pdf} ${xml}</div>`
    + `<h4>Entschuldigt</h4>${members}`;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

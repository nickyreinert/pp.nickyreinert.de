import { refUrl, xmlLink } from "./data.js";
import { copyFixPacket } from "./fixpacket.js";
import { setRoute } from "./router.js";
import {
  bindOnce, byId, esc, markSelected, number, pageSlice,
  renderPagination, setValue,
} from "./tabutils.js";

const PAGE_SIZE = 100;
const RELATED_PAGE_SIZE = 50;
let INDEX = { periods: [] };
let SESSIONS = [];
let PEOPLE = [];
let CURRENT = null;
let INITIALIZED = false;

const STATUS_ORDER = ["excused", "leave", "absent_unexcused", "retracted", "unknown"];
const STATUS_LABELS = {
  excused: "entschuldigt",
  leave: "beurlaubt",
  absent_unexcused: "ausdrücklich unentschuldigt",
  retracted: "zurückgenommen",
  unknown: "nicht eindeutig klassifiziert",
};

function statusOf(value) {
  const status = String(value || "unknown");
  return STATUS_LABELS[status] ? status : "unknown";
}

function statusLabel(value) {
  return STATUS_LABELS[statusOf(value)];
}

function statusSummary(counts = {}) {
  return STATUS_ORDER
    .filter((status) => Number(counts[status] || 0) > 0)
    .map((status) => number(counts[status]) + " " + statusLabel(status))
    .join(" · ");
}

function statusBadge(member) {
  const status = statusOf(member?.status);
  const evidence = member?.status_evidence || {};
  const title = evidence.text ? ' title="' + esc(evidence.text) + '"' : "";
  return '<span class="badge absence-' + esc(status) + '"' + title + '>'
    + esc(statusLabel(status)) + '</span>';
}

function memberEvidence(member) {
  const evidence = member?.status_evidence || {};
  const retraction = member?.retraction || {};
  const parts = [];
  if (evidence.text) {
    parts.push("Statusquelle: " + evidence.text
      + (evidence.line ? " (Zeile " + evidence.line + ")" : ""));
  }
  if (retraction.from_status) parts.push("ursprünglich " + statusLabel(retraction.from_status));
  if (retraction.presence_evidence?.text) parts.push("Anwesenheit: " + retraction.presence_evidence.text);
  if (retraction.evidence?.text) parts.push("Korrektur: " + retraction.evidence.text);
  return parts.length
    ? '<div class="sub status-evidence">' + esc(parts.join(" · ")) + '</div>'
    : "";
}

function documentedCount(record) {
  const count = record.count ?? record.entries ?? 0;
  const active = record.active_count ?? record.active_entries;
  if (active === undefined || active === null || Number(active) === Number(count)) {
    return number(count) + " dokumentierte Vermerke";
  }
  return number(count) + " dokumentierte Vermerke · " + number(active) + " aktiv";
}

function personId(person) {
  return `person:${person.name}`;
}

function sessionId(session) {
  return `session:${session.period}/${session.session}`;
}

function isSessionRoute(id) {
  return /^session:\d+\/[^/]+$/.test(String(id || ""));
}

function periodValues() {
  const values = [
    ...((INDEX || {}).periods || []).map((entry) => entry.period || entry.key),
    ...SESSIONS.map((session) => session.period),
    ...PEOPLE.flatMap((person) => person.periods || []),
  ].filter((value) => value !== null && value !== undefined && value !== "").map(String);
  return [...new Set(values)].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b, "de"));
}

function fillPeriods() {
  const select = byId("fl-wp-filter");
  if (!select) return;
  const selected = select.value;
  const periods = periodValues();
  select.innerHTML = `<option value="">Alle Wahlperioden</option>`
    + periods.map((wp) => `<option value="${esc(wp)}">WP ${esc(wp)}</option>`).join("");
  if (selected && !periods.includes(selected)) {
    select.insertAdjacentHTML("beforeend", `<option value="${esc(selected)}">WP ${esc(selected)} (wird geladen)</option>`);
  }
  select.value = selected;
}

function options(id) {
  return {
    id: id === undefined ? CURRENT?.id || "" : id,
    view: byId("fl-view")?.value || "people",
    wp: byId("fl-wp-filter")?.value || "",
    q: (byId("fl-view")?.value === "sessions" ? byId("fl-sessions-search") : byId("fl-people-search"))?.value.trim() || "",
    page: CURRENT?.params.get("page") || "",
    related_page: CURRENT?.params.get("related_page") || "",
  };
}

function navigate(next = {}, replace = false) {
  setRoute("fehlliste", { ...options(), ...next }, replace);
}

function bind() {
  if (INITIALIZED) return;
  INITIALIZED = true;
  bindOnce(byId("fl-view"), "change", "fehlliste", () => navigate({ page: "", related_page: "", id: "" }));
  bindOnce(byId("fl-wp-filter"), "change", "fehlliste", () => navigate({ page: "", related_page: "" }));
  bindOnce(byId("fl-people-search"), "input", "fehlliste", () => navigate({ page: "", related_page: "" }, true));
  bindOnce(byId("fl-sessions-search"), "input", "fehlliste", () => navigate({ page: "", related_page: "" }, true));
  bindOnce(byId("fl-list"), "click", "fehlliste", (event) => {
    const row = event.target.closest("[data-id]");
    if (row) navigate({ id: row.dataset.id, related_page: "" });
  });
}

export function updateFehlliste(payload, peopleAsset = null) {
  const records = (payload || {}).records || {};
  INDEX = (payload || {}).index || { periods: [] };
  SESSIONS = Array.isArray(records.sessions) ? records.sessions : [];
  PEOPLE = (peopleAsset || {}).people || records.people || [];
  bind();
  fillPeriods();
}

function personsFiltered() {
  const wp = byId("fl-wp-filter")?.value || "";
  const q = (byId("fl-people-search")?.value || "").trim().toLocaleLowerCase("de");
  return PEOPLE.filter((person) => {
    if (wp && (person.periods || []).length && !(person.periods || []).map(String).includes(wp)) return false;
    if (wp && !(person.periods || []).length) {
      const present = SESSIONS.some((session) => String(session.period) === wp
        && (session.members || []).some((member) => member.name === person.name));
      if (!present) return false;
    }
    return !q || String(person.name || "").toLocaleLowerCase("de").includes(q);
  });
}

function sessionsFiltered() {
  const wp = byId("fl-wp-filter")?.value || "";
  const q = (byId("fl-sessions-search")?.value || "").trim().toLocaleLowerCase("de");
  return SESSIONS.filter((session) => {
    if (wp && String(session.period) !== wp) return false;
    if (!q) return true;
    const names = session.member_names || session.names
      || (session.members || []).map((member) => member.name);
    return `wp ${session.period} sitzung ${session.session} ${(names || []).join(" ")}`
      .toLocaleLowerCase("de").includes(q);
  });
}

function sourceHtml(source) {
  const pdf = refUrl(source.file);
  const xml = source.xml_line ? xmlLink(source) : null;
  return `<span class="src">${esc(source.file || "Quelle unbekannt")}`
    + `${pdf ? ` <a href="${esc(pdf + (source.page ? `#page=${source.page}` : ""))}" target="_blank" rel="noopener">PDF${source.page ? ` S.${esc(source.page)}` : ""}</a>` : ""}`
    + `${xml ? ` <a href="${esc(xml.href)}" target="_blank" rel="noopener">${esc(xml.text)}</a>` : ""}</span>`;
}

function personRow(person) {
  const factions = (person.factions || []).join(" · ") || "keine Fraktion überliefert";
  const statuses = statusSummary(person.status_counts);
  const statusText = statuses ? " · " + esc(statuses) : "";
  return '<button class="row result-row" type="button" data-id="' + esc(personId(person)) + '">'
    + '<div><div class="nm">' + esc(person.name) + '</div><div class="sub">'
    + esc(factions) + statusText + '</div></div>'
    + '<span class="cnt">' + number(person.count) + '×</span></button>';
}

function sessionRow(session) {
  const statuses = statusSummary(session.status_counts);
  const statusText = statuses ? " · " + esc(statuses) : "";
  return '<button class="row result-row" type="button" data-id="' + esc(sessionId(session)) + '">'
    + '<div><div class="nm">WP ' + esc(session.period) + ' · Sitzung ' + esc(session.session) + '</div>'
    + '<div class="sub">' + documentedCount(session) + statusText + '</div></div>'
    + '<span aria-hidden="true">→</span></button>';
}

function sessionsForPerson(person) {
  return SESSIONS.filter((session) => (session.members || []).some((member) => member.name === person.name));
}

function showPerson(person, route) {
  const host = byId("fl-detail");
  const sessions = sessionsForPerson(person);
  const statuses = statusSummary(person.status_counts);
  const statusText = statuses ? " · " + esc(statuses) : "";
  const related = pageSlice(
    sessions, route?.params.get("related_page"), RELATED_PAGE_SIZE);
  const sessionRows = related.rows.map((session) => {
    const member = (session.members || []).find((item) => item.name === person.name);
    return '<li>WP ' + esc(session.period) + ' · Sitzung ' + esc(session.session)
      + ' · ' + statusBadge(member) + ' – ' + sourceHtml(session)
      + memberEvidence(member) + '</li>';
  }).join("")
    || "<li>Keine Sitzungsreferenz gespeichert.</li>";
  host.innerHTML = '<h3>' + esc(person.name) + '</h3>'
    + '<p class="muted">' + documentedCount(person) + ' in Sitzungslisten'
    + statusText + '; kein Nachweis einer vollständigen Abwesenheitszahl.</p>'
    + ((person.factions || []).length
      ? '<p>Fraktion(en): ' + esc((person.factions || []).join(" · ")) + '</p>' : "")
    + ((person.untils || []).length
      ? '<p>Datumsangaben: ' + esc((person.untils || []).join(" · ")) + '</p>' : "")
    + '<h4>Überlieferte Sitzungen</h4>'
    + '<p class="muted">Alle ' + number(sessions.length)
    + ' überlieferten Sitzungsreferenzen sind verfügbar.</p>'
    + '<ul>' + sessionRows + '</ul>'
    + '<div id="fl-related-pagination" class="pagination"></div>'
    + '<button id="fl-copy" type="button">Fix-Paket kopieren</button>';
  renderPagination(
    host.querySelector("#fl-related-pagination"), related.page, sessions.length,
    RELATED_PAGE_SIZE, (next) => {
      navigate({ related_page: next });
      host.scrollTop = 0;
    }, { previous: "Vorherige Sitzungsreferenzen", next: "Nächste Sitzungsreferenzen" },
  );
  host.querySelector("#fl-copy")?.addEventListener("click", (event) => {
    copyFixPacket("fehlliste_person", {
      ...person,
      entity_id: personId(person),
      source_count: sessions.length,
      sources_sampled: false,
      status_note: statuses || "Quelle enthält keine explizite Statusklassifikation.",
      sources: sessions,
    }, event.currentTarget);
  });
}

function showSession(session) {
  const host = byId("fl-detail");
  const statuses = statusSummary(session.status_counts);
  const statusText = statuses ? " · " + esc(statuses) : "";
  const members = (session.members || []).map((member) =>
    '<li><strong>' + esc(member.name) + '</strong>'
    + (member.faction ? ' · ' + esc(member.faction) : "")
    + (member.until ? ' · bis ' + esc(member.until) : "")
    + ' · ' + statusBadge(member) + memberEvidence(member) + '</li>'
  ).join("") || "<li>Keine Namen überliefert.</li>";
  host.innerHTML = '<h3>WP ' + esc(session.period) + ' · Sitzung ' + esc(session.session) + '</h3>'
    + '<p class="muted">' + documentedCount(session) + statusText + '</p>'
    + '<p>' + sourceHtml(session) + '</p><h4>Überlieferte Namen</h4><ul>' + members + '</ul>'
    + '<button id="fl-copy" type="button">Fix-Paket kopieren</button>';
  host.querySelector("#fl-copy")?.addEventListener("click", (event) =>
    copyFixPacket("fehlliste_session", {
      ...session,
      entity_id: sessionId(session),
      source_count: 1,
      sources_sampled: false,
      status_note: statuses || "Quelle enthält keine explizite Statusklassifikation.",
      sources: [session],
    }, event.currentTarget));
}

function syncSearchVisibility(view) {
  const people = byId("fl-people-search");
  const sessions = byId("fl-sessions-search");
  if (people?.closest("label")) people.closest("label").hidden = view !== "people";
  if (sessions?.closest("label")) sessions.closest("label").hidden = view !== "sessions";
}

function render(route) {
  const view = byId("fl-view")?.value || "people";
  syncSearchVisibility(view);
  const rows = view === "people" ? personsFiltered() : sessionsFiltered();
  const page = pageSlice(rows, route.params.get("page"), PAGE_SIZE);
  const list = byId("fl-list");
  list.innerHTML = page.rows.map(view === "people" ? personRow : sessionRow).join("")
    || "<p class=\"muted\">Keine Einträge für diese Auswahl.</p>";
  markSelected(list, route.id);
  byId("fl-count").textContent = `${number(rows.length)} ${view === "people" ? "Personen" : "Sitzungen"}`;
  renderPagination(byId("fl-pagination"), page.page, rows.length, PAGE_SIZE, (next) => {
    navigate({ page: next });
    list.scrollTop = 0;
  });
  const selected = route.id && rows.find((item) =>
    (view === "people" ? personId(item) : sessionId(item)) === route.id);
  if (selected) {
    if (view === "people") showPerson(selected, route);
    else showSession(selected);
  } else {
    byId("fl-detail").innerHTML = "<p class=\"muted\">Eine Person oder Sitzung auswählen, um überlieferte Vermerke, Quellen und ein Fix-Paket zu sehen.</p>";
  }
}

export function routeFehlliste(route) {
  CURRENT = route;
  setValue(byId("fl-view"), route.params.get("view") === "sessions" || isSessionRoute(route.id)
    ? "sessions" : "people");
  setValue(byId("fl-wp-filter"), route.params.get("wp") || "");
  setValue(byId("fl-people-search"), route.params.get("q") || "");
  setValue(byId("fl-sessions-search"), route.params.get("q") || "");
  render(route);
}

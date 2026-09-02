import { refUrl, xmlFileLink, xmlLink } from "./data.js";
import { copyFixPacket } from "./fixpacket.js";
import { setRoute } from "./router.js";
import {
  bindOnce, byId, esc, markSelected, number, pageSlice,
  renderPagination, setValue,
} from "./tabutils.js";

const PAGE_SIZE = 100;
let POLLS = [];
let POLL_PERIODS = [];
let PEOPLE = [];
let TYPES = [];
let TYPE_SAMPLES = {};
let IJ_PERIODS = [];
let IJ_AUDIT = null;
let CURRENT_POLL = null;
let CURRENT_IJ = null;
let POLLS_BOUND = false;
let IJ_BOUND = false;

function indexPeriods(index, rows) {
  const fromIndex = (index || {}).periods || [];
  const values = [
    ...fromIndex.map((item) => item.period || item.key),
    ...rows.map((item) => item.period),
  ].filter((value) => value !== undefined && value !== null && value !== "").map(String);
  return [...new Set(values)].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b, "de"));
}

function fillPeriods(id, values) {
  const select = byId(id);
  if (!select) return;
  const selected = select.value;
  select.innerHTML = `<option value="">Alle Wahlperioden</option>`
    + values.map((wp) => `<option value="${esc(wp)}">WP ${esc(wp)}</option>`).join("");
  if (selected && !values.includes(selected)) {
    select.insertAdjacentHTML("beforeend", `<option value="${esc(selected)}">WP ${esc(selected)} (wird geladen)</option>`);
  }
  select.value = selected;
}

function assignPollIds(rows) {
  const totals = rows.reduce((all, row) => {
    const key = `${row.period}/${row.session}`;
    all[key] = (all[key] || 0) + 1;
    return all;
  }, {});
  const seen = {};
  return rows.map((row) => {
    const base = `${row.period}/${row.session}`;
    seen[base] = (seen[base] || 0) + 1;
    return { ...row, _id: row.id || (totals[base] > 1 ? `${base}:${seen[base]}` : base) };
  });
}

function pollOptions(id) {
  return {
    id,
    wp: byId("poll-wp-filter")?.value || "",
    q: byId("poll-search")?.value.trim() || "",
    page: CURRENT_POLL?.params.get("page") || "",
  };
}

function goPolls(next = {}, replace = false) {
  setRoute("polls", { ...pollOptions(), ...next }, replace);
}

function bindPolls() {
  if (POLLS_BOUND) return;
  POLLS_BOUND = true;
  bindOnce(byId("poll-wp-filter"), "change", "polls", () => goPolls({ page: "" }));
  bindOnce(byId("poll-search"), "input", "polls", () => goPolls({ page: "" }, true));
  bindOnce(byId("poll-list"), "click", "polls", (event) => {
    const row = event.target.closest("[data-id]");
    if (row) goPolls({ id: row.dataset.id });
  });
}

export function updatePolls(payload) {
  const records = (payload || {}).records || {};
  POLLS = assignPollIds(records.polls || []);
  POLL_PERIODS = indexPeriods((payload || {}).index, POLLS);
  bindPolls();
  fillPeriods("poll-wp-filter", POLL_PERIODS);
}

function pollsFiltered() {
  const wp = byId("poll-wp-filter")?.value || "";
  const q = (byId("poll-search")?.value || "").trim().toLocaleLowerCase("de");
  return POLLS.filter((poll) => {
    if (wp && String(poll.period) !== wp) return false;
    if (!q) return true;
    return `${poll.period}/${poll.session} ${poll.kind || ""} ${poll.subject || ""}`
      .toLocaleLowerCase("de").includes(q);
  });
}

function pollSource(source) {
  const pdf = refUrl(source.file);
  const xml = source.xml_line ? xmlLink(source) : xmlFileLink(source.file);
  return `${pdf ? `<a href="${esc(pdf + (source.page ? `#page=${source.page}` : ""))}" target="_blank" rel="noopener">PDF${source.page ? ` S.${esc(source.page)}` : ""}</a>` : ""}`
    + `${xml ? ` <a href="${esc(xml.href)}" target="_blank" rel="noopener">${esc(xml.text)}</a>` : ""}`;
}

function pollRow(poll) {
  const tally = [`${poll.ja ?? "?"} Ja`, `${poll.nein ?? "?"} Nein`, `${poll.enthalten ?? "?"} Enth.`].join(" · ");
  return `<button class="row result-row" type="button" data-id="${esc(poll._id)}">`
    + `<div><div class="nm">WP ${esc(poll.period)} · Sitzung ${esc(poll.session)} ${esc(poll.kind || "")}</div>`
    + `<div class="sub">${esc(tally)}${poll.abgegeben != null ? ` · ${number(poll.abgegeben)} abgegeben` : ""}</div></div>`
    + `<span class="badge ${poll.validated ? "ok" : "no"}">${poll.validated ? "validiert" : "prüfen"}</span></button>`;
}

function showPoll(poll) {
  const host = byId("poll-detail");
  if (!host) return;
  const fields = [
    ["Ja", poll.ja], ["Nein", poll.nein], ["Enthalten", poll.enthalten],
    ["Ungültig", poll.ungueltig], ["Abgegeben", poll.abgegeben], ["Roster", poll.roster],
  ].filter(([, item]) => item !== null && item !== undefined)
    .map(([label, item]) => `<div class="detail-metric"><span>${esc(label)}</span><strong>${number(item)}</strong></div>`).join("");
  host.innerHTML = `<h3>WP ${esc(poll.period)} · Sitzung ${esc(poll.session)}</h3>`
    + `<p class="muted">${esc(poll.kind || "Namentliche Abstimmung")} · ${poll.validated ? "validiert" : "nicht validiert"}</p>`
    + `<div class="detail-metric-grid">${fields}</div>`
    + `<h4>Quelle</h4><p class="src">${esc(poll.file || "")} ${pollSource(poll)}</p>`
    + `<button id="poll-copy" type="button">Fix-Paket kopieren</button>`;
  host.querySelector("#poll-copy")?.addEventListener("click", (event) =>
    copyFixPacket("poll", { ...poll, sources: [poll] }, event.currentTarget));
}

function renderPolls(route) {
  const rows = pollsFiltered();
  const page = pageSlice(rows, route.params.get("page"), PAGE_SIZE);
  const chosen = route.id && rows.find((poll) => poll._id === route.id
    || `${poll.period}/${poll.session}` === route.id);
  const list = byId("poll-list");
  list.innerHTML = page.rows.map(pollRow).join("") || "<p class=\"muted\">Keine Abstimmungen für diese Auswahl.</p>";
  markSelected(list, chosen ? chosen._id : route.id);
  byId("poll-count").textContent = `${number(rows.length)} Abstimmungen`;
  renderPagination(byId("poll-pagination"), page.page, rows.length, PAGE_SIZE, (next) => {
    goPolls({ page: next });
    list.scrollTop = 0;
  });
  if (chosen) showPoll(chosen);
  else byId("poll-detail").innerHTML = "<p class=\"muted\">Eine Abstimmung auswählen, um Ergebnis, Quellen und ein Fix-Paket zu sehen.</p>";
}

export function routePollsView(route) {
  CURRENT_POLL = route;
  setValue(byId("poll-wp-filter"), route.params.get("wp") || "");
  setValue(byId("poll-search"), route.params.get("q") || "");
  renderPolls(route);
}

function interjectionOptions(id) {
  return {
    id,
    wp: byId("ij-wp-filter")?.value || "",
    type: byId("ij-type-filter")?.value || "",
    q: byId("ij-people-search")?.value.trim() || "",
    page: CURRENT_IJ?.params.get("page") || "",
  };
}

function goInterjections(next = {}, replace = false) {
  setRoute("interjections", { ...interjectionOptions(), ...next }, replace);
}

function fillTypes() {
  const select = byId("ij-type-filter");
  if (!select) return;
  const selected = select.value;
  select.innerHTML = `<option value="">Alle Typen</option>`
    + TYPES.map((item) => `<option value="${esc(item.type)}">${esc(item.type)} (${number(item.count)})</option>`).join("");
  if (selected && !TYPES.some((item) => item.type === selected)) {
    select.insertAdjacentHTML("beforeend", `<option value="${esc(selected)}">${esc(selected)} (wird geladen)</option>`);
  }
  select.value = selected;
}

function bindInterjections() {
  if (IJ_BOUND) return;
  IJ_BOUND = true;
  bindOnce(byId("ij-wp-filter"), "change", "interjections", () => goInterjections({ page: "" }));
  bindOnce(byId("ij-type-filter"), "change", "interjections", () => goInterjections({ page: "" }));
  bindOnce(byId("ij-people-search"), "input", "interjections", () => goInterjections({ page: "" }, true));
  bindOnce(byId("ij-types"), "click", "interjections", (event) => {
    const button = event.target.closest("[data-type]");
    if (!button) return;
    setValue(byId("ij-type-filter"), button.dataset.type || "");
    goInterjections({ type: button.dataset.type || "", page: "" });
  });
  bindOnce(byId("ij-people-list"), "click", "interjections", (event) => {
    const row = event.target.closest("[data-id]");
    if (row) goInterjections({ id: row.dataset.id });
  });
}

function normalizeTypeSamples(value) {
  if (!value || typeof value !== "object") return {};
  if (Array.isArray(value)) {
    return value.reduce((all, item) => {
      if (!item || !item.type) return all;
      const samples = item.samples || item.examples || [];
      if (Array.isArray(samples)) all[item.type] = samples;
      return all;
    }, {});
  }
  return Object.entries(value).reduce((all, [type, samples]) => {
    const rows = Array.isArray(samples) ? samples : (samples?.samples || samples?.examples || []);
    if (Array.isArray(rows)) all[type] = rows;
    return all;
  }, {});
}

function auditNumber(raw) {
  return raw === null || raw === undefined || raw === "" ? "–" : number(raw);
}


function auditStatus(value) {
  const raw = typeof value === "string" ? value : value?.status;
  return String(raw || "unknown");
}
function auditAvailability(value) {
  const status = auditStatus(value);
  const labels = {
    available: "vollständig",
    partial: "teilweise",
    unavailable: "nicht verfügbar",
    unknown: "unbekannt",
  };
  return '<span class="availability availability-' + esc(status) + '">' + esc(labels[status] || status) + "</span>";
}

function auditCoverageText(observed, total) {
  if (observed === null || observed === undefined || observed === "") return "nicht quantifiziert";
  if (total === null || total === undefined || total === "") return auditNumber(observed) + " Dateien";
  return auditNumber(observed) + " von " + auditNumber(total) + " Dateien";
}

function auditMetric(label, raw) {
  return '<div class="metric-card"><span class="metric-label">' + esc(label)
    + "</span><strong>" + auditNumber(raw) + "</strong></div>";
}

function renderInterjectionAudit() {
  const host = byId("ij-audit");
  if (!host) return;
  const audit = IJ_AUDIT || {};
  const coverage = audit.coverage || {};
  const normalization = audit.normalization || {};
  const normalizationCoverage = normalization.coverage || {};
  const parserFiles = coverage.enrichment_audit_files ?? coverage.audited_files;
  const normalizationFiles = normalizationCoverage.files ?? coverage.normalization_audit_files;
  const status = auditStatus(audit.availability);
  const explanation = {
    available: "Die Diagnose deckt alle publizierten strukturierten Dateien ab.",
    partial: "Die Diagnose deckt nur einen Teil der publizierten strukturierten Dateien ab; fehlende Werte werden nicht als null gelesen.",
    unavailable: "Für diese Datenversion liegt keine Erfassungsdiagnose vor.",
    unknown: "Der Abdeckungsstand der Erfassungsdiagnose ist nicht bekannt.",
  }[status] || "Der Abdeckungsstand der Erfassungsdiagnose ist nicht bekannt.";
  const parserCoverage = auditCoverageText(parserFiles, coverage.files);
  const normalizationCoverageText = auditCoverageText(normalizationFiles, coverage.files);
  host.innerHTML = '<div class="interjection-audit-head"><h3>Erfassungsdiagnostik '
    + auditAvailability(audit.availability) + '</h3><p class="muted">' + esc(explanation) + "</p></div>"
    + '<div class="metric-grid interjection-audit-grid">'
    + auditMetric("Rohblöcke", audit.source_records)
    + auditMetric("regelbasiert ignoriert", audit.ignored_records)
    + auditMetric("nach Regeln behalten", audit.retained_records)
    + auditMetric("ohne erzeugtes Ereignis", audit.records_without_events)
    + auditMetric("erzeugte Ereignisse", audit.events)
    + auditMetric('Parser-Fallback „other“', audit.events_kind_other)
    + auditMetric("bei Normalisierung entfernt", normalization.dropped_records)
    + auditMetric('normalisiert „sonstiges“', normalization.events_type_sonstiges)
    + "</div>"
    + '<p class="interjection-audit-meta">Parserdiagnose: ' + esc(parserCoverage)
    + " · Normalisierung: " + esc(normalizationCoverageText)
    + '. „other“ ist ein bewusster Parser-Fallback; „sonstiges“ der kanonische Typ nach der Normalisierung. Keiner der Werte bedeutet eine fehlende Klassifikation.</p>';
}

export function updateInterjections(payload) {
  const records = (payload || {}).records || {};
  IJ_AUDIT = records.interjection_audit || records.audit || null;
  TYPES = records.types || [];
  TYPE_SAMPLES = normalizeTypeSamples(records.type_samples);
  PEOPLE = records.people || [];
  IJ_PERIODS = indexPeriods((payload || {}).index, (records.polls || []).concat(
    PEOPLE.flatMap((person) => (person.samples || []).map((sample) => ({ period: sample.period }))),
  ));
  bindInterjections();
  renderInterjectionAudit();
  fillPeriods("ij-wp-filter", IJ_PERIODS);
  fillTypes();
}

function typedCount(item, type) {
  if (!type) return Number(item.count || 0);
  if (item.by_type && Object.prototype.hasOwnProperty.call(item.by_type, type)) return Number(item.by_type[type] || 0);
  return 0;
}

function peopleFiltered() {
  const wp = byId("ij-wp-filter")?.value || "";
  const type = byId("ij-type-filter")?.value || "";
  const q = (byId("ij-people-search")?.value || "").trim().toLocaleLowerCase("de");
  return PEOPLE.map((person) => ({ ...person, _count: typedCount(person, type) }))
    .filter((person) => {
      if (type && !person._count) return false;
      if (wp && person.period != null && String(person.period) !== wp) return false;
      if (wp && person.period == null && (person.samples || []).length
          && !(person.samples || []).some((sample) => String(sample.period) === wp)) return false;
      return !q || String(person.name || "").toLocaleLowerCase("de").includes(q);
    })
    .sort((a, b) => b._count - a._count || String(a.name).localeCompare(String(b.name), "de"));
}

function typeChips() {
  const total = TYPES.reduce((sum, item) => sum + Number(item.count || 0), 0) || 1;
  const selected = byId("ij-type-filter")?.value || "";
  byId("ij-types").innerHTML = `<button type="button" class="filter-chip${!selected ? " active" : ""}" data-type="">Alle <strong>${number(total)}</strong></button>`
    + TYPES.map((item) => `<button type="button" class="filter-chip${selected === item.type ? " active" : ""}" data-type="${esc(item.type)}">`
      + `${esc(item.type)} <strong>${number(item.count)}</strong></button>`).join("");
}

function sampleHtml(sample) {
  const pdf = refUrl(sample.file);
  const xml = sample.xml_line ? xmlLink(sample) : xmlFileLink(sample.file);
  return `<article class="ij-sample"><div class="ij-sample-raw">${esc(sample.raw || sample.text || "")}</div>`
    + `<div class="sub"><span class="badge cat-furniture">${esc(sample.type || sample.kind || "")}</span> WP ${esc(sample.period)}${sample.session ? `/${esc(sample.session)}` : ""}`
    + `${sample.target ? ` · an ${esc(sample.target)}` : ""}`
    + `${pdf ? ` <a href="${esc(pdf + (sample.page ? `#page=${sample.page}` : ""))}" target="_blank" rel="noopener">PDF</a>` : ""}`
    + `${xml ? ` <a href="${esc(xml.href)}" target="_blank" rel="noopener">${esc(xml.text)}</a>` : ""}</div></article>`;
}

function renderTypeExamples() {
  const host = byId("ij-type-examples");
  if (!host) return;
  const selectedType = byId("ij-type-filter")?.value || "";
  if (!selectedType) {
    host.hidden = true;
    host.innerHTML = "";
    return;
  }
  const samples = TYPE_SAMPLES[selectedType] || [];
  host.hidden = false;
  host.innerHTML = `<h3>Beispiele zum Typ ${esc(selectedType)}</h3>`
    + `<p class="muted">Diese Beispiele zeigen den Zwischenruf-Typ insgesamt. Sie beziehen sich nicht notwendigerweise auf die rechts ausgewählte Person.</p>`
    + `<div class="ij-type-sample-list">${samples.map(sampleHtml).join("") || `<p class="muted">Für diesen Typ sind noch keine gespeicherten Beispiele vorhanden.</p>`}</div>`;
}

function showPerson(person) {
  const host = byId("ij-people-detail");
  if (!host) return;
  const selectedType = byId("ij-type-filter")?.value || "";
  const samples = (person.samples || []).filter((sample) => !selectedType || sample.type === selectedType || sample.kind === selectedType);
  host.innerHTML = `<h3>${esc(person.name || "")}</h3>`
    + `<p class="muted">${number(person._count)} Zwischenrufe${selectedType ? ` vom Typ ${esc(selectedType)}` : ""}</p>`
    + `<h4>Beispiele</h4>${samples.map(sampleHtml).join("") || "<p class=\"muted\">Für diese Auswahl sind keine gespeicherten Beispiele vorhanden.</p>"}`
    + `<button id="ij-copy" type="button">Fix-Paket kopieren</button>`;
  host.querySelector("#ij-copy")?.addEventListener("click", (event) =>
    copyFixPacket("interjection_person", {
      ...person,
      entity_id: "interjection:" + (person.period || "all") + ":" + (person.name || ""),
      type_filter: selectedType || null,
      source_count: Number(person._count || 0),
      sources_sampled: true,
      source_note: "gespeicherte Beispielquellen, keine vollständige Ereignisprovenienz",
      sources: samples,
    }, event.currentTarget));
}


function renderInterjections(route) {
  typeChips();
  renderTypeExamples();
  const rows = peopleFiltered();
  const page = pageSlice(rows, route.params.get("page"), PAGE_SIZE);
  const list = byId("ij-people-list");
  list.innerHTML = page.rows.map((person) =>
    `<button class="row result-row" type="button" data-id="${esc(person.name)}"><span class="nm">${esc(person.name)}</span><span class="cnt">${number(person._count)}</span></button>`
  ).join("") || "<p class=\"muted\">Keine Personen für diese Auswahl.</p>";
  markSelected(list, route.id);
  byId("ij-people-count").textContent = `${number(rows.length)} Personen`;
  renderPagination(byId("ij-pagination"), page.page, rows.length, PAGE_SIZE, (next) => {
    goInterjections({ page: next });
    list.scrollTop = 0;
  });
  const selected = route.id && rows.find((person) => person.name === route.id);
  if (selected) showPerson(selected);
  else byId("ij-people-detail").innerHTML = "<p class=\"muted\">Eine Person auswählen, um Beispiele, Quellen und ein Fix-Paket zu sehen.</p>";
}

export function routeInterjectionsView(route) {
  CURRENT_IJ = route;
  setValue(byId("ij-wp-filter"), route.params.get("wp") || "");
  setValue(byId("ij-type-filter"), route.params.get("type") || "");
  setValue(byId("ij-people-search"), route.params.get("q") || "");
  renderInterjections(route);
}

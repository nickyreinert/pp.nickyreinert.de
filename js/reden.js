import { refUrl, xmlFileLink, xmlLink } from "./data.js";
import { copyFixPacket } from "./fixpacket.js";
import { setRoute } from "./router.js";
import {
  bindOnce, byId, esc, markSelected, number, pageSlice,
  renderPagination, setValue, sortedPeriods,
} from "./tabutils.js";

const PAGE_SIZE = 100;
let GROUPS = [];
let LINES = [];
let PERIODS = [];
let CURRENT = null;
let INITIALIZED = false;

// Keep readable labels beside the stable export class codes. Canonical
// descriptions are retained from unresolved.json when that complete payload is
// first loaded; the fallback keeps period shards understandable on their own.
const UNRESOLVED_GROUP_FALLBACKS = Object.freeze({
  A: "Amts- oder Sitzungsleitungsrolle im Rohtext",
  A2: "kein Kandidat im Personenbestand",
  B: "genau ein Kandidat, aber Zuordnung abgelehnt",
  C: "mehrere in der Wahlperiode mögliche Kandidaten",
  X: "leerer Nachname oder Textrest nach Normalisierung",
});
let unresolvedGroupExplanations = { ...UNRESOLVED_GROUP_FALLBACKS };

const UNASSIGNED_GROUP_EXPLANATIONS = Object.freeze({
  other: "mögliche Regel- oder Erfassungslücke",
  ocr_junk: "OCR- oder Satzartefakt",
  toc: "Tagesordnungs- oder Registertext",
  furniture: "Kopfzeile, Sitzungsregie oder anderes Protokollbeiwerk",
  unknown: "nicht näher klassifiziert",
});

function retainUnresolvedGroupExplanations(unresolved) {
  for (const [name, metrics] of Object.entries((unresolved || {}).by_class || {})) {
    if (typeof metrics?.description === "string" && metrics.description) {
      unresolvedGroupExplanations[name] = metrics.description;
    }
  }
}

function unresolvedId(item) {
  return `u:${item.period || "?"}:${item.surname || ""}:${item.class || ""}`;
}

function lineId(item) {
  return `l:${item.period || "?"}:${item.file || ""}:${item.line ?? "?"}`;
}

function knownPeriods(payload) {
  const values = [];
  for (const index of Object.values((payload || {}).indexes || {})) {
    for (const entry of (index || {}).periods || []) values.push(entry.period || entry.key);
  }
  return [...new Set([...values.map(String), ...sortedPeriods([...GROUPS, ...LINES])])]
    .filter(Boolean)
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b, "de"));
}

function fillPeriods() {
  const select = byId("reden-wp-filter");
  if (!select) return;
  const selected = select.value;
  select.innerHTML = `<option value="">Alle Wahlperioden</option>`
    + PERIODS.map((wp) => `<option value="${esc(wp)}">WP ${esc(wp)}</option>`).join("");
  if (selected && !PERIODS.includes(selected)) {
    select.insertAdjacentHTML("beforeend", `<option value="${esc(selected)}">WP ${esc(selected)} (wird geladen)</option>`);
  }
  select.value = selected;
}

function fillCategories(mode) {
  const select = byId("reden-category");
  if (!select) return;
  const selected = select.value;
  const values = mode === "unassigned"
    ? [...new Set(LINES.map((item) => item.category || "unknown"))]
    : [...new Set(GROUPS.map((item) => item.class || "unknown"))];
  values.sort((a, b) => a.localeCompare(b, "de"));
  select.innerHTML = `<option value="">Alle ${mode === "unassigned" ? "Kategorien" : "Klassen"}</option>`
    + values.map((item) => `<option value="${esc(item)}">${esc(item)}</option>`).join("");
  if (selected && !values.includes(selected)) {
    select.insertAdjacentHTML("beforeend", `<option value="${esc(selected)}">${esc(selected)} (nicht in dieser WP)</option>`);
  }
  select.value = selected;
}

function routeOptions(id) {
  return {
    id,
    mode: byId("reden-mode")?.value || "unresolved",
    wp: byId("reden-wp-filter")?.value || "",
    category: byId("reden-category")?.value || "",
    q: byId("reden-search")?.value.trim() || "",
    page: CURRENT && CURRENT.params.get("page") || "",
  };
}

function navigate(options = {}, replace = false) {
  setRoute("reden", { ...routeOptions(), ...options }, replace);
}

function bind() {
  if (INITIALIZED) return;
  INITIALIZED = true;
  bindOnce(byId("reden-mode"), "change", "reden", () => {
    fillCategories(byId("reden-mode").value);
    navigate({ category: "", page: "" });
  });
  bindOnce(byId("reden-wp-filter"), "change", "reden", () => navigate({ page: "" }));
  bindOnce(byId("reden-category"), "change", "reden", () => navigate({ page: "" }));
  bindOnce(byId("reden-search"), "input", "reden", () => navigate({ page: "" }, true));
  bindOnce(byId("reden-groups"), "click", "reden", (event) => {
    const button = event.target.closest("button[data-category]");
    if (!button) return;
    const select = byId("reden-category");
    if (select) select.value = button.dataset.category;
    navigate({ category: button.dataset.category, page: "" });
  });
  bindOnce(byId("reden-list"), "click", "reden", (event) => {
    const row = event.target.closest("[data-id]");
    if (!row) return;
    navigate({ id: row.dataset.id });
  });
}

export function updateReden(payload) {
  const unresolved = (payload || {}).unresolved || {};
  retainUnresolvedGroupExplanations(unresolved);
  GROUPS = unresolved.groups || [];
  LINES = ((payload || {}).unassigned || {}).lines || [];
  PERIODS = knownPeriods(payload);
  bind();
  fillPeriods();
}

function filtered(mode) {
  const wp = byId("reden-wp-filter")?.value || "";
  const category = byId("reden-category")?.value || "";
  const q = (byId("reden-search")?.value || "").trim().toLocaleLowerCase("de");
  const rows = mode === "unassigned" ? LINES : GROUPS;
  return rows.filter((item) => {
    if (wp && String(item.period) !== wp) return false;
    if (category && String(mode === "unassigned" ? item.category : item.class) !== category) return false;
    if (!q) return true;
    const haystack = mode === "unassigned"
      ? `${item.text || ""} ${item.file || ""} ${item.category || ""}`
      : `${item.surname || ""} ${(item.top_raws || []).map((raw) => raw.raw).join(" ")} ${item.class || ""}`;
    return haystack.toLocaleLowerCase("de").includes(q);
  });
}

function chips(mode) {
  const host = byId("reden-groups");
  if (!host) return;
  const rows = mode === "unassigned" ? LINES : GROUPS;
  const field = mode === "unassigned" ? "category" : "class";
  const selected = byId("reden-category")?.value || "";
  const explanations = mode === "unassigned"
    ? UNASSIGNED_GROUP_EXPLANATIONS
    : unresolvedGroupExplanations;
  const labels = Object.entries(rows.reduce((totals, row) => {
    const key = row[field] || "unknown";
    totals[key] = (totals[key] || 0) + (mode === "unassigned" ? 1 : Number(row.n || 0));
    return totals;
  }, {})).sort(([a], [b]) => a.localeCompare(b, "de"));
  host.innerHTML = labels.map(([name, count]) => {
    const explanation = explanations[name] || "nicht näher klassifiziert";
    return `<button type="button" class="filter-chip${selected === name ? " active" : ""}" data-category="${esc(name)}" title="${esc(explanation)}">`
      + `<strong>${esc(name)}</strong> · ${esc(explanation)} <span aria-label="${number(count)} Einträge">${number(count)}</span></button>`;
  }).join("") || `<span class="muted">Keine Fehlergruppen in dieser Auswahl.</span>`;
}

function rowHtml(item, mode) {
  if (mode === "unassigned") {
    return `<button class="row result-row" type="button" data-id="${esc(lineId(item))}">`
      + `<div><div class="nm">${esc(item.text || "(leere Zeile)")}</div>`
      + `<div class="sub">WP ${esc(item.period)} · ${esc(item.file || "")}${item.line != null ? `:${esc(item.line)}` : ""}</div></div>`
      + `<span class="badge cat-${esc(item.category || "unknown")}">${esc(item.category || "unknown")}</span></button>`;
  }
  const raws = (item.top_raws || []).map((raw) => raw.raw).filter(Boolean).join(" · ");
  return `<button class="row result-row" type="button" data-id="${esc(unresolvedId(item))}">`
    + `<div><div class="nm">${esc(item.surname || "(ohne Nachname)")}</div>`
    + `<div class="sub">WP ${esc(item.period)} · ${esc(raws)}</div></div>`
    + `<span class="badge cat-${esc(item.class || "unknown")}">${esc(item.class || "?")} · ${number(item.n || 0)}</span></button>`;
}

function sourceHtml(source) {
  const pdf = refUrl(source.file);
  const xml = source.xml_line ? xmlLink(source) : xmlFileLink(source.file);
  return `<div class="src">${esc(source.file || "Quelle unbekannt")}${source.line != null ? `:${esc(source.line)}` : ""}`
    + `${pdf ? ` <a href="${esc(pdf + (source.page ? `#page=${source.page}` : ""))}" target="_blank" rel="noopener">PDF${source.page ? ` S.${esc(source.page)}` : ""}</a>` : ""}`
    + `${xml ? ` <a href="${esc(xml.href)}" target="_blank" rel="noopener">${esc(xml.text)}</a>` : ""}</div>`;
}

function showUnresolved(item) {
  const host = byId("reden-detail");
  if (!host) return;
  const candidates = (item.candidates || []).map((candidate) =>
    `<li><code>${esc(candidate.id || "?")}</code> ${esc(candidate.name || "")} ${candidate.party ? `· ${esc(candidate.party)}` : ""}</li>`
  ).join("") || "<li>Keine Kandidaten im Personenindex.</li>";
  const sources = (item.sources || []).map(sourceHtml).join("") || "<p class=\"muted\">Keine Quellzeile gespeichert.</p>";
  host.innerHTML = `<h3>${esc(item.surname || "Offene Zuordnung")}</h3>`
    + `<p class="muted">WP ${esc(item.period)} · Klasse ${esc(item.class || "?")} · ${number(item.n || 0)} Redebeiträge</p>`
    + `<h4>Rohvarianten</h4><p>${esc((item.top_raws || []).map((raw) => `${raw.raw} (${raw.count})`).join(" · ") || "–")}</p>`
    + `<h4>Erste Textstellen</h4>${(item.first_lines || []).map((line) => `<p class="quote">${esc(line)}</p>`).join("") || "<p class=\"muted\">Keine Textstelle gespeichert.</p>"}`
    + `<h4>Kandidaten</h4><ul>${candidates}</ul><h4>Quellen</h4>${sources}`
    + `<button id="reden-copy" type="button">Fix-Paket kopieren</button>`;
  host.querySelector("#reden-copy")?.addEventListener("click", (event) =>
    copyFixPacket("unresolved_group", {
      ...item,
      entity_id: unresolvedId(item),
      source_count: Number(item.n || 0),
      sources_sampled: (item.sources || []).length < Number(item.n || 0),
      source_note: "veröffentlichte Belegstellen; bei großen Gruppen eine repräsentative Stichprobe",
    }, event.currentTarget));
}

function showLine(item) {
  const host = byId("reden-detail");
  if (!host) return;
  const source = { file: item.file, line: item.line };
  host.innerHTML = `<h3>Unzugeordnete Textzeile</h3><p class="muted">WP ${esc(item.period)} · Kategorie ${esc(item.category || "unknown")}</p>`
    + `<blockquote>${esc(item.text || "")}</blockquote><h4>Quelle</h4>${sourceHtml(source)}`
    + `<button id="reden-copy" type="button">Fix-Paket kopieren</button>`;
  host.querySelector("#reden-copy")?.addEventListener("click", (event) =>
    copyFixPacket("unassigned_line", { ...item, sources: [source] }, event.currentTarget));
}

function render(route) {
  const mode = byId("reden-mode")?.value || "unresolved";
  chips(mode);
  const rows = filtered(mode);
  const page = pageSlice(rows, route.params.get("page"), PAGE_SIZE);
  const list = byId("reden-list");
  if (list) {
    list.innerHTML = page.rows.map((item) => rowHtml(item, mode)).join("")
      || "<p class=\"muted\">Keine Ergebnisse für diese Auswahl.</p>";
    markSelected(list, route.id);
  }
  const count = byId("reden-count");
  if (count) count.textContent = `${number(rows.length)} ${mode === "unassigned" ? "Zeilen" : "Gruppen"}`;
  renderPagination(byId("reden-pagination"), page.page, rows.length, PAGE_SIZE, (next) => {
    navigate({ page: next });
    if (list) list.scrollTop = 0;
  });
  const chosen = route.id && rows.find((item) => (mode === "unassigned" ? lineId(item) : unresolvedId(item)) === route.id);
  if (chosen) {
    if (mode === "unassigned") showLine(chosen);
    else showUnresolved(chosen);
  } else if (byId("reden-detail")) {
    byId("reden-detail").innerHTML = "<p class=\"muted\">Ein Ergebnis auswählen, um Quellen und ein Fix-Paket zu sehen.</p>";
  }
}

export function routeReden(route) {
  CURRENT = route;
  const mode = route.params.get("mode") === "unassigned" ? "unassigned" : "unresolved";
  setValue(byId("reden-mode"), mode);
  fillCategories(mode);
  setValue(byId("reden-wp-filter"), route.params.get("wp") || "");
  setValue(byId("reden-category"), route.params.get("category") || "");
  setValue(byId("reden-search"), route.params.get("q") || "");
  render(route);
}

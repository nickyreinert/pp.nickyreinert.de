// Compact party browser.  It consumes the statistics aggregate so opening the
// tab does not download the speaker index just to list recognized parties.

import { setRoute } from "./router.js";
import { bindOnce, byId, esc, number, setValue } from "./tabutils.js";

let STATS = { by_party: [], by_party_period: [], by_period: [] };
let INITIALIZED = false;

function periodEntries() {
  const entries = STATS.by_party_period || [];
  if (entries.length) return entries;
  // Legacy exports did not retain party names per Wahlperiode. Keep their
  // global aggregate useful while making the limitation explicit in the UI.
  return [];
}

function periods() {
  const fromPartyStats = periodEntries().map((item) => item.period);
  const fromStats = (STATS.by_period || []).map((item) => item.period);
  return [...new Set([...fromPartyStats, ...fromStats].map(String).filter(Boolean))]
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b, "de"));
}

function fillPeriods() {
  const select = byId("party-wp-filter");
  if (!select) return;
  const current = select.value;
  const values = periods();
  select.innerHTML = '<option value="">Alle Wahlperioden</option>'
    + values.map((wp) => `<option value="${esc(wp)}">WP ${esc(wp)}</option>`).join("");
  if (current && !values.includes(current)) {
    select.insertAdjacentHTML("beforeend", `<option value="${esc(current)}">WP ${esc(current)} (nicht verfügbar)</option>`);
  }
  select.value = current;
}

function options() {
  return {
    wp: byId("party-wp-filter")?.value || "",
    q: byId("party-search")?.value.trim() || "",
  };
}

function navigate(next = {}, replace = false) {
  setRoute("parties", { ...options(), ...next }, replace);
}

function bind() {
  if (INITIALIZED) return;
  INITIALIZED = true;
  bindOnce(byId("party-wp-filter"), "change", "parties", () => navigate());
  bindOnce(byId("party-search"), "input", "parties", () => navigate({}, true));
}

export function updateParties(stats) {
  STATS = stats && typeof stats === "object" ? stats : STATS;
  bind();
  fillPeriods();
}

function rowsForPeriod(wp) {
  if (!wp) return STATS.by_party || [];
  const entry = periodEntries().find((item) => String(item.period) === String(wp));
  return entry ? entry.parties || [] : [];
}

function rowHtml(item) {
  return `<div class="row party-row"><div><div class="nm">${esc(item.party)}</div>`
    + `<div class="sub">erkannt in Redebeiträgen</div></div>`
    + `<div class="cnt">${number(item.speeches)} Redebeiträge</div></div>`;
}

function render() {
  const wp = byId("party-wp-filter")?.value || "";
  const q = (byId("party-search")?.value || "").trim().toLocaleLowerCase("de");
  const rows = rowsForPeriod(wp).filter((item) =>
    !q || String(item.party || "").toLocaleLowerCase("de").includes(q));
  const host = byId("party-list");
  const count = byId("party-count");
  if (count) count.textContent = `${number(rows.length)} Parteien`;
  if (!host) return;
  if (rows.length) {
    host.innerHTML = rows.map(rowHtml).join("");
    return;
  }
  if (wp && !periodEntries().length) {
    host.innerHTML = '<p class="muted">Dieser ältere Datenexport enthält die Parteien nur insgesamt. Nach dem nächsten Webdaten-Build ist die Aufschlüsselung je Wahlperiode verfügbar.</p>';
    return;
  }
  host.innerHTML = '<p class="muted">Keine erkannte Partei für diese Auswahl.</p>';
}

export function routeParties(route) {
  setValue(byId("party-wp-filter"), route.params.get("wp") || "");
  setValue(byId("party-search"), route.params.get("q") || "");
  render();
}

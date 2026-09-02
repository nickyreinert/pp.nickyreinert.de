import { copyFixPacket } from "./fixpacket.js";
import { setRoute } from "./router.js";
import {
  bindOnce, byId, esc, markSelected, number, pageSlice,
  renderPagination, setValue,
} from "./tabutils.js";

const PAGE_SIZE = 60;
let INDEX = { periods: [] };
let SESSIONS = [];
let CURRENT = null;
let INITIALIZED = false;

function sessionId(session) {
  return `${session.period}/${session.session}`;
}

function periodFromId(id) {
  const match = String(id || "").match(/^(\d+)\//);
  return match ? match[1] : "";
}

function periods() {
  return (INDEX.periods || []).map((entry) => String(entry.period || entry.key))
    .filter(Boolean)
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b, "de"));
}

function fillPeriods() {
  const select = byId("toc-wp-filter");
  if (!select) return;
  const selected = select.value;
  select.innerHTML = `<option value="">Wahlperiode wählen / alle Gruppen</option>`
    + periods().map((wp) => `<option value="${esc(wp)}">WP ${esc(wp)}</option>`).join("");
  if (selected && !periods().includes(selected)) {
    select.insertAdjacentHTML("beforeend", `<option value="${esc(selected)}">WP ${esc(selected)} (wird geladen)</option>`);
  }
  select.value = selected;
}

function options(id) {
  return {
    id,
    wp: byId("toc-wp-filter")?.value || "",
    q: byId("toc-search")?.value.trim() || "",
    page: CURRENT?.params.get("page") || "",
  };
}

function navigate(next = {}, replace = false) {
  setRoute("toc", { ...options(), ...next }, replace);
}

function bind() {
  if (INITIALIZED) return;
  INITIALIZED = true;
  bindOnce(byId("toc-wp-filter"), "change", "agenda", () => navigate({ page: "" }));
  bindOnce(byId("toc-search"), "input", "agenda", () => navigate({ page: "" }, true));
  bindOnce(byId("toc-list"), "click", "agenda", (event) => {
    const periodButton = event.target.closest("[data-period]");
    if (periodButton) {
      setRoute("toc", { wp: periodButton.dataset.period, q: "" });
      return;
    }
    const row = event.target.closest("[data-id]");
    if (row) navigate({ id: row.dataset.id });
  });
}

export function updateAgenda(payload) {
  INDEX = (payload || {}).index || { periods: [] };
  SESSIONS = (payload || {}).records || [];
  bind();
  fillPeriods();
}

function filtered(wp) {
  const q = (byId("toc-search")?.value || "").trim().toLocaleLowerCase("de");
  return SESSIONS.filter((session) => {
    if (wp && String(session.period) !== wp) return false;
    if (!q) return true;
    const haystack = [
      session.session, session.dokumentnummer, session.date,
      ...(session.tops || []).flatMap((top) => [
        top.title || top.type || "",
        ...(top.speakers || []).map((speaker) => speaker.name || ""),
      ]),
    ].join(" ").toLocaleLowerCase("de");
    return haystack.includes(q);
  });
}

function groupsHtml() {
  return (INDEX.periods || []).map((entry) => {
    const wp = String(entry.period || entry.key);
    const count = entry.sessions ?? entry.records ?? 0;
    return `<button type="button" class="tree-period" data-period="${esc(wp)}">`
      + `<strong>Wahlperiode ${esc(wp)}</strong><span>${number(count)} Sitzungen</span><span aria-hidden="true">→</span></button>`;
  }).join("") || "<p class=\"muted\">Kein Tagesordnungsindex gefunden.</p>";
}

function sessionRow(session) {
  const tops = (session.tops || []).slice(0, 4).map((top) =>
    `<li>${esc(top.title || top.type || "Tagesordnungspunkt")}</li>`).join("");
  const remaining = Math.max(0, Number(session.top_count || (session.tops || []).length) - 4);
  const source = session.source === "parsed" ? "aus Protokoll" : "offizielle Quelle";
  return `<button class="tree-session row result-row" type="button" data-id="${esc(sessionId(session))}">`
    + `<div><div class="nm">WP ${esc(session.period)} · Sitzung ${esc(session.session)}</div>`
    + `<div class="sub">${esc(source)} · ${number(session.top_count || (session.tops || []).length)} TOPs</div>`
    + (tops ? `<ul class="tree-children">${tops}${remaining ? `<li>+ ${number(remaining)} weitere TOPs</li>` : ""}</ul>` : "") + `</div>`
    + `<span aria-hidden="true">→</span></button>`;
}

function sourceLink(url, label = "Quelle") {
  return url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>` : "";
}

function topHtml(top) {
  const speakers = (top.speakers || []).map((speaker) => {
    const name = [speaker.name, speaker.party].filter(Boolean).join(" · ");
    return `<li>${sourceLink(speaker.pdf_url, name || "Sprecher:In")}${speaker.page ? ` <span class="muted">S. ${esc(speaker.page)}</span>` : ""}</li>`;
  }).join("");
  return `<article class="toc-detail-top"><h4>${sourceLink(top.pdf_url, top.title || top.type || "Tagesordnungspunkt")}</h4>`
    + `${top.type ? `<p class="muted">${esc(top.type)}</p>` : ""}`
    + (speakers ? `<ul>${speakers}</ul>` : "<p class=\"muted\">Keine Rednerliste überliefert.</p>") + `</article>`;
}

function showDetail(session) {
  const host = byId("toc-detail");
  if (!host) return;
  const sourceLabel = session.source === "parsed" ? "Aus dem Protokoll extrahiert" : "Offizielle Tagesordnung";
  const url = session.pdf_url || (session.tops || []).find((top) => top.pdf_url)?.pdf_url;
  const summary = (session.tops || []).map((top) => top.title || top.type).filter(Boolean).join(" | ").slice(0, 3000);
  host.innerHTML = `<h3>WP ${esc(session.period)} · Sitzung ${esc(session.session)}</h3>`
    + `<p class="muted">${esc(sourceLabel)}${session.date ? ` · ${esc(session.date)}` : ""}${session.dokumentnummer ? ` · ${esc(session.dokumentnummer)}` : ""}</p>`
    + `<p class="src">${sourceLink(url, "Quell-PDF öffnen")}</p>`
    + `<div class="toc-detail-tops">${(session.tops || []).map(topHtml).join("") || "<p class=\"muted\">Keine TOPs gespeichert.</p>"}</div>`
    + `<button id="toc-copy" type="button">Fix-Paket kopieren</button>`;
  host.querySelector("#toc-copy")?.addEventListener("click", (event) => {
    copyFixPacket("toc_session", {
      period: session.period,
      session: session.session,
      source: session.source,
      dokumentnummer: session.dokumentnummer,
      summary,
      sources: url ? [{ url, label: "Tagesordnungs-PDF" }] : [],
    }, event.currentTarget);
  });
}

function render(route) {
  const effectiveWp = route.params.get("wp") || periodFromId(route.id);
  if (!effectiveWp) {
    byId("toc-list").innerHTML = groupsHtml();
    byId("toc-count").textContent = `${number((INDEX.periods || []).length)} Wahlperioden – eine wählen, um die Sitzungen zu laden.`;
    byId("toc-pagination").innerHTML = "";
    byId("toc-detail").innerHTML = "<p class=\"muted\">Eine Wahlperiode und anschließend eine Sitzung auswählen, um den vollständigen Tagesordnungstext zu sehen.</p>";
    return;
  }
  setValue(byId("toc-wp-filter"), effectiveWp);
  const rows = filtered(effectiveWp);
  const page = pageSlice(rows, route.params.get("page"), PAGE_SIZE);
  const list = byId("toc-list");
  list.innerHTML = page.rows.map(sessionRow).join("") || "<p class=\"muted\">Keine Sitzung für diese Auswahl.</p>";
  markSelected(list, route.id);
  byId("toc-count").textContent = `${number(rows.length)} Sitzungen in WP ${effectiveWp}`;
  renderPagination(byId("toc-pagination"), page.page, rows.length, PAGE_SIZE, (next) => {
    navigate({ page: next, wp: effectiveWp });
    list.scrollTop = 0;
  });
  const selected = route.id && rows.find((session) => sessionId(session) === route.id);
  if (selected) showDetail(selected);
  else byId("toc-detail").innerHTML = "<p class=\"muted\">Eine Sitzung auswählen, um die Tagesordnung rechts zu sehen.</p>";
}

export function routeAgenda(route) {
  CURRENT = route;
  const effectiveWp = route.params.get("wp") || periodFromId(route.id);
  setValue(byId("toc-wp-filter"), effectiveWp);
  setValue(byId("toc-search"), route.params.get("q") || "");
  render(route);
}

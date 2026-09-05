// Speaker tab: searchable/filterable list + detail with sources and report,
// per-Wahlperiode filter, and checkbox selection for manual-correction export.

import { normalizeXmlSource, refUrl, xmlLink } from "./data.js";
import { isSelected, toggle } from "./selection.js";
import { setRoute } from "./router.js";
import { copyFixPacket } from "./fixpacket.js";

let ALL = [];
let PAGE = 0;
const PAGE_SIZE = 100;
let CURRENT = null;

// Stable id for an entry (matches the backend speaker key).
export function speakerId(s) {
  return s.person_id ? String(s.person_id) : "u:" + s.raw + "|" + (s.periods || []).join(",");
}

// Card metadata for the 3-state overview (label + css class + meta key).
const STATE_CARDS = [
  { state: "identified", label: "Identifiziert", cls: "ok",
    desc: "Eindeutige person_id zugeordnet." },
  { state: "review", label: "Pruefen", cls: "no",
    desc: "Ohne person_id, aber Kandidat:In oder Rolle vorhanden - prüfbar." },
  { state: "missing", label: "Fehlend", cls: "miss",
    desc: "Ohne person_id und ohne Kandidat:In - Gast, Beamte:r oder Schrott." },
];

const STATE_VALUES = new Set(STATE_CARDS.map((card) => card.state));

function normalizedState(value) {
  return STATE_VALUES.has(value) ? value : "";
}

function routePage(value) {
  const page = Number(value);
  return Number.isInteger(page) && page >= 0 ? page : 0;
}

function xmlSourceMode() {
  return normalizeXmlSource((document.getElementById("xml-source") || {}).value);
}

// Keep all speaker-view state in the hash. A selected row must not silently
// drop the active identity filter, pagination page, or source-link preference.
function speakerRouteOptions(id = (CURRENT && CURRENT.id) || "") {
  return {
    id,
    q: document.getElementById("search").value.trim(),
    wp: (document.getElementById("wp-filter") || {}).value || "",
    state: normalizedState((document.getElementById("state-filter") || {}).value || ""),
    page: PAGE,
    xml: xmlSourceMode(),
  };
}

function navigate(next = {}, replace = false) {
  const hasId = Object.prototype.hasOwnProperty.call(next, "id");
  const id = hasId ? next.id : (CURRENT && CURRENT.id) || "";
  setRoute("speakers", { ...speakerRouteOptions(id), ...next }, replace);
}

function canonicalizeRoute(route, state, xml) {
  const invalidState = route.params.has("state") && route.params.get("state") !== state;
  const invalidXml = route.params.has("xml") && route.params.get("xml") !== xml;
  if (!invalidState && !invalidXml) return false;
  const params = new URLSearchParams(route.params);
  if (invalidState) {
    if (state) params.set("state", state);
    else params.delete("state");
  }
  if (invalidXml) params.set("xml", xml);
  setRoute("speakers", { id: route.id, params }, true);
  return true;
}

export function initSpeakers(speakers, meta) {
  ALL = speakers;
  renderStateCards((meta && meta.speaker_states) || {});
  // Filters update the URL (replace, no history spam). Rendering is delegated
  // to the router so reload/back/forward use exactly the same state path.
  document.getElementById("search").addEventListener("input", () => navigate({ id: "", page: "" }, true));
  const st = document.getElementById("state-filter");
  if (st) st.addEventListener("change", () => navigate({ id: "", page: "" }, true));
  const wp = document.getElementById("wp-filter");
  if (wp) { fillWpFilter(wp); wp.addEventListener("change", () => navigate({ id: "", page: "" }, true)); }
  const xml = document.getElementById("xml-source");
  if (xml) xml.addEventListener("change", () => {
    const mode = normalizeXmlSource(xml.value);
    if (xml.value !== mode) xml.value = mode;
    navigate({ xml: mode }, true);
  });
  render();
}

// Three clickable summary cards; a click sets the state filter and re-renders.
function renderStateCards(totals) {
  const host = document.getElementById("speaker-states");
  if (!host) return;
  host.innerHTML = STATE_CARDS.map((c) => {
    const n = (totals[c.state] || 0).toLocaleString("de");
    return `<button class="ur-card" data-state="${c.state}">`
      + `<div class="ur-card-h"><span class="badge ${c.cls}">${c.label}</span>`
      + `<span class="ur-card-n">${n}</span></div>`
      + `<div class="ur-card-d">${c.desc}</div></button>`;
  }).join("");
  host.querySelectorAll(".ur-card").forEach((el) => {
    el.addEventListener("click", () => {
      const sel = document.getElementById("state-filter");
      if (sel) { sel.value = el.dataset.state; navigate({ id: "", page: "" }, true); }
    });
  });
}

// Restore filters + optional selected speaker from a parsed route. Every
// scalar in the speaker view lives in the URL (#speakers/<id>?q&wp&state&page&xml).
export function routeSpeakers(route) {
  CURRENT = route;
  const q = route.params.get("q") || "";
  const wp = route.params.get("wp") || "";
  const state = normalizedState(route.params.get("state") || "");
  const xml = normalizeXmlSource(route.params.get("xml"));
  const search = document.getElementById("search");
  const wpSel = document.getElementById("wp-filter");
  const stSel = document.getElementById("state-filter");
  const xmlSel = document.getElementById("xml-source");
  if (search && search.value !== q) search.value = q;
  if (wpSel && wpSel.value !== wp) wpSel.value = wp;
  if (stSel && stSel.value !== state) stSel.value = state;
  if (xmlSel && xmlSel.value !== xml) xmlSel.value = xml;
  if (canonicalizeRoute(route, state, xml)) return;

  PAGE = routePage(route.params.get("page"));
  // Old deep links without a page still make the selected speaker visible.
  // New links always retain the exact current page through `navigate`.
  if (route.id && !route.params.has("page")) {
    const row = filtered().findIndex((speaker) => speakerId(speaker) === route.id);
    if (row >= 0) PAGE = Math.floor(row / PAGE_SIZE);
  }
  render();
  const speaker = route.id && ALL.find((item) => speakerId(item) === route.id);
  if (speaker) showDetail(speaker);
  else clearDetail();
}

// Exposed so "selection clear" can refresh the checkboxes.
export function rerenderSpeakers() { render(); }

function fillWpFilter(sel) {
  const wps = [...new Set(ALL.flatMap((s) => s.periods || []))].sort((a, b) => +a - +b);
  sel.innerHTML = '<option value="">Alle WP</option>'
    + wps.map((w) => `<option value="${w}">WP ${w}</option>`).join("");
}

function filtered() {
  const q = document.getElementById("search").value.trim().toLowerCase();
  const state = (document.getElementById("state-filter") || {}).value || "";
  const wp = (document.getElementById("wp-filter") || {}).value || "";
  return ALL.filter((s) => {
    if (state && (s.state || "review") !== state) return false;
    if (wp && !(s.periods || []).includes(wp)) return false;
    if (!q) return true;
    const hay = s.raw + " " + (s.name || "") + " " + s.parties.join(" ")
      + " " + (s.variants || []).join(" ");
    return hay.toLowerCase().includes(q);
  });
}

function render(rows = filtered()) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  PAGE = Math.min(Math.max(0, PAGE), totalPages - 1);
  const pageRows = rows.slice(PAGE * PAGE_SIZE, (PAGE + 1) * PAGE_SIZE);

  const list = document.getElementById("speaker-list");
  list.innerHTML = pageRows.map(rowHtml).join("");
  pageRows.forEach((s, i) => {
    const el = list.children[i];
    el.addEventListener("click", (e) => {
      if (e.target.closest(".sel")) return;
      navigate({ id: speakerId(s) });
    });
    const cb = el.querySelector(".sel input");
    if (cb) cb.addEventListener("change", () => toggle(speakerId(s), "speaker", {
      key: speakerId(s), raw: s.raw, person_id: s.person_id || null,
      periods: s.periods, parties: s.parties, variants: s.variants, count: s.count }));
  });

  document.getElementById("speaker-count").textContent =
    `${total.toLocaleString("de")} Treffer`;

  const pag = document.getElementById("speaker-pagination");
  if (!pag) return;
  if (total <= PAGE_SIZE) { pag.innerHTML = ""; return; }
  const from = PAGE * PAGE_SIZE + 1;
  const to = Math.min((PAGE + 1) * PAGE_SIZE, total);
  pag.innerHTML = `<button id="pag-prev" type="button"${PAGE === 0 ? " disabled" : ""}>&#8249;</button>`
    + `<span class="pg-info">${from}–${to} von ${total.toLocaleString("de")}</span>`
    + `<button id="pag-next" type="button"${PAGE >= totalPages - 1 ? " disabled" : ""}>&#8250;</button>`;
  document.getElementById("pag-prev").addEventListener("click", () => {
    navigate({ page: PAGE - 1 });
    list.scrollTop = 0;
  });
  document.getElementById("pag-next").addEventListener("click", () => {
    navigate({ page: PAGE + 1 });
    list.scrollTop = 0;
  });
}

function rowHtml(s) {
  const badge = stateBadge(s);
  const sub = [s.name, s.parties.join(", ")].filter(Boolean).join(" - ");
  const checked = isSelected(speakerId(s)) ? "checked" : "";
  return `<div class="row"><label class="sel"><input type="checkbox" ${checked}></label>`
    + `<div><div class="nm">${esc(s.raw)}</div><div class="sub">${esc(sub)}</div></div>`
    + `<div class="cnt">${s.count.toLocaleString("de")}</div>${badge}</div>`;
}

function speechKindSummary(s) {
  const total = Number(s.count) || 0;
  const count = (field, fallback) => {
    const value = Number(s[field]);
    return Number.isFinite(value) ? value : fallback;
  };
  const rede = count("rede", total);
  const zwischenfrage = count("zwischenfrage", 0);
  const sitzungsleitung = count("sitzungsleitung", 0);
  return `${rede.toLocaleString("de")} Redebeiträge | ${zwischenfrage.toLocaleString("de")} Zwischenfragen`
    + ` | ${sitzungsleitung.toLocaleString("de")} organisatorische Wortmeldungen`;
}

function showDetail(s) {
  const srcs = s.sources.map((src) => {
    const pdfBase = refUrl(src.file);
    const pdf = pdfBase
      ? `<a href="${pdfBase + (src.page ? `#page=${src.page}` : "")}" target="_blank">PDF${src.page ? ` S.${src.page}` : ""}</a>`
      : "";
    const x = xmlLink(src, xmlSourceMode());
    const xml = x ? `<a href="${x.href}">${x.text}</a>` : "";
    return `<div class="src">${esc(src.file)}:${src.line} ${pdf} ${xml}</div>`;
  }).join("");
  const variants = (s.variants || []).filter((v) => v !== s.raw);
  const variantsHtml = variants.length
    ? `<h4>Namensvarianten (${variants.length})</h4>`
      + `<div class="variants">${variants.map((v) => esc(v)).join("<br>")}</div>`
    : "";
  // Available regardless of state: a garbage string can coincidentally
  // string-match a real surname and sit in "identified" with a wrong
  // person_id, not just in "review"/"missing".
  const notAPersonBtn = `<button id="copy-not-a-person" type="button">Keine Person: Edge-Case-Paket kopieren</button>`;
  const d = document.getElementById("detail");
  d.innerHTML = `<h3>${esc(s.raw)}</h3>`
    + `<p class="muted">person_id: ${s.person_id || "(unaufgeloest)"}`
    + ` | ${speechKindSummary(s)} | WP ${s.periods.join(", ")} | ${esc(s.parties.join(", ")) || "-"}</p>`
    + variantsHtml
    + `<h4>Quellen</h4>${srcs}`
    + `<button id="copy-fixpacket" type="button">Fix-Paket kopieren</button>`
    + notAPersonBtn
    + `<p class="muted">Ins Agenten-Fenster einfuegen; die Anleitung steht in docs/MANUAL_FIXES.md.</p>`;
  const packetSource = {
    ...s,
    sources_sampled: true,
    source_note: "Die veröffentlichten Quellen sind eine repräsentative, über Wahlperioden ausgewogene Auswahl (bis zu 30), nicht alle Wortmeldungen.",
  };
  d.querySelector("#copy-fixpacket").addEventListener("click", (e) => {
    copyFixPacket("speaker", packetSource, e.currentTarget);
  });
  const notAPersonEl = d.querySelector("#copy-not-a-person");
  if (notAPersonEl) {
    notAPersonEl.addEventListener("click", (e) => {
      copyFixPacket("speaker_not_a_person", packetSource, e.currentTarget);
    });
  }
}

function clearDetail() {
  const detail = document.getElementById("detail");
  if (detail) detail.innerHTML = "<p class=\"muted\">Sprecher:In auswählen, um Details und Quellen zu sehen.</p>";
}


// Row badge reflecting the 3-state model (identified / review / missing).
function stateBadge(s) {
  const state = s.resolved ? "identified" : (s.state || "review");
  if (state === "identified") return '<span class="badge ok">id</span>';
  if (state === "missing") return '<span class="badge miss" title="Fehlend">x</span>';
  return '<span class="badge no" title="Pruefen">?</span>';
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// Small DOM and rendering helpers shared by the static result-browser tabs.
// They deliberately accept missing nodes so a partially upgraded static build
// remains readable while its HTML/data assets are published independently.

export function byId(...ids) {
  for (const id of ids.flat()) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

export function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>\"]/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]
  ));
}

export function text(value) {
  return String(value == null ? "" : value);
}

export function number(value) {
  return Number(value || 0).toLocaleString("de");
}

export function periodOf(record) {
  const value = record && (record.period ?? record.wahlperiode ?? record.wp);
  return value == null ? "" : String(value);
}

export function sortedPeriods(records) {
  return [...new Set((records || []).map(periodOf).filter(Boolean))]
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b, "de"));
}

export function fillPeriodSelect(select, records, allLabel = "Alle Wahlperioden") {
  if (!select) return;
  const current = select.value || "";
  const periods = sortedPeriods(records);
  select.innerHTML = `<option value="">${esc(allLabel)}</option>`
    + periods.map((wp) => `<option value="${esc(wp)}">WP ${esc(wp)}</option>`).join("");
  // A route can refer to a period whose lazy shard has not been loaded yet.
  // Retain it visibly instead of quietly changing the URL/filter state.
  if (current && !periods.includes(current)) {
    select.insertAdjacentHTML("beforeend", `<option value="${esc(current)}">WP ${esc(current)} (wird geladen)</option>`);
  }
  select.value = current;
}

export function setValue(el, value) {
  if (!el) return;
  const next = value == null ? "" : String(value);
  if (el.value !== next) el.value = next;
}

export function bindOnce(el, event, key, listener) {
  if (!el) return;
  const marker = `bound_${event}_${key}`;
  if (el.dataset[marker]) return;
  el.dataset[marker] = "1";
  el.addEventListener(event, listener);
}

export function pageSlice(rows, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(0, Number(page) || 0), totalPages - 1);
  return {
    page: safePage,
    totalPages,
    rows: rows.slice(safePage * pageSize, (safePage + 1) * pageSize),
    from: rows.length ? safePage * pageSize + 1 : 0,
    to: Math.min((safePage + 1) * pageSize, rows.length),
  };
}

export function renderPagination(host, page, total, pageSize, onChange, labels = {}) {
  if (!host) return;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(0, Number(page) || 0), pages - 1);
  if (total <= pageSize) {
    host.innerHTML = total ? `<span class="pg-info">1–${number(total)} von ${number(total)}</span>` : "";
    return;
  }
  const from = safePage * pageSize + 1;
  const to = Math.min((safePage + 1) * pageSize, total);
  host.innerHTML = `<button type="button" data-page="prev"${safePage === 0 ? " disabled" : ""}`
    + ` aria-label="${esc(labels.previous || "Vorherige Seite")}">&#8249;</button>`
    + `<span class="pg-info">${number(from)}–${number(to)} von ${number(total)}</span>`
    + `<button type="button" data-page="next"${safePage >= pages - 1 ? " disabled" : ""}`
    + ` aria-label="${esc(labels.next || "Nächste Seite")}">&#8250;</button>`;
  host.querySelector('[data-page="prev"]')?.addEventListener("click", () => onChange(safePage - 1));
  host.querySelector('[data-page="next"]')?.addEventListener("click", () => onChange(safePage + 1));
}

export function sourceKey(source = {}) {
  return [source.file || "", source.line ?? source.xml_line ?? "", source.page || ""]
    .map(String).join(":");
}

// Compatible with both legacy monolithic payloads and the planned shard
// envelopes (`{ records: [...] }`, `{ items: [...] }`, or a named array).
export function recordsFrom(payload, names) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const name of names) if (Array.isArray(payload[name])) return payload[name];
  return [];
}

export function scrollListToTop(list) {
  if (list) list.scrollTop = 0;
}

export function markSelected(list, id) {
  if (!list) return;
  list.querySelectorAll(".row[data-id]").forEach((row) => {
    const selected = row.dataset.id === String(id || "");
    row.classList.toggle("selected", selected);
    row.setAttribute("aria-selected", selected ? "true" : "false");
  });
}

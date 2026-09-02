// Hash-based deeplink router. Routes are the source of truth for the active
// tab, optional selected record and every scalar filter. It deliberately keeps
// unknown future filter keys instead of truncating them to a fixed allow-list.

const handlers = Object.create(null);
const TAB_ALIASES = Object.freeze({
  periods: "overview",
  stats: "overview",
  unassigned: "reden",
  unresolved: "reden",
});
const TABS = new Set(["overview", "speakers", "parties", "reden", "toc", "polls", "interjections", "fehlliste"]);
let dispatchRevision = 0;

export const TAB_ORDER = ["overview", "speakers", "parties", "reden", "toc", "polls", "interjections", "fehlliste"];

export function canonicalTab(value) {
  const tab = String(value || "").trim().toLowerCase();
  if (TABS.has(tab)) return tab;
  if (TAB_ALIASES[tab]) return TAB_ALIASES[tab];
  return "overview";
}

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch (_) { return value; }
}

function copyParams(params) {
  const out = new URLSearchParams();
  for (const [key, value] of params || []) out.append(key, value);
  return out;
}

// Parse either the current hash or a supplied hash. `rawTab` makes old
// bookmarks observable so dispatch() can replace them with their canonical
// successor while retaining filters and selection IDs.
export function parseHash(hash = location.hash) {
  const raw = String(hash || "").replace(/^#/, "");
  const cut = raw.indexOf("?");
  const path = cut >= 0 ? raw.slice(0, cut) : raw;
  const query = cut >= 0 ? raw.slice(cut + 1) : "";
  const parts = path.split("/").filter(Boolean);
  const rawTab = (parts[0] || "overview").toLowerCase();
  const tab = canonicalTab(rawTab);
  const params = new URLSearchParams(query);
  const legacy = rawTab && rawTab !== tab ? rawTab : null;
  if (legacy && !params.has("legacy")) params.set("legacy", legacy);
  return {
    tab,
    rawTab,
    id: parts.length > 1 ? safeDecode(parts.slice(1).join("/")) : null,
    params,
    legacy,
  };
}

function appendScalar(params, key, value) {
  if (value === undefined || value === null || value === "") return;
  if (value instanceof URLSearchParams) {
    for (const [nestedKey, nestedValue] of value) appendScalar(params, nestedKey, nestedValue);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => appendScalar(params, key, item));
    return;
  }
  if (typeof value === "object") return;
  params.append(key, String(value));
}

// Serialize the route canonically. `opts.params` can be a URLSearchParams or a
// plain object; all remaining scalar option keys become query parameters. This
// preserves filters introduced by new tab implementations without router edits.
export function serializeRoute(tab, opts = {}) {
  const canonical = canonicalTab(tab);
  const params = new URLSearchParams();
  const supplied = opts.params;
  if (supplied instanceof URLSearchParams) {
    for (const [key, value] of supplied) appendScalar(params, key, value);
  } else if (supplied && typeof supplied === "object") {
    for (const [key, value] of Object.entries(supplied)) appendScalar(params, key, value);
  }
  for (const [key, value] of Object.entries(opts)) {
    if (key === "id" || key === "params") continue;
    appendScalar(params, key, value);
  }
  // Stable parameter order makes copied URLs and browser history legible.
  const sorted = [...params.entries()].sort(([a, av], [b, bv]) =>
    a.localeCompare(b) || av.localeCompare(bv));
  const query = new URLSearchParams();
  sorted.forEach(([key, value]) => query.append(key, value));
  let hash = `#${canonical}`;
  if (opts.id !== undefined && opts.id !== null && opts.id !== "")
    hash += `/${encodeURIComponent(String(opts.id))}`;
  const search = query.toString();
  if (search) hash += `?${search}`;
  return hash;
}

// Navigate (or replace the current history entry for high-frequency input).
export function setRoute(tab, opts = {}, replace = false) {
  const hash = serializeRoute(tab, opts);
  if (location.hash === hash) return;
  if (replace) {
    history.replaceState(null, "", hash);
    // replaceState does not emit hashchange; route filters still need an
    // immediate redraw while keeping one compact history entry.
    void dispatch();
  } else {
    location.hash = hash;
  }
}

export function register(tab, handler) {
  handlers[canonicalTab(tab)] = handler;
}

function activateTab(tab) {
  const canonical = canonicalTab(tab);
  const button = document.querySelector(`nav button[data-tab="${canonical}"]`);
  const section = document.getElementById(`tab-${canonical}`);
  document.querySelectorAll("nav button[data-tab]").forEach((item) => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", String(active));
    item.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll("main .tab").forEach((item) => {
    const active = item === section;
    item.classList.toggle("active", active);
    item.hidden = !active;
  });
  return Boolean(button && section);
}

function canonicalizeLegacyRoute(route) {
  if (!route.legacy) return route;
  const hash = serializeRoute(route.tab, { id: route.id, params: route.params });
  if (location.hash !== hash) history.replaceState(null, "", hash);
  return parseHash(hash);
}

async function dispatch() {
  const revision = ++dispatchRevision;
  let route = parseHash();
  // A blank hash should become a shareable #overview URL on first load.
  if (!location.hash) {
    const hash = serializeRoute("overview");
    history.replaceState(null, "", hash);
    route = parseHash(hash);
  } else {
    route = canonicalizeLegacyRoute(route);
  }
  activateTab(route.tab);
  syncHeaderOffset();
  const handler = handlers[route.tab];
  try {
    if (handler) await handler(route);
  } catch (error) {
    // Let the owner of a tab show its own empty/error state when possible, but
    // never strand the shared shell on an unhandled rejected lazy load.
    console.error(`Route ${route.tab} konnte nicht geladen werden`, error);
  }
  // A later navigation may have completed while a lazy handler was awaiting.
  if (revision !== dispatchRevision) return;
}

export function syncHeaderOffset() {
  const header = document.querySelector(".site-header");
  if (header) {
    document.documentElement.style.setProperty(
      "--app-header-height", `${Math.ceil(header.getBoundingClientRect().height)}px`,
    );
  }
  const toolbar = document.querySelector("main .tab.active .tab-toolbar");
  document.documentElement.style.setProperty(
    "--tab-toolbar-height", `${Math.ceil(toolbar?.getBoundingClientRect().height || 0)}px`,
  );
}

function initTabKeyboardNavigation() {
  const buttons = [...document.querySelectorAll("nav button[data-tab]")];
  buttons.forEach((button, index) => button.addEventListener("keydown", (event) => {
    let next = null;
    if (event.key === "ArrowRight") next = (index + 1) % buttons.length;
    if (event.key === "ArrowLeft") next = (index - 1 + buttons.length) % buttons.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = buttons.length - 1;
    if (next === null) return;
    event.preventDefault();
    buttons[next].focus();
    setRoute(buttons[next].dataset.tab);
  }));
}

export function initRouter() {
  document.querySelectorAll("nav button[data-tab]").forEach((button) =>
    button.addEventListener("click", (event) => {
      event.preventDefault();
      setRoute(button.dataset.tab);
    }));
  initTabKeyboardNavigation();
  window.addEventListener("hashchange", () => { void dispatch(); });
  window.addEventListener("resize", syncHeaderOffset, { passive: true });
  void dispatch();
}

// Fixed settings panel (bottom-right gear). One setting for now: the local repo
// checkout path used to turn a source XML row into a vscode:// deeplink (see
// xmlLink in data.js). Stored per browser in localStorage, never shipped.

const ROOT_KEY = "xml_checkout_root";

// --- STORAGE ---

function read(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch (e) {
    return "";
  }
}

function write(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
    return true;
  } catch (e) {
    return false;
  }
}

// --- MARKUP ---

const GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
  + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<circle cx="12" cy="12" r="3"/>'
  + '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 '
  + '1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 '
  + '1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 '
  + '9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 '
  + '2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 '
  + '0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

function panelMarkup() {
  return `<button id="settings-toggle" type="button" aria-expanded="false" `
    + `aria-controls="settings-panel" title="Einstellungen">${GEAR}</button>`
    + `<div id="settings-panel" hidden role="dialog" aria-label="Einstellungen">`
    + `<h2>Einstellungen</h2>`
    + `<label for="settings-xml-root">Lokaler Checkout-Pfad</label>`
    + `<input id="settings-xml-root" type="text" spellcheck="false" autocomplete="off" `
    + `placeholder="/pfad/zu/plenarProtokolle" />`
    + `<p class="settings-hint">Nur in diesem Browser gespeichert. Aktiviert im XML-Quellen-`
    + `Umschalter den Modus &bdquo;VS Code&ldquo;, der zur genauen Zeile der Quell-XML springt.</p>`
    + `<p id="settings-status" class="settings-status" aria-live="polite"></p></div>`;
}

// --- WIRING ---

export function initSettings() {
  if (typeof document === "undefined" || document.getElementById("settings")) return;
  const host = document.createElement("div");
  host.id = "settings";
  host.innerHTML = panelMarkup();
  document.body.appendChild(host);

  const toggle = host.querySelector("#settings-toggle");
  const panel = host.querySelector("#settings-panel");
  const input = host.querySelector("#settings-xml-root");
  const status = host.querySelector("#settings-status");
  input.value = read(ROOT_KEY);

  const setOpen = (open) => {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) input.focus();
  };
  toggle.addEventListener("click", () => setOpen(panel.hidden));
  document.addEventListener("click", (event) => {
    if (!panel.hidden && !host.contains(event.target)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) setOpen(false);
  });

  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const value = input.value.trim().replace(/\/+$/, "");
      const ok = write(ROOT_KEY, value);
      status.textContent = ok
        ? (value ? "Gespeichert." : "Zurückgesetzt.")
        : "Konnte nicht gespeichert werden (Speicher blockiert).";
    }, 400);
  });
}

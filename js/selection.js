// Feedback interface: select items (speakers, unassigned, TOC, polls,
// interjections) via checkbox and export them as a "manual_corrections"
// directive that the pipeline ingests (merge / fix / split / flag).
// Selection is generic and lives across tabs.

const SELECTED = new Map(); // id -> {type, ...payload}

export function isSelected(id) {
  return SELECTED.has(id);
}

export function toggle(id, type, payload) {
  if (SELECTED.has(id)) SELECTED.delete(id);
  else SELECTED.set(id, { type, ...payload });
  updateBar();
}

function updateBar() {
  const bar = document.getElementById("selbar");
  if (!bar) return;
  bar.classList.toggle("open", SELECTED.size > 0);
  const c = document.getElementById("sel-count");
  if (c) c.textContent = `${SELECTED.size} ausgewaehlt`;
}

function exportSelected() {
  const action = document.getElementById("sel-action").value;
  const note = (document.getElementById("sel-note").value || "").trim();
  const payload = {
    model: "manual_corrections", version: 1,
    generated: new Date().toISOString(), action, note,
    items: [...SELECTED.values()],
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `manual_corrections_${action}_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function initSelection(rerender) {
  const exp = document.getElementById("sel-export");
  const clr = document.getElementById("sel-clear");
  if (exp) exp.addEventListener("click", exportSelected);
  if (clr) clr.addEventListener("click", () => { SELECTED.clear(); updateBar(); rerender && rerender(); });
  updateBar();
}

// Wahlperioden tab: one card per electoral period with its key counts and
// drill-down buttons that jump to the matching filtered view in another tab.

let DATA = {};

export function initPeriods(data) {
  DATA = data;
  render();
}

// Refresh the TOC counts once the lazily-loaded agenda arrives (the initial
// render runs with an empty toc array, so every card shows TOC=0).
export function updatePeriodsToc(toc) {
  DATA = { ...DATA, toc };
  render();
}

function metricsByWp() {
  const { stats, speakers, structured, toc, tocIndex } = DATA;
  const m = {};
  (stats.by_period || []).forEach((p) => {
    m[String(p.period)] = { wp: String(p.period), sessions: p.files, speeches: p.speeches,
                            interjections: p.interjections, speakers: 0, polls: 0, toc: 0 };
  });
  (speakers || []).forEach((s) => (s.periods || []).forEach((p) => { if (m[p]) m[p].speakers++; }));
  ((structured || {}).polls || []).forEach((p) => { if (m[String(p.period)]) m[String(p.period)].polls++; });
  // One source at a time: the tiny shard index makes the cards correct on first
  // paint, the loaded agenda replaces it once the TOC tab has fetched it.
  // Adding both would double every count the moment the agenda arrives.
  if (toc && toc.length) {
    toc.forEach((t) => { if (m[String(t.period)]) m[String(t.period)].toc++; });
  } else {
    ((tocIndex || {}).periods || []).forEach((p) => {
      if (m[String(p.period)]) m[String(p.period)].toc = p.sessions;
    });
  }
  return Object.values(m).sort((a, b) => +a.wp - +b.wp);
}

function render() {
  const el = document.getElementById("periods-list");
  el.innerHTML = metricsByWp().map(cardHtml).join("");
  el.querySelectorAll("button[data-jump]").forEach((b) =>
    b.addEventListener("click", () => jump(b.dataset.jump, b.dataset.wp)));
}

function cardHtml(m) {
  const stat = (label, val) => `<span class="wp-stat"><b>${val.toLocaleString("de")}</b> ${label}</span>`;
  return `<div class="wp-card"><h3>Wahlperiode ${m.wp}</h3>`
    + `<div class="wp-stats">`
    + stat("Sitzungen", m.sessions) + stat("Redebeiträge", m.speeches) + stat("Sprecher:innen", m.speakers)
    + stat("Zwischenrufe", m.interjections) + stat("Abstimmungen", m.polls) + stat("TOC", m.toc)
    + `</div><div class="wp-actions">`
    + `<button data-jump="speakers" data-wp="${m.wp}">Sprecher:In</button>`
    + `<button data-jump="toc" data-wp="${m.wp}">Tagesordnung</button>`
    + `<button data-jump="polls" data-wp="${m.wp}">Abstimmungen</button>`
    + `</div></div>`;
}

// Drill down: switch tab and pre-set its filter to this Wahlperiode.
function jump(tab, wp) {
  document.querySelector(`nav button[data-tab="${tab}"]`).click();
  if (tab === "speakers") {
    const f = document.getElementById("wp-filter");
    if (f) { f.value = wp; f.dispatchEvent(new Event("change")); }
  } else {
    const box = document.getElementById({ toc: "toc-search", polls: "poll-search" }[tab]);
    if (box) { box.value = "WP " + wp; box.dispatchEvent(new Event("input")); }
  }
}

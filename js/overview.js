import { setRoute } from "./router.js";
import { esc, number } from "./tabutils.js";

const TOPICS = ["general", "speakers", "speeches", "toc", "polls", "interjections", "fehlliste"];

const TOPIC_META = {
  general: { title: "Allgemein", description: "Sitzungen, Redebeiträge, Abdeckung und auffällige Dateien." },
  speakers: { title: "Sprecher:innen", description: "Auflösung, Person-IDs, Fraktionsstempel und erkannte Parteien." },
  speeches: { title: "Redebeiträge", description: "Offene Zuordnungen und nicht zugeordnete Textzeilen." },
  toc: { title: "Tagesordnung", description: "Sitzungen und Herkunft der Tagesordnungspunkte." },
  polls: { title: "Abstimmungen", description: "Strukturierte namentliche Abstimmungen und Validierung." },
  interjections: { title: "Zwischenrufe", description: "Ereignisse, Personen, normalisierte Typen und Erfassungsdiagnostik." },
  fehlliste: { title: "Fehlliste", description: "Überlieferte Entschuldigungs- und Beurlaubungsvermerke." },
};

const ANOMALY_LABELS = {
  appendix_heavy: "anlagenlastig",
  multi_day_split: "mehrtägig geteilt",
  multi_session_split: "mehrere Sitzungen geteilt",
  very_short: "sehr kurz",
};

const HELP_TEXT = Object.freeze({
  integrity: {
    title: "Was zeigt diese Zusammenfassung?",
    body: "Der Bereich fasst technische Qualitäts- und Vollständigkeitssignale der verarbeiteten Protokolle zusammen. Ein Prüfhinweis bedeutet, dass sich ein Wert zur Kontrolle anbietet; er bestätigt noch keinen Fehler in den Daten.",
  },
  data_state: {
    title: "Datenstand",
    body: "Zeitpunkt, zu dem die Daten für diese Ansicht erzeugt wurden. Er zeigt nicht das Datum der jeweiligen Plenarsitzung, sondern den Stand des zugrunde liegenden Datenexports.",
  },
  build: {
    title: "Build",
    body: "Kennung des Erzeugungslaufs. Sie hilft dabei, Werte dieser Ansicht eindeutig einem Datenstand zuzuordnen und spätere Aktualisierungen nachvollziehen zu können.",
  },
  reconciliation: {
    title: "Abgleich",
    body: "Der Abgleich vergleicht zusammengehörige Zählwerte aus unterschiedlichen Verarbeitungsschritten. „Ohne Hinweise“ heißt, dass dabei keine auffällige Differenz erkannt wurde; es ist keine inhaltliche Bewertung einzelner Redebeiträge.",
  },
  data_format: {
    title: "Warum ist das Datenformat wichtig?",
    body: "Seit Plenarprotokoll 19/1 vom 24. Oktober 2017 stellt der Bundestag die offiziellen Einzel-XML im strukturierten dbtplenarprotokoll-Format bereit. Darin sind etwa Sprecherwechsel, Fraktionen und Kommentare als XML-Struktur angegeben. Das Projekt übernimmt solche Dateien direkt. Ältere oder archivierte Dateien im DOKUMENT/TEXT-Format werden weiterhin mit dem historischen Textparser verarbeitet — entscheidend ist der XML-Root, nicht allein die Wahlperiode.",
  },
  coverage: {
    title: "Was misst „Abdeckung“?",
    body: "Der Anteil der inhaltlich relevanten Zeilen einer Protokolldatei (alle nicht-leeren Zeilen des Rohtexts), den die Verarbeitung einem Redebeitrag oder Zwischenruf zuordnen konnte — plus Kopf-/Tagesordnungsbereich vor dem ersten Redebeitrag und Anlagen-/Anhangbereich nach dem letzten, aber nur wenn die Verarbeitung die Datei bis zu einem regulären Ende durchlaufen hat. Fehlende Zeilen sind echter Verlust und werden unten weiter aufgeschlüsselt: „Debattenlücke“ = eine Lücke mitten im Debattenteil, „Textendeverlust“ = Inhalt nach einem vorzeitigen Abbruch der Verarbeitung. 99,8 % Abdeckung heißt: im Schnitt 0,2 % der relevanten Zeilen je Datei sind nicht zugeordnet — nicht „0,2 % der Dateien fehlen“.",
  },
});

function helpButton(key, label) {
  return `<button class="info-button" type="button" data-help="${esc(key)}" aria-label="Erläuterung: ${esc(label)}" title="Erläuterung öffnen">?</button>`;
}

function value(value, kind = "number") {
  if (value === null || value === undefined || value === "") return "–";
  if (kind === "percent") return `${Math.round(Number(value) * 1000) / 10}%`;
  return number(value);
}

function availability(block) {
  const item = (block || {}).availability || {};
  const status = item.status || "unknown";
  const labels = {
    available: "vorhanden",
    partial: "teilweise",
    unknown: "unbekannt",
    unavailable: "nicht verfügbar",
  };
  const reason = item.reason ? `<span class="metric-note">${esc(item.reason)}</span>` : "";
  return `<span class="availability availability-${esc(status)}">${esc(labels[status] || status)}</span>${reason}`;
}

function metric(label, raw, { kind = "number", route = null, note = "", help = "" } = {}) {
  const body = `<span class="metric-label">${esc(label)}${help ? helpButton(help, label) : ""}</span>`
    + `<strong>${value(raw, kind)}</strong>`
    + (note ? `<small>${esc(note)}</small>` : "");
  if (!route) return `<div class="metric-card">${body}</div>`;
  const attrs = [
    `data-tab="${esc(route.tab)}"`,
    route.wp ? `data-wp="${esc(route.wp)}"` : "",
    route.mode ? `data-mode="${esc(route.mode)}"` : "",
  ].filter(Boolean).join(" ");
  return `<button class="metric-card drill-card" type="button" ${attrs}>${body}<span aria-hidden="true">→</span></button>`;
}

function interjectionAuditNote(audit) {
  const values = audit || {};
  const coverage = values.coverage || {};
  const normalization = values.normalization || {};
  const normalizationCoverage = normalization.coverage || {};
  const parserFiles = coverage.enrichment_audit_files ?? coverage.audited_files;
  const normalizationFiles = normalizationCoverage.files ?? coverage.normalization_audit_files;
  const display = (raw) => raw === null || raw === undefined || raw === "" ? "unbekannt" : number(raw);
  const labels = {
    available: "vollständig",
    partial: "teilweise",
    unavailable: "nicht verfügbar",
    unknown: "unbekannt",
  };
  const availability = values.availability;
  const status = String(typeof availability === "string" ? availability : availability?.status || "unknown");
  return "Diagnose " + (labels[status] || status) + ": Parser "
    + display(parserFiles) + " von " + display(coverage.files)
    + " Dateien; Normalisierung " + display(normalizationFiles)
    + " von " + display(coverage.files) + " Dateien.";
}
function anomalyNote(anomalies) {
  return Object.entries((anomalies || {}).by_type || {})
    .map(([key, count]) => `${number(count)} ${ANOMALY_LABELS[key] || key}`)
    .join(" · ");
}

function formattedDate(value) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(date);
}

function partyDistinct(stats, wp, fallback) {
  if (!stats || typeof stats !== "object") return fallback;
  if (!wp) return Array.isArray(stats.by_party) ? stats.by_party.length : fallback;
  const entry = (stats.by_party_period || []).find((item) => String(item.period) === String(wp));
  return entry && Array.isArray(entry.parties) ? entry.parties.length : fallback;
}

function overallScorecard(data, record, partyStats) {
  const general = record.general || {};
  const coverage = general.coverage || {};
  const speakers = record.speakers || {};
  const speeches = record.speeches || {};
  const toc = record.toc || {};
  const polls = record.polls || {};
  const interjections = record.interjections || {};
  const interjectionAudit = interjections.audit || {};
  const reconciliation = data.reconciliation || {};
  const reconciled = reconciliation.status === "ok";
  const reconciliationLabel = reconciled ? "ohne Hinweise" : "mit Hinweisen";
  const route = (tab, extra = {}) => ({ tab, ...extra });

  return `<section class="overview-scorecard" aria-labelledby="overview-scorecard-title">
    <div class="overview-scorecard-head">
      <div><h3 id="overview-scorecard-title">Integrität und offene Prüfsignale ${helpButton("integrity", "Integrität und offene Prüfsignale")}</h3>
        <p>Quellnahe Zählwerte für den gesamten Bestand. Prüfhinweise sind keine bestätigten Defekte.</p></div>
      <dl class="overview-build-state">
        <div><dt>Datenstand ${helpButton("data_state", "Datenstand")}</dt><dd>${esc(formattedDate(data.generated))}</dd></div>
        <div><dt>Build ${helpButton("build", "Build")}</dt><dd>${esc(data.build_id || "–")}</dd></div>
        <div class="build-state-${reconciled ? "ok" : "warning"}"><dt>Abgleich ${helpButton("reconciliation", "Abgleich")}</dt><dd>${esc(reconciliationLabel)}</dd></div>
      </dl>
    </div>
    <section class="overview-data-format" aria-labelledby="overview-data-format-title">
      <div class="overview-data-format-marker" aria-hidden="true">XML</div>
      <div>
        <h4 id="overview-data-format-title">Datenformat-Wechsel: ab 19/1 ${helpButton("data_format", "Datenformat-Wechsel")}</h4>
        <p>Seit dem <strong>24. Oktober 2017</strong> liefert der Bundestag die offiziellen Einzel-XML strukturiert als <code>dbtplenarprotokoll</code>. Sprecherwechsel, Redebeiträge, Fraktionen und Kommentare liegen darin bereits als Daten vor.</p>
        <p class="overview-data-format-detail">Die Verarbeitung erkennt den XML-Root: Strukturierte Dateien gehen direkt in den Adapter, archivierte <code>DOKUMENT/TEXT</code>-Dateien bleiben beim bewährten Textparser — auch dann, wenn sie zur WP19 gehören.</p>
        <p class="overview-data-format-sources"><a href="https://dserver.bundestag.de/btp/19/19001.pdf" target="_blank" rel="noreferrer">Plenarprotokoll 19/1</a><span aria-hidden="true"> · </span><a href="https://www.bundestag.de/services/opendata" target="_blank" rel="noreferrer">Open-Data- und DTD-Dokumentation</a></p>
      </div>
    </section>
    <div class="overview-score-groups">
      <section class="overview-score-group"><h4>Verarbeitung und Abdeckung</h4>
        <div class="metric-grid">
          ${metric("verarbeitete Protokolldateien", general.sessions)}
          ${metric("fehlgeschlagene Sitzungen", general.failed_sessions)}
          ${metric("frühe Abbrüche", general.early_halts)}
          ${metric("Abdeckung", coverage.overall, { kind: "percent", help: "coverage" })}
          ${metric("Median-Abdeckung", coverage.median, { kind: "percent" })}
          ${metric("niedrigste Datei-Abdeckung", coverage.minimum, { kind: "percent" })}
          ${metric("Dateien unter 95 %", coverage.files_below_95pct)}
          ${metric("Debattenlücke (Zeilen)", coverage.debate_gap_lines)}
          ${metric("Textendeverlust (Zeilen)", coverage.tail_loss_lines)}
          ${metric("Prüfhinweise", (general.anomalies || {}).total, { note: anomalyNote(general.anomalies) })}
        </div>
      </section>
      <section class="overview-score-group"><h4>Sprecher:innen und offene Zuordnungen</h4>
        <div class="metric-grid">
          ${metric("erkannte Parteien", partyDistinct(partyStats, "", speakers.party_distinct), { route: route("parties") })}
          ${metric("nicht identifizierte Redebeiträge", speakers.unidentified_speeches, { route: route("reden", { mode: "unresolved" }) })}
          ${metric("unaufgelöste Redebeiträge", speakers.unresolved_speeches, { route: route("reden", { mode: "unresolved" }) })}
          ${metric("unzugeordnete Zeilen", speeches.unassigned_lines, { route: route("reden", { mode: "unassigned" }) })}
          ${metric("Dateien mit unzugeordneten Zeilen", speeches.files_with_unassigned, { route: route("reden", { mode: "unassigned" }) })}
          ${metric("offene Sprecher:innen-Gruppen", speeches.unresolved_groups, { route: route("reden", { mode: "unresolved" }) })}
        </div>
      </section>
      <section class="overview-score-group"><h4>Strukturierte Ergebnisse</h4>
        <div class="metric-grid">
          ${metric("Sitzungen mit TOP-Daten", toc.sessions, { route: route("toc") })}
          ${metric("TOP-Protokollfallbacks", toc.parsed_fallback_sessions, { route: route("toc") })}
          ${metric("unbekannte TOP-Quellen", toc.unknown_source_sessions, { route: route("toc") })}
          ${metric("TOC-Plausibilität (Median)", toc.median_crosscheck, { kind: "percent", route: route("toc") })}
          ${metric("nicht validierte Abstimmungen", polls.unvalidated, { route: route("polls") })}
          ${metric("Roh-Ergebniszeilen", polls.raw_poll_result_lines, { route: route("polls") })}
          ${metric("Zwischenruf-Rohblöcke", interjectionAudit.source_records, { route: route("interjections"), note: interjectionAuditNote(interjectionAudit) })}
          ${metric("regelbasiert ignorierte Zwischenrufblöcke", interjectionAudit.ignored_records, { route: route("interjections") })}
          ${metric("Zwischenrufblöcke ohne Ereignis", interjectionAudit.records_without_events, { route: route("interjections") })}
          ${metric("Zwischenruf-Fallback „other“", interjectionAudit.events_kind_other, { route: route("interjections") })}
        </div>
      </section>
    </div>
  </section>`;
}

function topicMetrics(topic, block, wp, partyStats) {
  const route = (tab, extra = {}) => ({ tab, wp, ...extra });
  const coverage = (block || {}).coverage || {};
  const anomaly = (block || {}).anomalies || {};
  const types = (block || {}).types || [];
  const audit = (block || {}).audit || {};
  switch (topic) {
    case "general":
      return [
        metric("Sitzungen", block.sessions),
        metric("Redebeiträge", block.speeches, { route: route("speakers") }),
        metric("Abdeckung", coverage.overall, { kind: "percent", help: "coverage" }),
        metric("fehlgeschlagene Sitzungen", block.failed_sessions),
        metric("frühe Abbrüche", block.early_halts),
        metric("Anomalie-Hinweise", anomaly.total, { route: route("reden", { mode: "unassigned" }) }),
      ];
    case "speakers":
      return [
        metric("eindeutig aufgelöste Redebeiträge", block.resolved_speeches, { route: route("speakers") }),
        metric("Auflösungsrate", block.resolution_rate, { kind: "percent", route: route("speakers") }),
        metric("nicht identifizierte Redebeiträge", block.unidentified_speeches, { route: route("reden", { mode: "unresolved" }) }),
        metric("Person-IDs", block.distinct_person_ids, { route: route("speakers") }),
        metric("erkannte Parteien", partyDistinct(partyStats, wp, block.party_distinct), { route: route("parties") }),
        metric("Fraktionsstempel", block.party_stamp_rate, { kind: "percent", route: route("speakers") }),
      ];
    case "speeches":
      return [
        metric("unzugeordnete Zeilen", block.unassigned_lines, { route: route("reden", { mode: "unassigned" }) }),
        metric("veröffentlichte Zeilen", block.published_unassigned_lines, { route: route("reden", { mode: "unassigned" }) }),
        metric("offene Sprecher:innen-Gruppen", block.unresolved_groups, { route: route("reden", { mode: "unresolved" }) }),
        metric("betroffene Redebeiträge", block.unresolved_speeches, { route: route("reden", { mode: "unresolved" }) }),
      ];
    case "toc":
      return [
        metric("Sitzungen", block.sessions, { route: route("toc") }),
        metric("TOPs", block.top_items, { route: route("toc") }),
        metric("offizielle Quellen", block.official_sessions, { route: route("toc") }),
        metric("Protokoll-Fallbacks", block.parsed_fallback_sessions, { route: route("toc") }),
        metric("TOC-Plausibilität (Median)", block.median_crosscheck, { kind: "percent", route: route("toc") }),
      ];
    case "polls":
      return [
        metric("Abstimmungen", block.polls, { route: route("polls") }),
        metric("validiert", block.validated, { route: route("polls") }),
        metric("nicht validiert", block.unvalidated, { route: route("polls") }),
        metric("Roh-Ergebniszeilen", block.raw_poll_result_lines, { route: route("polls") }),
      ];
    case "interjections":
      return [
        metric("Ereignisse", block.events, { route: route("interjections") }),
        metric("Interruptionsblöcke", block.records, { route: route("interjections") }),
        metric("Rohblöcke", audit.source_records, { route: route("interjections"), note: interjectionAuditNote(audit) }),
        metric("regelbasiert ignoriert", audit.ignored_records, { route: route("interjections") }),
        metric("ohne erzeugtes Ereignis", audit.records_without_events, { route: route("interjections") }),
        metric('Parser-Fallback „other“', audit.events_kind_other, { route: route("interjections") }),
        metric("bei Normalisierung entfernt", (audit.normalization || {}).dropped_records, { route: route("interjections") }),
        metric('normalisiert „sonstiges“', (audit.normalization || {}).events_type_sonstiges, { route: route("interjections") }),
        metric("genannte Personen", block.distinct_people, { route: route("interjections") }),
        metric("Gruppen", block.distinct_groups, { route: route("interjections") }),
        metric("Typen", types.length, { route: route("interjections") }),
      ];
    case "fehlliste": {
      const status = block.absence_status || {};
      return [
        metric("Sitzungen mit Vermerk", block.sessions, { route: route("fehlliste") }),
        metric("dokumentierte Einträge", block.recorded_entries, { route: route("fehlliste") }),
        metric("aktive Vermerke", block.active_entries, { route: route("fehlliste") }),
        metric("Personen", block.distinct_people, { route: route("fehlliste") }),
        metric("Entschuldigt", status.excused),
        metric("Beurlaubt", status.leave),
        metric("ausdrücklich unentschuldigt", status.unexcused),
        metric("zurückgenommen", status.retracted),
        metric("nicht klassifiziert", status.unknown),
      ];
    }
    default:
      return [];
  }
}

function availabilityLegend() {
  return '<div class="availability-legend" aria-label="Legende zur Datenverfügbarkeit">'
    + '<strong>Verfügbarkeit:</strong>'
    + '<span class="availability availability-available">grün: vorhanden</span>'
    + '<span class="availability availability-partial">amber: teilweise</span>'
    + '<span class="availability availability-unavailable">rot: nicht verfügbar</span>'
    + '<span class="availability availability-unknown">grau: unbekannt</span>'
    + '</div>';
}

function heroNumbers(data) {
  const general = (data.overall || {}).general || {};
  return `<section class="overview-about overview-hero-numbers" aria-labelledby="overview-hero-title">
    <h2 id="overview-hero-title">Kennzahlen</h2>
    <div class="metric-grid">
      ${metric("Wahlperioden", (data.periods || []).length)}
      ${metric("verarbeitete Sitzungen (Protokolldateien)", general.sessions)}
    </div>
  </section>`;
}

// Static, documentation-derived summary (see docs/edge_cases.md, docs/data_edge_cases.md, docs/accepted_losses.md).
function edgeCaseNotes() {
  return `<section class="overview-about overview-edge-cases" aria-labelledby="overview-edge-cases-title">
    <h2 id="overview-edge-cases-title">Bekannte Fehlerquellen und Grenzfälle</h2>
    <div class="edge-case-groups">
      <div>
        <h3>Struktur der Eingabedateien</h3>
        <ul>
          <li>Mehrere Sitzungen in einer Datei (49 Dateien) — automatisch getrennt, unkritisch.</li>
          <li>Sitzung über zwei Kalendertage (8 Dateien) — automatisch getrennt, unkritisch.</li>
          <li>Dieselbe Sitzung in zwei aufeinanderfolgenden Eingabedateien (48 Fälle, WP1–5) — ca. 1.878 doppelt gezählte Reden (~0,2 %), keine automatische Bereinigung.</li>
          <li>Anlagenlastige Sitzungen (155 Dateien) — wenig gesprochener Text, viele Anlagen/Abstimmungslisten.</li>
          <li>Sehr kurze Sitzungen (27 Dateien) — echte kurze Sitzungen, kein Datenfehler.</li>
        </ul>
      </div>
      <div>
        <h3>Statistische Ausreißer</h3>
        <ul>
          <li>Hoher Anteil unzugeordneter Zeilen (31 Dateien) — Kandidaten für Regelwerk-Korrekturen.</li>
          <li>Niedrige Sprecher:innen-Auflösungsrate (42 Dateien, v. a. WP4–5) — noch offene Identitätsklärung.</li>
          <li>WP14: rund 9.989 unzugeordnete Zeilen, gleichmäßig über alle 253 Dateien verteilt — systematische Ruleset-Lücke, kein Einzeldatei-Fehler.</li>
        </ul>
      </div>
      <div>
        <h3>Einzelfälle in der Quelle</h3>
        <ul>
          <li>WP17, Sitzung 250: Quelle dupliziert Eröffnung und Redetext selbst — Zahlen dieser Sitzung sind überhöht, kein Parserfehler.</li>
          <li>WP4, Datei 04087: zwei Sitzungen (87 und 88) in einer Ausgabedatei zusammengefasst — Sitzungszahl hier untererfasst.</li>
          <li>Fehlliste-Spaltenumbruch (WP14, Sitzung 88): ein Eintrag nicht rekonstruierbar.</li>
          <li>Sitzungsendzeit fehlt (ca. 330 Dateien) — reine Feldlücke, kein Redeverlust.</li>
        </ul>
      </div>
      <div>
        <h3>Akzeptierte Restfehler</h3>
        <ul>
          <li>Nicht identifizierte Sprecher:innen: ca. 874 Reden (0,09 %) — mehrdeutige Nachnamen ohne Orts- oder Parteisignal.</li>
          <li>Zwischenruf-Urheber unaufgelöst: ca. 4 % von ca. 971.000 benannten Erwähnungen, v. a. WP1–9 — Quelle nennt nur einen Nachnamen ohne Unterscheidungsmerkmal.</li>
          <li>OCR-verunstaltete Kopfzeilen: ca. 15–30 Reden betroffen.</li>
        </ul>
      </div>
      <div>
        <h3>Historische Fakten, kein Fehler</h3>
        <ul>
          <li>WP9 (142 Sitzungen), WP15 (187 Sitzungen), WP3 (168 Sitzungen): vorzeitig beendete bzw. regulär kürzere Wahlperioden.</li>
        </ul>
      </div>
    </div>
  </section>`;
}

function topicSection(topic, block, wp, partyStats) {
  const meta = TOPIC_META[topic];
  return `<section class="overview-topic" id="overview-${wp || "overall"}-${topic}">`
    + `<h3 class="overview-level-2">${esc(meta.title)} ${availability(block)}</h3>`
    + `<p class="muted">${esc(meta.description)}</p>`
    + `<div class="metric-grid">${topicMetrics(topic, block || {}, wp, partyStats).join("")}</div></section>`;
}

function chart(data) {
  const periods = data.periods || [];
  const rows = periods.map((period) => {
    const rawCoverage = ((period.general || {}).coverage || {}).overall;
    const coverage = rawCoverage === null || rawCoverage === undefined ? Number.NaN : Number(rawCoverage);
    const height = Number.isFinite(coverage) ? Math.max(4, Math.min(100, coverage * 100)) : 4;
    const coverageLabel = Number.isFinite(coverage) ? value(coverage, "percent") : "unbekannt";
    return `<button type="button" class="overview-bar" data-scroll-wp="${esc(period.period)}"`
      + ` title="WP ${esc(period.period)}: ${coverageLabel}">`
      + `<span class="overview-bar-plot"><span class="overview-bar-value">${esc(coverageLabel)}</span>`
      + `<span class="overview-bar-fill" style="height:${height}%"></span></span><span>WP ${esc(period.period)}</span></button>`;
  }).join("");
  return `<section class="overview-chart-card"><div><h2>Abdeckung nach Wahlperiode</h2>`
    + `<p class="muted">Die Balken zeigen Abweichungen schneller als eine tabellarische Rate. Niedrige Werte sind Hinweise zur Prüfung, kein Fehlerbeweis.</p></div>`
    + `<div class="overview-bars" aria-label="Abdeckung nach Wahlperiode">${rows}</div></section>`;
}

function listItems(items) {
  return (items || []).map((item) => `<li><strong>${esc(item.label || "")}</strong>`
    + `${item.detail ? ` – ${esc(item.detail)}` : ""}</li>`).join("");
}

function quickJump(periods) {
  const targets = [{ key: "overall", label: "Gesamt" }].concat((periods || []).map((period) => ({
    key: period.period || period.key || "?",
    label: period.period || period.key || "?",
  })));
  return `<div class="overview-quick-jump" role="navigation" aria-label="Schnellsprung zu Legislaturperioden">
    <span class="overview-quick-jump-label">Schnellsprung</span>
    <div class="overview-quick-jump-items">${targets.map((target, index) =>
      `<button class="overview-quick-jump-button${index === 0 ? " active" : ""}" type="button"
        data-scroll-wp="${esc(target.key)}" aria-controls="overview-wp-${esc(target.key)}"
        aria-current="${index === 0 ? "location" : "false"}">${esc(target.label)}</button>`
    ).join("")}</div>
  </div>`;
}

function activateQuickJump(host, wp) {
  host.querySelectorAll(".overview-quick-jump-button").forEach((button) => {
    const active = button.dataset.scrollWp === String(wp);
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "location" : "false");
  });
}

function scrollToPeriod(host, wp) {
  const target = document.getElementById(`overview-wp-${wp}`);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  activateQuickJump(host, wp);
}

function section(title, record, wp, overall = false, data = {}, partyStats = null) {
  const block = record || {};
  const label = overall ? "Gesamtüberblick" : `Legislaturperiode ${wp}`;
  return `<section class="overview-period" id="overview-wp-${esc(wp || "overall")}">`
    + `<h2 class="overview-level-1">${esc(label)}</h2>`
    + `<p class="overview-status">${availability(block.general || {})}</p>`
    + (overall ? overallScorecard(data, block, partyStats) : "")
    + TOPICS.map((topic) => topicSection(topic, block[topic] || {}, wp, partyStats)).join("")
    + `</section>`;
}

function bindDrilldowns(host) {
  // Same-page scroll if the target section is already rendered in this host
  // (quick-jump within Legislaturperioden); otherwise navigate to that tab.
  host.querySelectorAll("[data-scroll-wp]").forEach((button) => button.addEventListener("click", () => {
    const wp = button.dataset.scrollWp;
    if (host.querySelector(`[id="overview-wp-${wp}"]`)) scrollToPeriod(host, wp);
    else setRoute("legislaturperioden", { wp });
  }));
  host.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => {
    setRoute(button.dataset.tab, {
      wp: button.dataset.wp || "",
      mode: button.dataset.mode || "",
    });
  }));
}

function bindHelp(host) {
  const dialog = host.querySelector("#overview-help-modal");
  const title = dialog?.querySelector("#overview-help-title");
  const body = dialog?.querySelector("#overview-help-body");
  host.querySelectorAll("[data-help]").forEach((button) => button.addEventListener("click", () => {
    const content = HELP_TEXT[button.dataset.help];
    if (!content || !dialog || !title || !body) return;
    title.textContent = content.title;
    body.textContent = content.body;
    dialog.showModal();
  }));
  dialog?.querySelector("[data-help-close]")?.addEventListener("click", () => dialog.close());
}

export function renderOverview(data, partyStats = null) {
  const host = document.getElementById("overview-content");
  if (!host) return;
  const about = data.about || {};
  const reconciliation = (data.reconciliation || {}).messages || [];
  host.innerHTML = `<section class="overview-about"><h2>${esc(about.label || "Qualitäts- und Abdeckungsübersicht")}</h2>`
    + `<p>Diese Ansicht zeigt Plausibilitäts- und Abdeckungssignale, keine geschätzte Gesamtgenauigkeit. ${esc(about.unknown_semantics || "Unbekannte Werte werden nicht als Null gelesen.")}</p>`
    + availabilityLegend()
    + `<div class="overview-exceptions"><div><h3>Erwartete Abweichungen</h3><ul>${listItems(about.expected_exceptions)}</ul></div>`
    + `<div><h3>Akzeptierte / bekannte Grenzen</h3><ul>${listItems(about.accepted_limitations)}</ul></div></div>`
    + (reconciliation.length ? `<div class="overview-warning"><strong>Abgleichhinweise:</strong><ul>${reconciliation.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></div>` : "")
    + `</section>`
    + heroNumbers(data)
    + edgeCaseNotes()
    + chart(data);
  bindDrilldowns(host);
}

export function renderLegislaturperioden(data, partyStats = null) {
  const host = document.getElementById("legislaturperioden-content");
  if (!host) return;
  host.innerHTML = availabilityLegend()
    + quickJump(data.periods || [])
    + section("Gesamtüberblick", data.overall || {}, "", true, data, partyStats)
    + (data.periods || []).map((period) => section("", period, period.period || period.key || "?", false, {}, partyStats)).join("")
    + `<dialog id="overview-help-modal" class="overview-help-modal" aria-labelledby="overview-help-title">`
    + `<div class="overview-help-modal-head"><h2 id="overview-help-title">Erläuterung</h2>`
    + `<button class="overview-help-close" type="button" data-help-close aria-label="Erläuterung schließen">×</button></div>`
    + `<p id="overview-help-body"></p></dialog>`;
  bindDrilldowns(host);
  bindHelp(host);
}

export function scrollToLegislaturperiode(wp) {
  const host = document.getElementById("legislaturperioden-content");
  if (!host) return;
  scrollToPeriod(host, wp || "overall");
}

// Static data loading and source-reference helpers. The landing overview uses a
// compact summary first; topic records are loaded only when a result tab needs
// them. Legacy monolithic assets remain a compatibility fallback.

let BUILD = "";
let metaPromise = null;
const topicIndexCache = new Map();
const topicShardCache = new Map();
const legacyPayloadCache = new Map();
const topicAggregateCache = new Map();
let fehllisteSummaryPromise = null;
let interjectionSummaryPromise = null;
const tocPeriodCache = new Map();
let tocIndexCache = null;
let tocCache = null;
let partyDataPromise = null;

const v = (path) => `${path}${path.includes("?") ? "&" : "?"}v=${encodeURIComponent(BUILD)}`;
const padPeriod = (period) => String(period == null ? "" : period).replace(/^wp/i, "").padStart(2, "0");
const periodNumber = (period) => String(period == null ? "" : period).replace(/^0+/, "") || "0";

async function fetchJson(path, { optional = false, noStore = false } = {}) {
  try {
    const response = await fetch(noStore ? path : v(path), noStore ? { cache: "no-store" } : undefined);
    if (!response.ok) {
      if (optional) return null;
      throw new Error(`${path}: HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (optional) return null;
    throw error;
  }
}

function normalizeAssetPath(path) {
  if (!path) return null;
  const clean = String(path).replace(/^\.\//, "");
  return clean.startsWith("data/") ? clean : `data/${clean}`;
}

export function buildId() { return BUILD; }

// meta.json is the publication/cache-busting root. Keep it tiny and fresh.
export async function loadMeta() {
  if (!metaPromise) {
    metaPromise = fetchJson(`data/meta.json?t=${Date.now()}`, { noStore: true }).then((meta) => {
      BUILD = meta.build_id || meta.generated || "";
      return meta;
    });
  }
  return metaPromise;
}

async function optionalAsset(path) {
  await loadMeta();
  return fetchJson(path, { optional: true });
}

function availability(status, reason = "") {
  return reason ? { status, reason } : { status };
}

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function anomalyRows(anomalies) {
  return Object.entries(anomalies || {})
    .filter(([key, value]) => !key.startsWith("_") && Array.isArray(value))
    .map(([key, value]) => ({ type: key, count: value.length, rows: value }));
}

function anomaliesForPeriod(anomalies, period) {
  const key = padPeriod(period);
  const byType = {};
  anomalyRows(anomalies).forEach(({ type, rows }) => {
    const count = rows.filter((row) => {
      const match = String(row.file || "").match(/^(\d{2})/);
      return match && match[1] === key;
    }).length;
    if (count) byType[type] = count;
  });
  return { total: Object.values(byType).reduce((sum, count) => sum + count, 0), by_type: byType };
}

function emptyTopic(reason = "Für diese Kennzahl liegt im aktuellen statischen Export keine getrennte Evidenz vor.") {
  return { availability: availability("unknown", reason) };
}

function legacyPeriodRecord(row, tocIndex, anomalies) {
  const period = String(row.period);
  const toc = (tocIndex.periods || []).find((item) => String(item.period) === period);
  const anomaly = anomaliesForPeriod(anomalies, period);
  return {
    period,
    key: padPeriod(period),
    general: {
      availability: availability("partial", "Der alte Export enthält keine vollständige Sitzungs- und Evidenzbilanz."),
      sessions: numeric(row.files),
      failed_sessions: null,
      early_halts: null,
      speeches: numeric(row.speeches),
      raw_interjection_records: numeric(row.interjections),
      coverage: {
        overall: null, median: null, min: null, files_below_95pct: null,
        debate_gap_lines: null, tail_loss_lines: null,
      },
      anomalies: anomaly,
    },
    speakers: emptyTopic(),
    speeches: emptyTopic(),
    toc: toc
      ? { availability: availability("available"), sessions: numeric(toc.sessions), top_items: null,
          official_sessions: numeric(toc.sessions), parsed_fallback_sessions: 0, median_crosscheck: null }
      : { ...emptyTopic("Für diese Wahlperiode liegt keine offizielle DIP-Tagesordnung im alten Export vor."),
          sessions: null, top_items: null, official_sessions: null, parsed_fallback_sessions: null, median_crosscheck: null },
    polls: emptyTopic(),
    interjections: {
      availability: availability("partial", "Der alte Export enthält nur die Zahl der extrahierten Zwischenrufe je Wahlperiode."),
      events: numeric(row.interjections), distinct_people: null, distinct_groups: null, types: null,
    },
    fehlliste: emptyTopic("Status der Abwesenheit ist im alten Export nicht quellenerhaltend unterschieden."),
  };
}

async function buildLegacyOverview() {
  const [meta, stats, anomalies, tocIndex] = await Promise.all([
    loadMeta(),
    optionalAsset("data/stats.json").then((value) => value || {}),
    optionalAsset("data/anomalies.json").then((value) => value || {}),
    loadTocIndex(),
  ]);
  const periods = (stats.by_period || []).map((row) => legacyPeriodRecord(row, tocIndex, anomalies));
  const totalAnomalies = anomalyRows(anomalies).reduce((sum, item) => sum + item.count, 0);
  const anomalyTypes = Object.fromEntries(anomalyRows(anomalies).map((item) => [item.type, item.count]));
  const sessionTotal = periods.reduce((sum, item) => sum + (item.general.sessions || 0), 0);
  const speechTotal = numeric(meta.total_speeches) ?? periods.reduce((sum, item) => sum + (item.general.speeches || 0), 0);
  const interjectionTotal = numeric(meta.interjection_events)
    ?? periods.reduce((sum, item) => sum + (item.interjections.events || 0), 0);
  const reconciliation = Array.isArray(meta.reconciliation) ? meta.reconciliation : [];

  return {
    schema_version: 0,
    generated: meta.generated || null,
    build_id: meta.build_id || null,
    source: "legacy-fallback",
    topic_order: ["general", "speakers", "speeches", "toc", "polls", "interjections", "fehlliste"],
    about: {
      label: "Kompatibilitätsübersicht aus dem bisherigen statischen Export",
      accuracy_claim: false,
      unknown_semantics: "Unbekannt bedeutet: nicht verfügbar, nicht ausreichend belegt oder im alten Export nicht getrennt ausgewiesen – nicht null und nicht gut.",
      expected_exceptions: [
        { id: "short", label: "legitime Kurz-, Gedenk- und Eröffnungssitzungen" },
        { id: "split", label: "Mehrtagessitzungen und auf mehrere Eingaben verteilte Sitzungen" },
        { id: "appendix", label: "Anlagen, schriftliche Erklärungen und abstimmungsreiche Sitzungen" },
      ],
      accepted_limitations: [
        { id: "fallback", label: "Der ausführliche Qualitätssummary wurde noch nicht gefunden.", detail: "Einige Kennzahlen sind deshalb bewusst unbekannt statt geschätzt." },
      ],
    },
    reconciliation: {
      status: reconciliation.length ? "warning" : "ok",
      messages: reconciliation,
    },
    availability: availability("partial", "Anzeige aus kompatiblen Alt-Assets; der schema-versionierte Qualitätssummary fehlt."),
    overall: {
      general: {
        availability: availability("partial", "Der alte Export enthält keine vollständige Qualitätsbilanz."),
        sessions: sessionTotal || null,
        failed_sessions: null,
        early_halts: null,
        speeches: speechTotal,
        raw_interjection_records: interjectionTotal,
        coverage: { overall: null, median: null, min: null, files_below_95pct: null, debate_gap_lines: null, tail_loss_lines: null },
        anomalies: { total: totalAnomalies, by_type: anomalyTypes },
      },
      speakers: {
        availability: availability("partial", "Nur globale Sprecher:innen-Zustände sind im alten Export verfügbar."),
        total: numeric(meta.speaker_count), resolved: numeric(meta.resolved_speakers), states: meta.speaker_states || null,
      },
      speeches: {
        availability: availability("partial"),
        unassigned_lines: numeric(meta.unassigned_lines), unresolved_groups: numeric(meta.unresolved_groups),
        unresolved_speeches: numeric(meta.unresolved_speeches),
      },
      toc: {
        availability: availability("partial"), sessions: numeric(meta.toc_sessions), top_items: null,
        official_sessions: numeric(meta.toc_sessions), parsed_fallback_sessions: null, median_crosscheck: null,
      },
      polls: {
        availability: availability("partial"), polls: numeric(meta.polls), validated: null,
        unvalidated: null, raw_poll_result_lines: numeric(meta.poll_result_lines),
      },
      interjections: {
        availability: availability("partial"), events: interjectionTotal,
        distinct_people: null, distinct_groups: null, types: null,
      },
      fehlliste: {
        availability: availability("unknown", "Der alte Export unterscheidet Entschuldigung, Beurlaubung und sonstige Abwesenheit nicht quellenerhaltend."),
        sessions: numeric(meta.fehlliste_sessions), recorded_entries: null, distinct_people: null,
        absence_status: { status: "unknown", reason: "Keine source-preserving Statusdaten im alten Export." },
      },
    },
    periods,
  };
}

// The primary landing-page API. New builds emit one of these compact files;
// current checked-out data still renders a conservative, aggregate fallback.
export async function loadOverviewData() {
  await loadMeta();
  for (const path of ["data/overview.json", "data/quality_summary.json"]) {
    const value = await fetchJson(path, { optional: true });
    if (value && typeof value === "object") return { ...value, source: path };
  }
  return buildLegacyOverview();
}

// The party view only needs the compact statistics aggregate, not the much
// larger speaker index.  New exports include `by_party_period`; older exports
// remain readable and simply fall back to the overall aggregate.
export async function loadPartyData() {
  if (!partyDataPromise) {
    partyDataPromise = (async () => {
      await loadMeta();
      return await fetchJson("data/stats.json", { optional: true }) || {
        by_party: [], by_party_period: [], by_period: [],
      };
    })();
  }
  return partyDataPromise;
}

// Backwards-compatible eager loader used by older tab modules. New code should
// prefer loadTopicData/loadTopicShard so the landing page stays small.
export async function loadData() {
  const meta = await loadMeta();
  const [speakers, stats, unassigned, unresolved, structured, fehlliste, anomalies, tocIndex] = await Promise.all([
    fetchJson("data/speakers.json"),
    fetchJson("data/stats.json"),
    fetchJson("data/unassigned.json", { optional: true }).then((value) => value || { lines: [], by_category: {} }),
    fetchJson("data/unresolved.json", { optional: true }).then((value) => value || { groups: [], by_class: {} }),
    fetchJson("data/structured.json", { optional: true }).then((value) => value || { polls: [], types: [], people: [], groups: [], targets: [], totals: {} }),
    fetchJson("data/fehlliste.json", { optional: true }).then((value) => value || { sessions: [], people: [], totals: {} }),
    fetchJson("data/anomalies.json", { optional: true }).then((value) => value || {}),
    loadTocIndex(),
  ]);
  return { speakers, stats, meta, toc: [], tocIndex, unassigned, unresolved, structured, fehlliste, anomalies };
}

export async function loadTocIndex() {
  if (!tocIndexCache) {
    tocIndexCache = optionalAsset("data/toc/index.json")
      .then((value) => value || { periods: [], total_sessions: 0 });
  }
  return tocIndexCache;
}

function tocShardFile(index, period) {
  const key = padPeriod(period);
  const entry = (index.periods || []).find((item) =>
    padPeriod(item.period ?? item.key ?? item.wp) === key);
  return entry && entry.file ? normalizeAssetPath(`toc/${entry.file}`) : `data/toc/wp${key}.json`;
}

// Fetch exactly one official-agenda shard. A missing historical era is a valid
// empty result, not a failure and not an implied zero-quality result.
export async function loadTocPeriod(period) {
  const key = padPeriod(period);
  if (!tocPeriodCache.has(key)) {
    tocPeriodCache.set(key, (async () => {
      const index = await loadTocIndex();
      const value = await fetchJson(tocShardFile(index, key), { optional: true });
      return Array.isArray(value) ? value : (value && (value.records || value.sessions)) || [];
    })());
  }
  return tocPeriodCache.get(key);
}

// Kept for current modules that need a corpus-wide TOC. It is intentionally
// only called from a TOC view, never from the overview startup path.
export async function loadToc() {
  if (!tocCache) {
    tocCache = (async () => {
      const index = await loadTocIndex();
      const parts = await Promise.all((index.periods || []).map((item) => loadTocPeriod(item.period ?? item.key ?? item.wp)));
      return parts.flat();
    })();
  }
  return tocCache;
}

export async function loadTopicIndex(topic) {
  const name = String(topic || "").toLowerCase();
  if (!topicIndexCache.has(name)) {
    topicIndexCache.set(name, optionalAsset(`data/${name}/index.json`));
  }
  return topicIndexCache.get(name);
}

function indexShardCandidates(topic, index, period) {
  const key = padPeriod(period);
  const entries = Array.isArray(index && index.periods) ? index.periods
    : Array.isArray(index && index.shards) ? index.shards : [];
  const entry = entries.find((item) => padPeriod(item.period ?? item.key ?? item.wp) === key);
  const named = entry && (entry.file || entry.path || entry.shard);
  const paths = [];
  if (named) paths.push(normalizeAssetPath(`${topic}/${named}`));
  paths.push(`data/${topic}/wp${key}.json`);
  paths.push(`data/${topic}/${key}.json`);
  return [...new Set(paths)];
}

function topicAssetPath(topic, file) {
  const name = String(topic || "").toLowerCase();
  const raw = String(file || "").replace(/^\.\//, "").replace(/^\/+/, "");
  if (!name || !raw) return null;
  if (raw.startsWith("data/")) return normalizeAssetPath(raw);
  if (raw.startsWith(name + "/")) return normalizeAssetPath(raw);
  return "data/" + name + "/" + raw;
}

function recordsEnvelope(payload) {
  if (!payload || typeof payload !== "object") return {};
  const records = payload.records;
  return records && typeof records === "object" ? records : payload;
}

function assetRows(payload, field) {
  if (Array.isArray(payload)) return payload;
  const records = recordsEnvelope(payload);
  return Array.isArray(records[field]) ? records[field] : null;
}

async function indexedTopicAsset(topic, index, field, fallbackFile = null) {
  const file = (index && index[field]) || fallbackFile;
  const path = topicAssetPath(topic, file);
  return path ? optionalAsset(path) : null;
}

// Polls and interjections have a small, complete aggregate that is distinct
// from the legacy structured.json monolith. Only fall back to that monolith
// when a historical publication does not advertise (or cannot serve) it.
export async function loadTopicAggregate(topic) {
  const name = String(topic || "").toLowerCase();
  if (!topicAggregateCache.has(name)) {
    topicAggregateCache.set(name, (async () => {
      const index = await loadTopicIndex(name);
      const aggregate = await indexedTopicAsset(name, index, "aggregate_file");
      if (aggregate && typeof aggregate === "object") return recordsEnvelope(aggregate);
      return legacyPayload(name);
    })());
  }
  return topicAggregateCache.get(name);
}

function fehllisteSessionSelection(id) {
  const match = /^session:(\d+)\/([^/]+)$/.exec(String(id || ""));
  return match ? { period: match[1], session: match[2] } : null;
}

function fehllistePersonSelection(id) {
  const match = /^person:(.+)$/.exec(String(id || ""));
  return match ? match[1] : null;
}

function fehllisteSessionKey(session) {
  if (!session || session.period === undefined || session.session === undefined) return null;
  return padPeriod(session.period) + "/" + String(session.session);
}

function fehllisteShardSessions(payload) {
  return assetRows(payload, "sessions") || [];
}

function mergeFehllisteSessions(summary, detailed) {
  const byKey = new Map();
  (detailed || []).forEach((session) => {
    const key = fehllisteSessionKey(session);
    if (key) byKey.set(key, session);
  });
  const seen = new Set();
  const merged = (summary || []).map((session) => {
    const key = fehllisteSessionKey(session);
    if (!key || !byKey.has(key)) return session;
    seen.add(key);
    return { ...session, ...byKey.get(key) };
  });
  (detailed || []).forEach((session) => {
    const key = fehllisteSessionKey(session);
    if (!key || seen.has(key) || (summary || []).some((item) => fehllisteSessionKey(item) === key)) return;
    merged.push(session);
  });
  return merged;
}

function personPeriods(person) {
  const periods = new Set();
  (person?.periods || []).forEach((period) => {
    if (period === null || period === undefined || period === "") return;
    periods.add(padPeriod(period));
  });
  return [...periods];
}

// The Fehlliste landing view needs only its full people index and lightweight
// session summaries. Member lists stay in period shards and are fetched only
// for a selected session or all periods relevant to a selected person.
async function loadFehllisteSummary() {
  if (!fehllisteSummaryPromise) {
    fehllisteSummaryPromise = (async () => {
      const index = await loadTopicIndex("fehlliste");
      if (!index || !index.sessions_file) {
        return { index, records: await legacyPayload("fehlliste"), isSummary: false };
      }
      const [peopleAsset, sessionsAsset] = await Promise.all([
        indexedTopicAsset("fehlliste", index, "people_file", "people.json"),
        indexedTopicAsset("fehlliste", index, "sessions_file"),
      ]);
      const people = assetRows(peopleAsset, "people") || assetRows(sessionsAsset, "people");
      const sessions = assetRows(sessionsAsset, "sessions");
      if (!people || !sessions) {
        return { index, records: await legacyPayload("fehlliste"), isSummary: false };
      }
      return {
        index,
        records: { ...recordsEnvelope(sessionsAsset), people, sessions },
        isSummary: true,
      };
    })();
  }
  return fehllisteSummaryPromise;
}

async function loadFehllisteData(id) {
  const base = await loadFehllisteSummary();
  if (!base.isSummary) return base;

  const selectedSession = fehllisteSessionSelection(id);
  const selectedPerson = fehllistePersonSelection(id);
  let periods = selectedSession ? [padPeriod(selectedSession.period)] : [];
  if (selectedPerson) {
    const person = (base.records.people || []).find((item) => item.name === selectedPerson);
    periods = personPeriods(person);
  }
  if (!periods.length) return base;

  const shards = await Promise.all(periods.map((period) => loadTopicShard("fehlliste", period)));
  const detailed = shards.flatMap(fehllisteShardSessions);
  return {
    ...base,
    records: {
      ...base.records,
      sessions: mergeFehllisteSessions(base.records.sessions, detailed),
    },
  };
}

async function legacyPayload(topic) {
  const name = String(topic || "").toLowerCase();
  if (!legacyPayloadCache.has(name)) {
    legacyPayloadCache.set(name, (async () => {
      switch (name) {
        case "speakers": return fetchJson("data/speakers.json", { optional: true }).then((value) => value || []);
        case "unresolved": return fetchJson("data/unresolved.json", { optional: true }).then((value) => value || { groups: [], by_class: {} });
        case "unassigned": return fetchJson("data/unassigned.json", { optional: true }).then((value) => value || { lines: [], by_category: {} });
        case "polls":
        case "interjections": return fetchJson("data/structured.json", { optional: true }).then((value) => value || {});
        case "fehlliste": return fetchJson("data/fehlliste.json", { optional: true }).then((value) => value || { sessions: [], people: [], totals: {} });
        default: return null;
      }
    })());
  }
  return legacyPayloadCache.get(name);
}

function rowPeriod(row) {
  if (row && row.period != null) return padPeriod(row.period);
  const file = String((row && (row.file || row.source_file)) || "");
  const match = file.match(/(?:pp)?(\d{2})\d{3}/i);
  return match ? match[1] : "";
}

function filterLegacyPeriod(topic, payload, period) {
  const key = padPeriod(period);
  if (!payload) return payload;
  if (topic === "speakers") return payload.filter((row) => (row.periods || []).some((item) => padPeriod(item) === key));
  if (topic === "unresolved") return { ...payload, groups: (payload.groups || []).filter((row) => padPeriod(row.period) === key) };
  if (topic === "unassigned") return { ...payload, lines: (payload.lines || []).filter((row) => rowPeriod(row) === key) };
  if (topic === "polls") return { ...payload, polls: (payload.polls || []).filter((row) => padPeriod(row.period) === key) };
  if (topic === "interjections") return payload; // old aggregate entity tables lack a safe per-WP dimension
  if (topic === "fehlliste") return { ...payload, sessions: (payload.sessions || []).filter((row) => padPeriod(row.period) === key) };
  return payload;
}

// Generic lazy shard API. New web-data builds use an index plus `wpNN.json`;
// old builds transparently fall back to the legacy monolith with a local filter.
export async function loadTopicShard(topic, period) {
  const name = String(topic || "").toLowerCase();
  const key = `${name}:${padPeriod(period)}`;
  if (!topicShardCache.has(key)) {
    topicShardCache.set(key, (async () => {
      const index = await loadTopicIndex(name);
      for (const path of indexShardCandidates(name, index, period)) {
        const value = await optionalAsset(path);
        if (value !== null) return value;
      }
      return filterLegacyPeriod(name, await legacyPayload(name), period);
    })());
  }
  return topicShardCache.get(key);
}

// Convenience boundary for tab controllers. It returns the compact index plus
// either a requested period shard or the compatible legacy payload. `reden`
// composes the two independent records without inventing a new source file.
export async function loadTopicData(topic, { wp = null, id = null } = {}) {
  const name = String(topic || "").toLowerCase();
  if (name === "toc") {
    const index = await loadTocIndex();
    return { index, records: wp ? await loadTocPeriod(wp) : null };
  }
  if (name === "reden") {
    const [unresolvedIndex, unassignedIndex, unresolved, unassigned] = await Promise.all([
      loadTopicIndex("unresolved"), loadTopicIndex("unassigned"),
      wp ? loadTopicShard("unresolved", wp) : legacyPayload("unresolved"),
      wp ? loadTopicShard("unassigned", wp) : legacyPayload("unassigned"),
    ]);
    return { indexes: { unresolved: unresolvedIndex, unassigned: unassignedIndex }, unresolved, unassigned };
  }
  if (name === "fehlliste") {
    const payload = await loadFehllisteData(id);
    return { index: payload.index, records: payload.records };
  }
  if (name === "interjections") {
    const payload = await loadInterjectionData({ wp, id });
    return { index: payload.index, records: payload.records };
  }
  const index = await loadTopicIndex(name);
  const records = wp ? await loadTopicShard(name, wp)
    : ((name === "polls" || name === "interjections")
      ? await loadTopicAggregate(name) : await legacyPayload(name));
  return { index, records };
}

// Optional companion asset for a topic (for example the complete Fehlliste
// people index). It follows the same build-id cache boundary as all JSON.
export async function loadTopicExtra(topic, file) {
  const cleanTopic = String(topic || "").replace(/[^a-z0-9_-]/gi, "");
  const cleanFile = String(file || "").replace(/[^a-z0-9._-]/gi, "");
  if (!cleanTopic || !cleanFile) return null;
  return optionalAsset(`data/${cleanTopic}/${cleanFile}`);
}

// Official Bundestag PDF for a source file like "input/pp16/16232.xml".
// Pattern: https://dserver.bundestag.de/btp/{period}/{stem}.pdf
export function refUrl(file) {
  if (!file) return null;
  const stem = file.split("/").pop().replace(/\.xml$/, "");
  const match = stem.match(/^(\d{2})(\d{3})/);
  if (!match) return null;
  const period = parseInt(match[1], 10);
  return `https://dserver.bundestag.de/btp/${period}/${match[1]}${match[2]}.pdf`;
}

// Edit to point GitHub-hosted XML at your repo (blob view + #L line anchor).
export const XML_GITHUB_BASE = "https://github.com/nickyreinert/plenarProtokolle/blob/main/";

// Source-link modes are part of the speaker deep-link contract. Keep the
// normalization here so callers never emit an unsafe or non-functional target.
export const XML_SOURCE_MODES = Object.freeze(["vscode", "github", "pdf"]);

export function normalizeXmlSource(value) {
  const mode = String(value || "").trim().toLowerCase();
  return XML_SOURCE_MODES.includes(mode) ? mode : "vscode";
}

// Deep link to a source XML row; target chosen by the #xml-source select:
// local VS Code at the exact line, GitHub blob with #L anchor, or the PDF page.
// `preferredMode` lets a route render deterministically without depending on a
// mutable control elsewhere in the document. The DOM fallback keeps legacy
// callers working.
export function xmlLink(src, preferredMode = null) {
  if (!src) return null;
  const selected = preferredMode == null
    ? (typeof document === "undefined" ? "vscode" : (document.getElementById("xml-source") || {}).value)
    : preferredMode;
  const mode = normalizeXmlSource(selected);
  if (mode === "vscode" && src.xml_path && src.xml_line)
    return { href: `vscode://file${src.xml_path}:${src.xml_line}`, text: `XML:${src.xml_line}` };
  if (mode === "github" && src.file && src.xml_line)
    return { href: `${XML_GITHUB_BASE}${src.file}#L${src.xml_line}`, text: `GitHub:${src.xml_line}` };
  const base = refUrl(src.file);
  return base ? { href: base + (src.page ? `#page=${src.page}` : ""), text: `PDF${src.page ? ` S.${src.page}` : ""}` } : null;
}

// File-level XML link (no row reference) for items that lack a line, e.g. polls.
export function xmlFileLink(file) {
  if (!file) return null;
  return { href: `${XML_GITHUB_BASE}${file}`, text: "XML" };
}

function interjectionShardPeople(payload) {
  return assetRows(payload, "people") || [];
}

function mergeInterjectionPeople(summary, detailed) {
  const samples = new Map();
  (detailed || []).forEach((person) => {
    if (!person || !person.name || !Array.isArray(person.samples)) return;
    const current = samples.get(person.name) || [];
    samples.set(person.name, current.concat(person.samples));
  });
  return (summary || []).map((person) => {
    const personSamples = samples.get(person.name);
    return personSamples ? { ...person, samples: personSamples } : person;
  });
}

// The global interjection index has every person and exact type counts, but
// intentionally no source samples. Select one person to load the relevant
// Wahlperiode shards and attach its complete retained sample evidence.
async function loadInterjectionSummary() {
  if (!interjectionSummaryPromise) {
    interjectionSummaryPromise = (async () => {
      const index = await loadTopicIndex("interjections");
      if (!index || !index.people_file) {
        return { index, records: await legacyPayload("interjections"), isSummary: false };
      }
      const [aggregate, peopleAsset] = await Promise.all([
        loadTopicAggregate("interjections"),
        indexedTopicAsset("interjections", index, "people_file"),
      ]);
      const people = assetRows(peopleAsset, "people");
      if (!aggregate || !people) {
        return { index, records: await legacyPayload("interjections"), isSummary: false };
      }
      return { index, records: { ...aggregate, people }, isSummary: true };
    })();
  }
  return interjectionSummaryPromise;
}

async function loadInterjectionData({ wp = null, id = null } = {}) {
  if (wp) {
    const index = await loadTopicIndex("interjections");
    return { index, records: await loadTopicShard("interjections", wp) };
  }
  const base = await loadInterjectionSummary();
  if (!base.isSummary || !id) return base;
  const person = (base.records.people || []).find((item) => item.name === id);
  const periods = personPeriods(person);
  if (!periods.length) return base;
  const shards = await Promise.all(periods.map((period) => loadTopicShard("interjections", period)));
  const detailed = shards.flatMap(interjectionShardPeople);
  return {
    ...base,
    records: {
      ...base.records,
      people: mergeInterjectionPeople(base.records.people, detailed),
    },
  };
}

// Fix packet: a plain-text block the user copies from a detail view and pastes
// into a coding agent. The agent follows docs/MANUAL_FIXES.md to research the
// entity and apply the fix through the right tracked ruleset file.
//
// One builder for every entity kind (speaker, unresolved group, poll voter,
// interjection, Fehlliste). Only the fields that exist are printed.

import { refUrl } from "./data.js";

const HEADER =
  "MANUAL FIX REQUEST\n" +
  "Follow the runbook at docs/MANUAL_FIXES.md. Research this entity,\n" +
  "apply the fix through the correct rulesets/*.json file (never edit output/),\n" +
  "rebuild, run the zero-unexplained-flips check, and report back.\n";

// --- SOURCE LINES ---

function sourceLines(sources, entity = {}) {
  const rows = Array.isArray(sources) ? sources : [];
  if (!rows.length) return "  (none)";
  const total = Number(entity.source_count ?? entity.source_total);
  const isSample = Boolean(entity.sources_sampled)
    || (Number.isFinite(total) && total > rows.length);
  const note = entity.source_note
    || (isSample
      ? "repräsentative veröffentlichte Quellenstichprobe"
      : "alle für dieses Paket bereitgestellten Quellen");
  const header = "  (" + rows.length + " Referenz" + (rows.length === 1 ? "" : "en")
    + "; " + note
    + (Number.isFinite(total) ? " von " + total : "") + ")";
  return header + "\n" + rows
    .map((s) => {
      const ref = s.file ? s.file + (s.line ? ":" + s.line : "") : (s.label || s.url || "?");
      const xml = s.xml_line ? " xml-row " + s.xml_line : "";
      const pdf = s.url || refUrl(s.file);
      const pg = pdf ? " " + pdf + (!s.url && s.page ? "#page=" + s.page : "") : "";
      return "  " + ref + xml + pg;
    })
    .join("\n");
}

function candidateLines(cands) {
  if (!cands || !cands.length) return "  (no candidates in persons.json)";
  return cands
    .map(
      (c) =>
        `  ${c.id}  ${c.name}  ${c.party || "?"}` +
        `${c.role ? ", " + c.role : ""}  WP ${(c.periods || []).join("/")}`,
    )
    .join("\n");
}

function packetEntityId(kind, entity = {}) {
  if (entity.entity_id) return String(entity.entity_id);
  if (entity._id) return kind + ":" + entity._id;
  if (entity.id) return kind + ":" + entity.id;
  const period = entity.period ?? entity.wp ?? "?";
  const session = entity.session ?? "";
  if (session !== "") return kind + ":" + period + "/" + session;
  if (entity.file) return kind + ":" + entity.file + ":" + (entity.line ?? "?");
  if (entity.person_id) return kind + ":" + entity.person_id;
  if (entity.name) return kind + ":" + entity.name;
  if (entity.surname) return kind + ":" + entity.surname;
  if (entity.raw) return kind + ":" + entity.raw;
  return kind + ":unspecified";
}

// --- PER-KIND BODY ---

function speakerBody(s) {
  return (
    `kind: speaker\n` +
    `raw: ${s.raw}\n` +
    `current person_id: ${s.person_id || "(unresolved)"}\n` +
    `periods: ${(s.periods || []).join(", ")}\n` +
    `parties: ${(s.parties || []).join(", ") || "-"}\n` +
    `speeches: ${s.count}\n` +
    `name variants: ${(s.variants || []).join(" | ") || "-"}\n` +
    `candidates:\n${candidateLines(s.candidates)}\n` +
    `sources:\n${sourceLines(s.sources, s)}`
  );
}

function groupBody(g) {
  return (
    `kind: unresolved_group\n` +
    `period: ${g.period}\n` +
    `surname: ${g.surname}\n` +
    `class: ${g.class || "-"}\n` +
    `raw variants: ${(g.top_raws || []).map((r) => r.raw).join(" | ")}\n` +
    `first lines:\n` +
    (g.first_lines || []).map((l) => `  ${l}`).join("\n") +
    `\ncandidates:\n${candidateLines(g.candidates)}\n` +
    `sources:\n${sourceLines(g.sources, g)}`
  );
}

function genericBody(kind, e) {
  const skip = new Set(["sources", "candidates"]);
  const fields = Object.keys(e)
    .filter((k) => !skip.has(k) && typeof e[k] !== "object")
    .map((k) => `${k}: ${e[k]}`)
    .join("\n");
  return (
    `kind: ${kind}\n${fields}\n` +
    `sources:\n${sourceLines(e.sources, e)}`
  );
}

const BUILDERS = { speaker: speakerBody, unresolved_group: groupBody };

// --- PUBLIC ---

export function fixPacketText(kind, entity) {
  const packetEntity = {
    ...(entity || {}),
    entity_id: packetEntityId(kind, entity),
  };
  const body = (BUILDERS[kind] || ((e) => genericBody(kind, e)))(packetEntity);
  return (
    HEADER +
    "\n" +
    body +
    "\n\nPROPOSED FIX (fill in after research):\n" +
    "  file: rulesets/____\n" +
    "  change: ____\n" +
    "  evidence: ____\n"
  );
}

export function copyFixPacket(kind, entity, btn) {
  const text = fixPacketText(kind, entity);
  const done = () => {
    if (!btn) return;
    const o = btn.textContent;
    btn.textContent = "kopiert";
    setTimeout(() => {
      btn.textContent = o;
    }, 1500);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, done) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    done();
  } catch (e) {
    /* no-op */
  }
  document.body.removeChild(ta);
}

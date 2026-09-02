import { loadMeta, loadOverviewData, loadPartyData, loadTopicData } from "./data.js";
import { renderOverview, renderLegislaturperioden, scrollToLegislaturperiode } from "./overview.js";
import { initSpeakers, rerenderSpeakers, routeSpeakers } from "./speakers.js";
import { updateParties, routeParties } from "./parties.js";
import { updateReden, routeReden } from "./reden.js";
import { updateAgenda, routeAgenda } from "./agenda.js";
import {
  updateInterjections, updatePolls, routeInterjectionsView, routePollsView,
} from "./structured_views.js";
import { updateFehlliste, routeFehlliste } from "./absence.js";
import { initSelection } from "./selection.js";
import { initRouter, register } from "./router.js";

let META = null;
let SPEAKERS_READY = false;

function setMeta(meta) {
  const target = document.getElementById("meta");
  if (!target) return;
  target.textContent = `${Number(meta.speaker_count || 0).toLocaleString("de")} Sprecher:innen | `
    + `${Number(meta.total_speeches || 0).toLocaleString("de")} Redebeiträge | `
    + `${Number(meta.resolved_speakers || 0).toLocaleString("de")} mit person_id | Stand ${meta.generated || "–"}`;
}

function routePeriod(route) {
  const direct = route.params.get("wp");
  if (direct) return direct;
  const id = String(route.id || "");
  if (route.tab === "fehlliste") {
    const session = /^session:(\d+)\/[^/]+$/.exec(id);
    return session ? session[1] : null;
  }
  const match = /(\d+)\//.exec(id);
  return match ? match[1] : null;
}

async function boot() {
  try {
    META = await loadMeta();
    setMeta(META);

    register("overview", async () => {
      const [overview, parties] = await Promise.all([loadOverviewData(), loadPartyData()]);
      renderOverview(overview, parties);
    });

    register("legislaturperioden", async (route) => {
      const [overview, parties] = await Promise.all([loadOverviewData(), loadPartyData()]);
      renderLegislaturperioden(overview, parties);
      scrollToLegislaturperiode(routePeriod(route) || "overall");
    });

    register("speakers", async (route) => {
      if (!SPEAKERS_READY) {
        const payload = await loadTopicData("speakers");
        initSpeakers(payload.records || [], META);
        SPEAKERS_READY = true;
      }
      routeSpeakers(route);
    });

    register("parties", async (route) => {
      updateParties(await loadPartyData());
      routeParties(route);
    });

    register("reden", async (route) => {
      const payload = await loadTopicData("reden", { wp: routePeriod(route) });
      updateReden(payload);
      routeReden(route);
    });

    register("toc", async (route) => {
      const payload = await loadTopicData("toc", { wp: routePeriod(route) });
      updateAgenda(payload);
      routeAgenda(route);
    });

    register("polls", async (route) => {
      const payload = await loadTopicData("polls", { wp: routePeriod(route) });
      updatePolls(payload);
      routePollsView(route);
    });

    register("interjections", async (route) => {
      const payload = await loadTopicData("interjections", { wp: routePeriod(route), id: route.id });
      updateInterjections(payload);
      routeInterjectionsView(route);
    });

    register("fehlliste", async (route) => {
      const payload = await loadTopicData("fehlliste", { id: route.id });
      updateFehlliste(payload);
      routeFehlliste(route);
    });

    initSelection(() => { if (SPEAKERS_READY) rerenderSpeakers(); });

    initRouter();
  } catch (error) {
    const target = document.getElementById("meta");
    if (target) target.textContent = `Fehler beim Laden der Daten: ${error.message || error}`;
  }
}

void boot();

import { businessDate } from "./next-race.mjs";

export const SECTIONS = {
  "best-bets": "Best Bets", "elite-winners": "Elite Winners", "system-bets": "System Bets",
  "trophy-horses": "Trophy Horses", "value-edge": "Value Edge", "value-hunt": "Value Hunt",
  "top-picks": "Top Picks", "founders-premium": "Founder's Premium", "full-summary": null,
};

export function formatNet(value) {
  if (!Number.isFinite(value)) throw new Error("Invalid daily net units");
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}u`;
}

export function resultText(row, betting) {
  if (!row) return "Pending";
  const interim = row.status === "interim" ? " (interim)" : "";
  return row.label + interim + (betting && Number.isFinite(row.profit_units) ?
    ` \u00b7 ${formatNet(row.profit_units)}` : "");
}

export function renderResult(cell, row, betting) {
  cell.title = row.place_terms_source || "";
  cell.replaceChildren();
  if (row.trophy) {
    const colours = { gold: "#ffd65a", silver: "#c9d3df", bronze: "#cd8a55" };
    const labels = { gold: "Winner", silver: "Second place", bronze: "Third place - paid dividend" };
    const document = cell.ownerDocument;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "26");
    svg.setAttribute("height", "26");
    svg.setAttribute("class", `live-result-trophy live-result-trophy-${row.trophy}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", labels[row.trophy]);
    const title = document.createElementNS(svg.namespaceURI, "title");
    title.textContent = labels[row.trophy];
    svg.append(title);
    for (const [shape, fill] of [
      ["M7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4", "none"],
      ["M7 3h10v5a5 5 0 0 1-10 0Z", colours[row.trophy]],
      ["M11 13h2v5h3v3H8v-3h3Z", colours[row.trophy]],
    ]) {
      const path = document.createElementNS(svg.namespaceURI, "path");
      path.setAttribute("d", shape);
      path.setAttribute("fill", fill);
      path.setAttribute("stroke", colours[row.trophy]);
      path.setAttribute("stroke-width", "1.5");
      svg.append(path);
    }
    cell.append(svg);
  }
  cell.append(cell.ownerDocument.createTextNode(resultText(row, betting)));
}

export function validateLiveResults(data, expectedDate, now = Date.now()) {
  if (!data || data.schema_version !== 1 || data.business_date !== expectedDate ||
      expectedDate !== businessDate(now) || !data.systems || !Array.isArray(data.summaries)) {
    throw new Error("Today's matching live results are unavailable");
  }
  for (const system of Object.values(data.systems)) {
    if (!system || !Number.isFinite(system.profit_units) || !Number.isInteger(system.pending) ||
        system.pending < 0 || !Array.isArray(system.rows)) throw new Error("Incomplete live result totals");
  }
  for (const row of [...data.summaries, ...Object.values(data.systems).flatMap(system => system.rows)]) {
    if (!row || typeof row.venue !== "string" || !row.venue || !Number.isInteger(row.number) ||
        row.number < 1 || !Number.isInteger(row.runner_number) || row.runner_number < 1 ||
        typeof row.horse !== "string" || !row.horse || typeof row.label !== "string" ||
        !["pending", "interim", "final", "refunded"].includes(row.status) ||
        (row.trophy !== undefined && row.trophy !== null && !["gold", "silver", "bronze"].includes(row.trophy)) ||
        (row.profit_units !== undefined && row.profit_units !== null && !Number.isFinite(row.profit_units))) {
      throw new Error("Invalid live result identity or settlement");
    }
  }
}

export function mountLiveResults(script) {
  const sections = [];
  for (const [id, product] of Object.entries(SECTIONS)) {
    const section = document.getElementById(id);
    if (!section) continue;
    const heading = section.querySelector("h2");
    const net = document.createElement("span");
    net.className = "live-result-net";
    if (product && heading) heading.append(net);
    const status = document.createElement("p");
    status.className = "live-result-status";
    status.setAttribute("role", "status");
    status.textContent = "Live results: awaiting first check.";
    section.querySelector(".content")?.prepend(status);
    const rows = [];
    for (const table of section.querySelectorAll(".table-wrap > table")) {
      const header = table.querySelector("thead tr");
      if (header) {
        const column = document.createElement("th");
        column.textContent = product ? "Result / net units" : "Result";
        header.append(column);
      }
      for (const row of table.querySelectorAll("tbody > tr")) {
        const race = row.cells[0]?.textContent.match(/^(.+?) R(\d+)(?:\s|$)/);
        const runner = row.cells[1]?.querySelector(".runner-identity strong")?.textContent.match(/^#(\d+)\s+(.+)/);
        if (!race || !runner) continue;
        const cell = document.createElement("td");
        cell.className = "live-result-cell";
        cell.textContent = "Pending";
        row.append(cell);
        rows.push({ venue: race[1], number: Number(race[2]), runnerNumber: Number(runner[1]),
          horse: runner[2].trim(), cell });
      }
    }
    sections.push({ product, net, status, rows });
  }
  let busy = false;
  async function refresh() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const response = await fetch(script.dataset.resultsUrl, {
        credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok || response.redirected ||
          !response.headers.get("Content-Type")?.includes("application/json")) {
        throw new Error("Live results are temporarily unavailable. Refresh or sign in again.");
      }
      const data = await response.json();
      validateLiveResults(data, script.dataset.businessDate);
      const checked = Date.parse(data.checked_at);
      const delayed = data.error || !Number.isFinite(checked) || Date.now() - checked > 10 * 60000;
      for (const section of sections) {
        const system = section.product ? data.systems[section.product] : null;
        if (section.product && !system) throw new Error("Results do not cover the visible betting system");
        const reported = system ? system.rows : data.summaries;
        if (system) {
          section.net.textContent = ` ${formatNet(system.profit_units)}`;
          section.net.classList.toggle("live-result-loss", system.profit_units < 0);
          section.net.title = data.price_basis;
        }
        section.status.textContent = delayed ? "Live result updates are delayed; shown totals are confirmed results only." :
          `Final results only${system?.pending ? ` \u00b7 ${system.pending} pending` : ""}. ` +
          "First check 10 minutes after confirmed start/closure; interim results do not enter totals.";
        section.status.title = data.price_basis;
        for (const row of section.rows) {
          const result = reported.find(item => item.venue === row.venue && item.number === row.number &&
            item.runner_number === row.runnerNumber && item.horse === row.horse);
          if (!result) {
            console.error("Live result row does not match the published selection:", row.venue, row.number, row.horse);
            row.cell.textContent = "Result identity needs review";
            continue;
          }
          renderResult(row.cell, result, Boolean(section.product));
          row.cell.classList.toggle("live-result-loss", result?.profit_units < 0);
        }
      }
    } catch (error) {
      console.error("TrackIQ live results:", error);
      sections.forEach(section => { section.status.textContent = error.message; });
    } finally { busy = false; }
  }
  refresh();
  const timer = setInterval(refresh, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
}

if (typeof document !== "undefined") {
  const script = document.querySelector('script[data-results-url]');
  if (script) mountLiveResults(script);
}

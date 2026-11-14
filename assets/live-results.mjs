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
  const retry = row.status === "pending" && row.next_check_at ? " \u00b7 auto-rechecking" : "";
  return row.label + interim + retry + (betting && Number.isFinite(row.profit_units) ?
    ` \u00b7 ${formatNet(row.profit_units)}` : "");
}

export function renderResult(cell, row, betting) {
  cell.title = row.place_terms_source || "";
  if (row.estimated_loss) {
    cell.title = [cell.title, "Interim estimate from final paid-place results, not a confirmed finishing position. The full field may confirm the loss or report a scratching/refund."].filter(Boolean).join("\n");
  }
  if (row.next_check_at && ["pending", "interim"].includes(row.status)) {
    const format = value => new Date(value).toLocaleString("en-AU", {
      timeZone: "Australia/Sydney", day: "numeric", month: "short",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
    });
    const checks = (row.last_checked_at ? `Last automatic check: ${format(row.last_checked_at)}. ` : "") +
      `Next automatic check due: ${format(row.next_check_at)}.`;
    cell.title = [cell.title, checks].filter(Boolean).join("\n");
  }
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

export function scoreQuaddieLeg(race, selections) {
  if (!race) throw new Error("Quaddie race is not covered by the verified daily results");
  if (race.status !== "final") return { status: race.status, winning_numbers: [] };
  if (!race.winners.length) throw new Error("Final quaddie winner is unavailable");
  const matched = [];
  for (const winner of race.winners) {
    const selection = selections.find(runner => runner.number === winner.number);
    if (selection && selection.name !== winner.name) throw new Error("Quaddie winner identity needs review");
    if (selection) matched.push(winner.number);
  }
  return { status: matched.length ? "won" : "lost", winning_numbers: matched };
}

export function renderQuaddieLeg(row, race) {
  const runners = [...row.querySelectorAll("[data-quaddie-number]")];
  const score = scoreQuaddieLeg(race, runners.map(runner => ({
    number: Number(runner.dataset.quaddieNumber), name: runner.dataset.quaddieHorse,
  })));
  for (const runner of runners) {
    const won = score.winning_numbers.includes(Number(runner.dataset.quaddieNumber));
    const check = runner.querySelector(".live-quaddie-check");
    check.textContent = won ? " \u2713" : "";
    if (won) check.setAttribute("aria-label", "Won this quaddie leg");
    else check.removeAttribute("aria-label");
  }
  const end = row.querySelector(".live-quaddie-leg-result");
  end.classList.toggle("live-quaddie-miss", score.status === "lost");
  end.textContent = ({ lost: " \u2717", pending: " (pending)", interim: " (interim)",
    refunded: " (abandoned)" })[score.status] || "";
  end.setAttribute("aria-label", score.status === "lost" ? "No selected horse won this leg" :
    score.status === "won" ? "Selected winner in this leg" : end.textContent.trim());
}

export function renderHotTracks(host, tracks, date, storage) {
  return renderHotAlerts(host, tracks, date, storage, "track");
}

export function renderHotSystems(host, systems, date, storage) {
  return renderHotAlerts(host, systems, date, storage, "system");
}

function renderHotAlerts(host, items, date, storage, kind) {
  const system = kind === "system";
  const signature = JSON.stringify([date, items]);
  if (host.dataset.hotSignature === signature) return;
  host.replaceChildren();
  const doc = host.ownerDocument;
  for (const item of items) {
    const name = system ? item.system : item.venue;
    const key = `trackiq-hot-${system ? "system-" : ""}dismissed:${date}:${name}`;
    if (storage.getItem(key) === "1") continue;
    const card = doc.createElement("aside");
    card.className = `hot-${kind}-alert`;
    card.setAttribute("role", "status");
    card.style.cssText = "position:relative;margin:16px 0;padding:18px 56px 18px 20px;" +
      "border:1px solid #d9a843;border-radius:14px;background:#26221a;color:#f3f3f3;";
    const title = doc.createElement("strong");
    title.style.cssText = "display:block;color:#ffd65a;font-size:18px;margin-bottom:8px;";
    title.textContent = `\uD83D\uDD25 ${system ? "HOT SYSTEM" : "TrackIQ HOT TRACK ALERT"} \u2014 ${name}`;
    const score = doc.createElement("p");
    score.style.cssText = "margin:0 0 8px;font-size:16px;font-weight:600;";
    score.textContent = system ?
      `${item.wins} winners from ${item.settled_races} settled races \u00b7 ${formatNet(item.profit_units)}` :
      `${item.wins} winners, ${item.seconds} ${item.seconds === 1 ? "second" : "seconds"} from ${item.final_races} races`;
    const basis = doc.createElement("small");
    basis.textContent = system ? "Published morning odds. Each system is assessed separately." :
      "Top-ranked TrackIQ runners in final races.";
    const close = doc.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", `Dismiss ${name} HOT ${system ? "System" : "Track"} alert for today`);
    close.style.cssText = "position:absolute;right:16px;top:12px;background:transparent;" +
      "border:0;color:#f3f3f3;font-size:26px;cursor:pointer;";
    close.textContent = "\u00D7";
    close.addEventListener("click", () => {
      try {
        storage.setItem(key, "1");
      } catch (error) {
        console.error(`HOT ${system ? "System" : "Track"} dismissal could not be saved:`, error);
      }
      card.remove();
      host.hidden = !host.children.length;
    });
    card.append(title, score, basis, close);
    host.append(card);
  }
  host.dataset.hotSignature = signature;
  host.hidden = !host.children.length;
}

export function validateLiveResults(data, expectedDate, now = Date.now()) {
  if (!data || data.schema_version !== 1 || data.business_date !== expectedDate ||
      expectedDate !== businessDate(now) || !data.systems || !Array.isArray(data.summaries)) {
    throw new Error("Today's matching live results are unavailable");
  }
  for (const system of Object.values(data.systems)) {
    if (!system || !Number.isFinite(system.profit_units) || !Number.isInteger(system.pending) ||
        system.pending < 0 || !Number.isInteger(system.interim) || system.interim < 0 ||
        !Array.isArray(system.rows)) throw new Error("Incomplete live result totals");
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
    if ([row.last_checked_at, row.next_check_at]
      .some(value => value != null && !Number.isFinite(Date.parse(value)))) {
      throw new Error("Invalid automatic result retry time");
    }
    if (row.estimated_loss !== undefined && (row.estimated_loss !== true ||
        row.status !== "interim" || row.label !== "Unplaced" ||
        (row.profit_units !== undefined && !(row.profit_units <= 0)))) {
      throw new Error("Invalid interim unplaced estimate");
    }
  }
  if (!Array.isArray(data.quaddie_races)) throw new Error("Quaddie race results are unavailable");
  for (const race of data.quaddie_races) {
    if (!race || typeof race.venue !== "string" || !race.venue || !Number.isInteger(race.number) ||
        race.number < 1 || !["pending", "interim", "final", "refunded"].includes(race.status) ||
        !Array.isArray(race.winners) || (race.status === "final" && !race.winners.length) ||
        race.winners.some(runner => !Number.isInteger(runner.number) || runner.number < 1 ||
          typeof runner.name !== "string" || !runner.name)) {
      throw new Error("Invalid quaddie race identity or winner");
    }
  }
  if (!Array.isArray(data.hot_tracks)) throw new Error("HOT Track results are unavailable");
  for (const track of data.hot_tracks) {
    if (!track || typeof track.venue !== "string" || !track.venue ||
        !Number.isInteger(track.final_races) || track.final_races < 5 ||
        !Number.isInteger(track.wins) || track.wins < 2 ||
        !Number.isInteger(track.seconds) || track.seconds < 0 ||
        track.wins + track.seconds > track.final_races ||
        (track.wins + track.seconds) * 5 < track.final_races * 4) {
      throw new Error("Invalid HOT Track counts or threshold");
    }
  }
  if (!Array.isArray(data.hot_systems)) throw new Error("HOT System results are unavailable");
  const seen = new Set();
  for (const system of data.hot_systems) {
    if (!system || !Object.values(SECTIONS).includes(system.system) || !data.systems[system.system] ||
        seen.has(system.system) || !Number.isInteger(system.settled_races) ||
        !Number.isInteger(system.wins) || system.wins < 2 || system.wins > system.settled_races ||
        system.wins * 3 < system.settled_races * 2 ||
        !Number.isFinite(system.profit_units) || system.profit_units <= 0) {
      throw new Error("Invalid HOT System counts, threshold or net units");
    }
    seen.add(system.system);
  }
}

export function mountLiveResults(script) {
  let hotHost = null, systemHost = null;
  const dismissedAlerts = new Map();
  const hotStorage = {
    getItem(key) {
      if (dismissedAlerts.has(key)) return dismissedAlerts.get(key);
      try {
        return hotHost.ownerDocument.defaultView.sessionStorage.getItem(key);
      } catch (error) {
        console.error("HOT alert dismissal storage is unavailable:", error);
        return null;
      }
    },
    setItem(key, value) {
      dismissedAlerts.set(key, value);
      hotHost.ownerDocument.defaultView.sessionStorage.setItem(key, value);
    },
  };
  if (script.dataset.resultsUrl === "/premium-content/pro/live-results.json") {
    const owner = window.frameElement?.ownerDocument || document;
    hotHost = owner.getElementById("trackiq-hot-tracks");
    if (!hotHost) {
      hotHost = owner.createElement("div");
      hotHost.id = "trackiq-hot-tracks";
      hotHost.setAttribute("aria-label", "TrackIQ Hot Track alerts");
      const racing = owner.getElementById("next-race-dashboard") || owner.querySelector(".wrap");
      if (racing) racing.before(hotHost);
      else owner.body.prepend(hotHost);
    }
    hotHost.hidden = true;
    systemHost = owner.getElementById("trackiq-hot-systems");
    if (!systemHost) {
      systemHost = owner.createElement("div");
      systemHost.id = "trackiq-hot-systems";
      systemHost.setAttribute("aria-label", "Hot betting system alerts");
      hotHost.after(systemHost);
    }
    systemHost.hidden = true;
  }
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
  const quaddieRows = [...document.querySelectorAll("tr[data-quaddie-venue]")];
  const quaddieStatuses = [...new Set(quaddieRows.map(row => row.closest("section")))].map(section => {
    const status = document.createElement("p");
    status.className = "live-result-status";
    status.setAttribute("role", "status");
    status.textContent = "Quaddie legs: awaiting final results.";
    section.querySelector(".content").prepend(status);
    return status;
  });
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
          section.net.textContent = ` ${formatNet(system.profit_units)}${system.interim ? " (interim)" : ""}`;
          section.net.classList.toggle("live-result-loss", system.profit_units < 0);
          section.net.title = data.price_basis;
        }
        section.status.textContent = delayed ?
          "Live result updates are delayed; shown results may include labelled interim unplaced estimates." :
          (system ? (system.interim ? `${system.interim} interim unplaced ${system.interim === 1 ? "estimate" : "estimates"} included in total` :
            "Confirmed settlements only") + (system.pending ? ` \u00b7 ${system.pending} pending` : "") :
            "Interim finishes are labelled") + ". " +
          "First check 10 minutes after confirmed start/closure; exact finishes and any refunds update automatically.";
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
      for (const status of quaddieStatuses) status.textContent = delayed ?
        "Quaddie updates are delayed; marks show confirmed final results only." :
        "Final results only: a green tick marks a selected winner; a red cross marks a losing leg.";
      for (const row of quaddieRows) {
        const race = data.quaddie_races.find(result => result.venue === row.dataset.quaddieVenue &&
          result.number === Number(row.dataset.quaddieRace));
        renderQuaddieLeg(row, race);
      }
      if (hotHost) renderHotTracks(hotHost, delayed ? [] : data.hot_tracks, data.business_date, hotStorage);
      if (systemHost) renderHotSystems(systemHost, delayed ? [] : data.hot_systems, data.business_date, hotStorage);
    } catch (error) {
      console.error("TrackIQ live results:", error);
      if (hotHost) {
        hotHost.replaceChildren();
        delete hotHost.dataset.hotSignature;
        hotHost.hidden = true;
      }
      if (systemHost) {
        systemHost.replaceChildren();
        delete systemHost.dataset.hotSignature;
        systemHost.hidden = true;
      }
      sections.forEach(section => { section.status.textContent = error.message; });
      quaddieStatuses.forEach(status => { status.textContent = error.message; });
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

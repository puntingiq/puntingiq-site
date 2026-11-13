export function businessDate(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(now));
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type).value).join("-");
}

export function isClosed(race) {
  return Boolean(race.inplay_at || race.market_closed_at ||
    /^(abandoned|cancelled|canceled|postponed|results?|final|closed|finished|inplay|in.play)$/i.test(race.status));
}

export function mergeRace(saved, live, now, maxQuoteAge = 900) {
  if (saved.venue_key !== live.venue_key || saved.number !== live.number) {
    throw new Error("Live race identity does not match the TrackIQ export");
  }
  const locals = new Map(saved.runners.map(runner => [runner.number, runner]));
  const scratched = live.scratchings || [];
  const runners = live.runners.filter(runner => !scratched.some(s =>
    s.number === runner.number || s.name_key === runner.name_key)).map(runner => {
    const local = locals.get(runner.number);
    if (local && local.name_key !== runner.name_key) {
      throw new Error(`Runner identity mismatch: ${saved.venue} R${saved.number} #${runner.number}`);
    }
    const observed = Date.parse(runner.win?.observed_at);
    const win = runner.win && Number.isFinite(observed) && observed <= now + 1000 &&
      now - observed <= maxQuoteAge * 1000 && Number.isFinite(runner.win.price) &&
      runner.win.price > 1 ? runner.win : null;
    return {
      ...runner, win, silk_url: local?.silk_url || "",
      win_probability: local?.win_probability ?? null,
      advised_prices: local?.advised_prices || null,
      selections: local?.selections || [],
    };
  });
  const ranked = runners.filter(runner => Number.isFinite(runner.win_probability) &&
    runner.win_probability > 0 && runner.win_probability <= 1).sort((a, b) =>
    b.win_probability - a.win_probability || a.number - b.number);
  const modelRanks = new Map(ranked.map((runner, index) => [runner.number, index + 1]));
  const priced = runners.filter(runner => runner.win).sort((a, b) =>
    a.win.price - b.win.price || a.number - b.number);
  const marketRanks = new Map(priced.map((runner, index) => [runner.number, index + 1]));
  const marketComplete = priced.length === runners.length && runners.length > 0;
  return {
    ...saved, start_time: live.start_time, live, runners, modelRanks, marketRanks,
    model: ranked.slice(0, 4), market: marketComplete ? priced.slice(0, 4) : [],
    marketComplete, selectedCount: runners.filter(runner => runner.selections.length).length,
    scratchings: scratched, closed: isClosed(live),
  };
}

export function createDashboard(daily, feed, now = Date.now()) {
  const today = businessDate(now);
  if (daily.schema_version !== 1 || feed.schema_version !== 1 ||
      daily.business_date !== today || feed.business_date !== today) {
    throw new Error("Today's verified TrackIQ data is not available. Please contact Support.");
  }
  if (!Array.isArray(daily.races) || !daily.races.length || !Array.isArray(feed.races)) {
    throw new Error("The race dashboard received incomplete data.");
  }
  const fetched = Date.parse(feed.fetched_at);
  if (!Number.isFinite(fetched) || fetched > now + 60000 || now - fetched > 180000) {
    throw new Error("Live race updates are delayed. Please refresh shortly.");
  }
  const liveMap = new Map();
  const savedKeys = new Set(daily.races.map(race => `${race.venue_key}:${race.number}`));
  for (const race of feed.races) {
    const key = `${race.venue_key}:${race.number}`;
    if (liveMap.has(key)) throw new Error("Conflicting live races; the dashboard needs a data refresh.");
    if (!savedKeys.has(key)) throw new Error("Today's TrackIQ export does not cover all live races. Please contact Support.");
    liveMap.set(key, race);
  }
  const races = daily.races.filter(race => liveMap.has(`${race.venue_key}:${race.number}`))
    .map(race => mergeRace(race, liveMap.get(`${race.venue_key}:${race.number}`),
      now, feed.max_quote_age_seconds))
    .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time) ||
      a.venue.localeCompare(b.venue, "en-AU") || a.number - b.number);
  const upcoming = races.filter(race => !race.closed);
  const nextTime = upcoming[0]?.start_time;
  const next = upcoming.filter(race => Date.parse(race.start_time) === Date.parse(nextTime));
  return { races, upcoming, next };
}

function node(tag, className = "", text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

function time(value, seconds = false) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney", hour: "2-digit", minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}), timeZoneName: "short",
  }).format(new Date(value));
}

function silk(runner) {
  if (!runner.silk_url) return node("span", "nr-silk-placeholder", `#${runner.number}`);
  const image = node("img", "nr-silk");
  const url = new URL(runner.silk_url, "https://puntingiq.com.au");
  if (url.protocol !== "https:") return node("span", "nr-silk-placeholder", `#${runner.number}`);
  image.src = url.href;
  image.alt = "";
  image.loading = "lazy";
  image.addEventListener("error", () => image.replaceWith(node("span", "nr-silk-placeholder", `#${runner.number}`)), { once: true });
  return image;
}

function badges(runner, overlap) {
  const group = node("div", "nr-badges");
  if (overlap) group.append(node("span", "nr-overlap", "Model + Market"));
  for (const selection of runner.selections) group.append(node("span", "nr-system", selection.system));
  return group;
}

function raceStatus(view, now) {
  if (view.live.inplay_at) return "Underway";
  if (view.live.market_closed_at) return "Market closed";
  if (view.closed) return view.live.status || "Closed";
  return Date.parse(view.start_time) <= now ? "Awaiting start confirmation" : "Scheduled";
}

export function raceDetails(view, now = Date.now()) {
  return [
    view.distance || "Distance unavailable",
    view.live.track_condition?.trim() || "Track condition unavailable",
    time(view.start_time), raceStatus(view, now),
  ].join(" · ");
}

export function raceWeather(view) {
  return view.live.weather ? `Weather (PuntersEdge): ${view.live.weather}` :
    "Weather: not reported by the race feed";
}

export function raceCountdown(view, now = Date.now()) {
  if (view.closed) return raceStatus(view, now);
  const seconds = Math.ceil((Date.parse(view.start_time) - now) / 1000);
  if (seconds <= 0) return "Awaiting start";
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

async function loadJSON(url) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store",
    headers: { Accept: "application/json" }, signal: AbortSignal.timeout(25000) });
  if (response.redirected || !response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Please sign in again to access the Pro race dashboard.");
  }
  if (!response.ok) throw new Error(response.status === 403 ?
    "Pro membership is required for the race dashboard." : "Live race data is temporarily unavailable. Please try again shortly.");
  return response.json();
}

export function mountDashboard(root) {
  let daily = null, feed = null, loadedAt = 0, selectedId = null, dashboard = null;
  let refreshTimer, busy = false;
  const status = root.querySelector(".nr-message");
  const content = root.querySelector(".nr-content");
  const select = root.querySelector(".nr-select");
  const retry = root.querySelector(".nr-refresh");
  const jumpBanner = root.querySelector(".nr-jump-banner");
  const jumpList = root.querySelector(".nr-jump-list");
  const jumpPrev = root.querySelector(".nr-jump-prev");
  const jumpNext = root.querySelector(".nr-jump-next");
  const jumpClocks = new Map();

  function showError(error) {
    console.error("TrackIQ Next Race:", error);
    status.textContent = error.message;
    status.hidden = false;
    status.classList.add("nr-error");
    content.hidden = true;
    jumpBanner.hidden = true;
    dashboard = null;
  }

  function updateJumpControls() {
    jumpPrev.disabled = jumpList.scrollLeft <= 1;
    jumpNext.disabled = jumpList.scrollLeft + jumpList.clientWidth >= jumpList.scrollWidth - 1;
  }

  function renderJumpBanner() {
    const focusedId = jumpList.contains(document.activeElement) ?
      document.activeElement.dataset.raceId : null;
    const scrollLeft = jumpList.scrollLeft;
    jumpList.replaceChildren();
    jumpClocks.clear();
    jumpBanner.hidden = false;
    for (const race of dashboard.upcoming) {
      const tile = node("button", "nr-jump-tile" + (race.id === selectedId ? " nr-jump-selected" : ""));
      tile.type = "button";
      tile.dataset.raceId = race.id;
      tile.setAttribute("aria-pressed", String(race.id === selectedId));
      tile.setAttribute("aria-controls", "nr-race-card");
      tile.setAttribute("aria-label", `${race.venue} race ${race.number}, scheduled ${time(race.start_time)}. Show TrackIQ picks.`);
      tile.title = `${race.venue} R${race.number} · ${time(race.start_time)}` +
        (race.selectedCount ? " · Published system selection" : "");
      const icon = node("span", "nr-jump-icon", "\u265e");
      icon.setAttribute("aria-hidden", "true");
      const label = node("span", "nr-jump-name", `R${race.number} ${race.venue}`);
      if (race.selectedCount) {
        label.append(node("small", "nr-jump-tip", "System selection"));
      }
      const clock = node("span", "nr-jump-clock");
      jumpClocks.set(race.id, clock);
      tile.append(icon, label, clock);
      tile.addEventListener("click", () => { selectedId = race.id; render(); });
      jumpList.append(tile);
    }
    if (!dashboard.upcoming.length) {
      jumpList.append(node("span", "nr-jump-empty", "No upcoming AU horse races reported."));
    }
    jumpList.scrollLeft = scrollLeft;
    if (focusedId) {
      [...jumpList.children].find(tile => tile.dataset.raceId === focusedId)?.focus({ preventScroll: true });
    }
    updateJumpControls();
  }

  function renderSelected() {
    if (!dashboard) return;
    const view = dashboard.races.find(race => race.id === selectedId);
    const card = root.querySelector(".nr-race");
    card.replaceChildren();
    if (!view) {
      card.append(node("p", "nr-notice", selectedId ?
        "This race is no longer in the live feed. Choose another race; its current status cannot be confirmed." :
        "No upcoming Australian thoroughbred races are currently reported by PuntersEdge."));
      return;
    }
    const now = Date.now();
    const heading = node("div", "nr-race-heading");
    const details = node("div");
    details.append(node("div", "nr-eyebrow", "Australian thoroughbreds"),
      node("h3", "", `${view.venue} R${view.number}`),
      node("p", "nr-muted", raceDetails(view, now)),
      node("p", "nr-muted nr-weather", raceWeather(view)));
    const clock = node("div", "nr-clock");
    clock.append(node("small", "", "Scheduled countdown"), node("strong", "nr-countdown", ""),
      node("small", "", "Race status, not zero, controls progression"));
    heading.append(details, clock);
    const freshness = node("div", "nr-freshness");
    for (const [label, value] of [
      ["Live feed checked", time(feed.fetched_at, true)],
      ["TrackIQ export", `${daily.business_date} · ${time(daily.generated_at)}`],
      ["Active field", `${view.runners.length} runners · ${view.scratchings.length} scratchings reported`],
    ]) {
      const item = node("div");
      item.append(node("small", "", label), node("strong", "", value));
      freshness.append(item);
    }
    const market = node("section", "nr-market");
    market.append(node("h4", "", "Market Top Four"),
      node("p", "nr-muted", "Shortest-priced active runners, ranked using each runner's best available fresh WIN quote. Not additional betting recommendations."));
    const marketGrid = node("div", "nr-market-grid");
    if (!view.marketComplete) {
      marketGrid.append(node("p", "nr-notice", "Market comparison is waiting for a complete fresh price snapshot."));
    }
    view.market.forEach((runner, index) => {
      const overlap = view.model.some(model => model.number === runner.number);
      const tile = node("article", "nr-market-card" + (overlap ? " nr-matched" : ""));
      const top = node("div", "nr-market-top");
      top.append(node("span", "nr-eyebrow", `Market #${index + 1}`),
        node("strong", "nr-price", `$${runner.win.price.toFixed(2)}`));
      const horse = node("div", "nr-horse");
      const identity = node("div");
      identity.append(node("strong", "", `#${runner.number} ${runner.name}`),
        node("small", "nr-muted", runner.win.bookmaker));
      horse.append(silk(runner), identity);
      const probability = runner.win_probability === null ? "No verified TrackIQ rating" :
        `Model ${(runner.win_probability * 100).toFixed(1)}% · TrackIQ rank #${view.modelRanks.get(runner.number)}`;
      tile.append(top, horse, node("p", "nr-market-profile", probability), badges(runner, overlap));
      if (!overlap) tile.append(node("small", "nr-muted", "Outside TrackIQ top four"));
      marketGrid.append(tile);
    });
    market.append(marketGrid);
    const picks = node("section", "nr-picks");
    const pickHeading = node("div", "nr-pick-heading");
    pickHeading.append(node("h4", "", "TrackIQ Top Four Picks"),
      node("span", "nr-muted", "Ranked by model win probability"));
    picks.append(pickHeading);
    const tableHeader = node("div", "nr-table-head");
    for (const text of ["Rank", "Runner / market rank", "Model win", "Published systems", "WIN price"]) {
      tableHeader.append(node("span", "", text));
    }
    picks.append(tableHeader);
    if (!view.model.length) picks.append(node("p", "nr-notice", "The active field has no remaining verified TrackIQ-ranked runners. Review the full brief below."));
    view.model.forEach((runner, index) => {
      const row = node("article", "nr-runner" + (runner.selections.length ? " nr-tip" : ""));
      const horse = node("div", "nr-horse");
      const identity = node("div");
      const marketRank = view.marketComplete ? view.marketRanks.get(runner.number) : null;
      identity.append(node("strong", "", runner.name),
        node("small", "nr-muted", `#${runner.number}` + (marketRank ? ` · Market #${marketRank}` : "")));
      const overlap = view.market.some(marketRunner => marketRunner.number === runner.number);
      if (overlap) identity.append(node("span", "nr-overlap", "Model + Market"));
      horse.append(silk(runner), identity);
      const systems = node("div", "nr-runner-systems");
      systems.append(badges(runner, false));
      if (!runner.selections.length) systems.append(node("span", "nr-shortlist", "TrackIQ shortlist"),
        node("small", "nr-muted", "No published system selection"));
      for (const selection of runner.selections) {
        const price = selection.win_odds ? ` · Published WIN $${selection.win_odds.toFixed(2)}` : "";
        systems.append(node("small", "nr-advice", `${selection.system}: ${selection.advice}${price}`));
      }
      const prices = node("div", "nr-runner-price");
      prices.append(node("strong", "nr-price", runner.win ? `$${runner.win.price.toFixed(2)}` : "Refresh needed"),
        node("small", "nr-muted", runner.win ? `${runner.win.bookmaker} · ${time(runner.win.observed_at, true)}` : "No fresh live WIN quote"));
      if (runner.selections.length && runner.advised_prices?.win_odds) {
        prices.append(node("small", "nr-muted", `Morning WIN $${runner.advised_prices.win_odds.toFixed(2)}`));
      }
      row.append(node("span", "nr-rank", String(index + 1).padStart(2, "0")), horse,
        node("strong", "nr-probability", `${(runner.win_probability * 100).toFixed(1)}%`), systems, prices);
      picks.append(row);
    });
    const others = view.runners.filter(runner => runner.selections.length &&
      !view.model.some(model => model.number === runner.number));
    if (others.length) {
      const more = node("details", "nr-other-selections");
      more.append(node("summary", "", `Other published selections in this race (${others.length})`));
      for (const runner of others) {
        const entry = node("div");
        entry.append(node("strong", "", `#${runner.number} ${runner.name}`), badges(runner, false));
        runner.selections.forEach(selection => entry.append(node("small", "nr-advice", `${selection.system}: ${selection.advice}`)));
        more.append(entry);
      }
      picks.append(more);
    }
    card.append(heading, freshness, market, picks,
      node("p", "nr-footer", "Live WIN prices, scratchings and race-weather reports: PuntersEdge. TrackIQ probabilities and published system advice: today's morning export. A shortlist or Model + Market badge is not a new betting recommendation. Check current prices and deductions before betting."));
  }

  function updateClock() {
    if (!dashboard) return;
    const now = Date.now();
    for (const race of dashboard.upcoming) {
      const clock = jumpClocks.get(race.id);
      if (!clock) continue;
      const seconds = (Date.parse(race.start_time) - now) / 1000;
      clock.textContent = raceCountdown(race, now);
      clock.classList.toggle("nr-jump-soon", seconds > 0 && seconds <= 300);
      clock.classList.toggle("nr-jump-awaiting", seconds <= 0);
    }
    const view = dashboard.races.find(race => race.id === selectedId);
    const clock = root.querySelector(".nr-countdown");
    if (!view || !clock) return;
    const seconds = Math.ceil((Date.parse(view.start_time) - Date.now()) / 1000);
    if (view.closed || seconds <= 0) {
      clock.textContent = raceStatus(view, Date.now());
      return;
    }
    const hours = Math.floor(seconds / 3600);
    clock.textContent = (hours ? `${hours}h ` : "") +
      `${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function render() {
    dashboard = createDashboard(daily, feed);
    if (selectedId === null) selectedId = dashboard.upcoming[0]?.id || null;
    select.replaceChildren();
    const choices = [...dashboard.upcoming];
    const current = dashboard.races.find(race => race.id === selectedId);
    if (current && !choices.some(race => race.id === current.id)) choices.push(current);
    for (const race of choices) {
      const option = node("option", "", `${race.venue} R${race.number} · ${time(race.start_time)}` +
        (race.selectedCount ? ` · ${race.selectedCount} published selection${race.selectedCount === 1 ? "" : "s"}` : ""));
      option.value = race.id;
      select.append(option);
    }
    select.value = selectedId || "";
    select.disabled = !choices.length;
    const next = root.querySelector(".nr-next-tabs");
    next.replaceChildren();
    root.querySelector(".nr-next-label").textContent = dashboard.next.length > 1 ? "Next to jump · same scheduled start" : "Next to jump";
    for (const race of dashboard.next) {
      const button = node("button", "nr-tab" + (selectedId === race.id ? " nr-tab-active" : ""),
        `${race.venue} R${race.number}` + (race.selectedCount ? " · System selection" : ""));
      button.type = "button";
      button.setAttribute("aria-pressed", String(selectedId === race.id));
      button.addEventListener("click", () => { selectedId = race.id; render(); });
      next.append(button);
    }
    status.hidden = true;
    status.classList.remove("nr-error");
    content.hidden = false;
    renderJumpBanner();
    renderSelected();
    updateClock();
  }

  async function refresh() {
    if (busy) return;
    busy = true;
    retry.disabled = true;
    try {
      if (!daily || Date.now() - loadedAt > 300000 || daily.business_date !== businessDate()) {
        daily = await loadJSON(root.dataset.dailyUrl);
        loadedAt = Date.now();
      }
      feed = await loadJSON(root.dataset.liveUrl);
      render();
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
      retry.disabled = false;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refresh, 60000);
    }
  }

  select.addEventListener("change", () => { selectedId = select.value; render(); });
  jumpList.addEventListener("scroll", updateJumpControls, { passive: true });
  window.addEventListener("resize", updateJumpControls);
  for (const [button, direction] of [[jumpPrev, -1], [jumpNext, 1]]) {
    button.addEventListener("click", () => {
      jumpList.scrollBy({
        left: direction * Math.max(180, jumpList.clientWidth * 0.8),
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    });
  }
  root.querySelector(".nr-next-button").addEventListener("click", () => {
    selectedId = dashboard?.upcoming[0]?.id || null;
    if (dashboard) render();
  });
  retry.addEventListener("click", refresh);
  setInterval(() => {
    if (dashboard && (businessDate() !== daily.business_date || Date.now() - Date.parse(feed.fetched_at) > 180000)) {
      showError(new Error("Live race updates are delayed. Please refresh shortly."));
    } else if (dashboard) {
      const expired = dashboard.races.find(race => race.id === selectedId)?.runners.some(runner =>
        runner.win && Date.now() - Date.parse(runner.win.observed_at) > feed.max_quote_age_seconds * 1000);
      if (expired) {
        try { render(); } catch (error) { showError(error); }
      }
    }
    updateClock();
  }, 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  refresh();
}

if (typeof document !== "undefined") {
  const root = document.getElementById("next-race-dashboard");
  if (root) mountDashboard(root);
}

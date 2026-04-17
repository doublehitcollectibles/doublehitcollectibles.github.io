(function () {
  const app = document.querySelector("[data-collection-app]");

  if (!app) {
    return;
  }

  const apiBase = (app.dataset.apiBase || "").trim().replace(/\/$/, "");
  const directApiBase = (app.dataset.directApi || "https://api.pokemontcg.io/v2").replace(/\/$/, "");
  const ownedCardsUrl = app.dataset.ownedCardsUrl;

  const elements = {
    status: app.querySelector("[data-collection-status]"),
    summary: app.querySelector("[data-collection-summary]"),
    ownedGrid: app.querySelector("[data-owned-grid]"),
    ownedEmpty: app.querySelector("[data-owned-empty]"),
    searchForm: app.querySelector("[data-card-search-form]"),
    searchFeedback: app.querySelector("[data-search-feedback]"),
    searchResults: app.querySelector("[data-search-results]"),
    detailPanel: app.querySelector("[data-card-detail-panel]"),
  };

  const state = {
    ownedCollection: { collectionName: "Double Hit Collection", currency: "USD", cards: [] },
    ownedCards: [],
    searchResults: [],
    selectedCard: null,
    sourceMode: apiBase ? "worker" : "fallback",
  };

  const CARD_SELECT_FIELDS = [
    "id",
    "name",
    "supertype",
    "subtypes",
    "hp",
    "types",
    "evolvesFrom",
    "evolvesTo",
    "rules",
    "abilities",
    "attacks",
    "weaknesses",
    "resistances",
    "retreatCost",
    "convertedRetreatCost",
    "set",
    "number",
    "artist",
    "rarity",
    "flavorText",
    "nationalPokedexNumbers",
    "legalities",
    "regulationMark",
    "images",
    "tcgplayer",
    "cardmarket",
  ].join(",");

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatCurrency(value, currency) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return "N/A";
    }

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(value);
  }

  function formatPercent(value) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return "";
    }

    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  }

  function normalizeOwnedCollection(payload) {
    return {
      collectionName: payload?.collectionName || "Double Hit Collection",
      currency: payload?.currency || "USD",
      cards: Array.isArray(payload?.cards) ? payload.cards : [],
    };
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s#+-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function firstNumericPrice(values) {
    const candidates = Array.isArray(values) ? values : [];

    for (const value of candidates) {
      if (typeof value === "number" && !Number.isNaN(value)) {
        return value;
      }
    }

    return null;
  }

  function buildPokemonQuery(input) {
    const normalized = normalizeText(input);

    if (!normalized) {
      return "";
    }

    const tokens = normalized.split(" ").filter(Boolean);
    const cardNumber = tokens[tokens.length - 1];

    if (/^\d+[a-z]?$/i.test(cardNumber) && tokens.length > 1) {
      const cardName = tokens.slice(0, -1).join(" ");
      return `name:"${cardName}" number:"${cardNumber}"`;
    }

    if (tokens.length === 1) {
      return `name:${tokens[0]}*`;
    }

    return `name:"${normalized}"`;
  }

  function selectPrice(card, preferredPriceType) {
    const tcgplayerPrices = card?.tcgplayer?.prices || null;
    const cardmarket = card?.cardmarket?.prices || null;
    const preferredOrder = [
      preferredPriceType,
      "normal",
      "holofoil",
      "reverseHolofoil",
      "1stEditionHolofoil",
      "1stEditionNormal",
      "unlimitedHolofoil",
      "unlimitedNormal",
    ].filter(Boolean);

    if (tcgplayerPrices) {
      const availableTypes = Object.keys(tcgplayerPrices);
      const orderedTypes = [
        ...preferredOrder.filter((type) => availableTypes.includes(type)),
        ...availableTypes.filter((type) => !preferredOrder.includes(type)),
      ];

      for (const chosenType of orderedTypes) {
        const selected = tcgplayerPrices[chosenType];

        if (!selected) {
          continue;
        }

        const currentPrice = firstNumericPrice([
          selected.market,
          selected.mid,
          selected.low,
          selected.high,
          selected.directLow,
        ]);

        if (currentPrice == null) {
          continue;
        }

        return {
          priceType: chosenType,
          currency: "USD",
          currentPrice,
          sourceLabel: selected.market != null ? "TCGplayer Market" : "TCGplayer",
          metrics: {
            low: selected.low ?? null,
            mid: selected.mid ?? null,
            high: selected.high ?? null,
            market: selected.market ?? null,
            directLow: selected.directLow ?? null,
          },
          updatedAt: card?.tcgplayer?.updatedAt || null,
        };
      }
    }

    if (cardmarket) {
      const currentPrice = firstNumericPrice([
        cardmarket.avg30,
        cardmarket.trendPrice,
        cardmarket.averageSellPrice,
        cardmarket.lowPrice,
      ]);

      return {
        priceType: preferredPriceType || "averageSellPrice",
        currency: "EUR",
        currentPrice,
        sourceLabel: cardmarket.avg30 != null ? "Cardmarket Avg30" : "Cardmarket",
        metrics: {
          averageSellPrice: cardmarket.averageSellPrice ?? null,
          lowPrice: cardmarket.lowPrice ?? null,
          trendPrice: cardmarket.trendPrice ?? null,
          avg1: cardmarket.avg1 ?? null,
          avg7: cardmarket.avg7 ?? null,
          avg30: cardmarket.avg30 ?? null,
        },
        updatedAt: card?.cardmarket?.updatedAt || null,
      };
    }

    return {
      priceType: preferredPriceType || "unavailable",
      currency: "USD",
      currentPrice: null,
      sourceLabel: "Unavailable",
      metrics: {},
      updatedAt: null,
    };
  }

  function computeOwnershipMetrics(currentPrice, ownership) {
    const quantity = Number(ownership?.quantity || 1);
    const purchasePrice = ownership?.purchasePrice != null ? Number(ownership.purchasePrice) : null;

    if (purchasePrice == null || currentPrice == null) {
      return {
        quantity,
        purchasePrice,
        investedValue: purchasePrice != null ? purchasePrice * quantity : null,
        currentValue: currentPrice != null ? currentPrice * quantity : null,
        deltaAmount: null,
        deltaPercent: null,
      };
    }

    const investedValue = purchasePrice * quantity;
    const currentValue = currentPrice * quantity;
    const deltaAmount = currentValue - investedValue;
    const deltaPercent = investedValue > 0 ? (deltaAmount / investedValue) * 100 : null;

    return {
      quantity,
      purchasePrice,
      investedValue,
      currentValue,
      deltaAmount,
      deltaPercent,
    };
  }

  function mapCardPayload(card, ownership, history) {
    const pricing = selectPrice(card, ownership?.priceType);
    const setName = card?.set?.name || "Unknown Set";

    return {
      kind: "api",
      id: card.id,
      title: ownership?.label || card.name,
      cardName: card.name,
      subtitle: [setName, card?.rarity, card?.number].filter(Boolean).join(" | "),
      image: card?.images?.large || card?.images?.small || "",
      thumbnail: card?.images?.small || card?.images?.large || "",
      setName,
      rarity: card?.rarity || "Unknown",
      number: card?.number || "",
      artist: card?.artist || "",
      hp: card?.hp || null,
      types: card?.types || [],
      supertype: card?.supertype || "",
      subtypes: card?.subtypes || [],
      flavorText: card?.flavorText || "",
      legalities: card?.legalities || {},
      regulationMark: card?.regulationMark || "",
      abilities: card?.abilities || [],
      attacks: card?.attacks || [],
      weaknesses: card?.weaknesses || [],
      resistances: card?.resistances || [],
      retreatCost: card?.retreatCost || [],
      evolvesFrom: card?.evolvesFrom || null,
      evolvesTo: card?.evolvesTo || [],
      rules: card?.rules || [],
      nationalPokedexNumbers: card?.nationalPokedexNumbers || [],
      pricing,
      ownership: ownership || null,
      ownershipMetrics: computeOwnershipMetrics(pricing.currentPrice, ownership || null),
      history: Array.isArray(history) ? history : [],
    };
  }

  function mapCustomEntry(entry) {
    const currentPrice = entry.currentPrice != null ? Number(entry.currentPrice) : null;

    return {
      kind: "custom",
      id: entry.id || entry.label || entry.cardId || `custom-${Math.random().toString(36).slice(2)}`,
      title: entry.label || "Custom Collection Item",
      cardName: entry.label || "Custom Collection Item",
      subtitle: [entry.category, entry.series, entry.variant].filter(Boolean).join(" | "),
      image: entry.image || "",
      thumbnail: entry.image || "",
      setName: entry.series || "",
      rarity: entry.variant || "",
      number: entry.itemNumber || "",
      artist: entry.artist || "",
      hp: null,
      types: [],
      supertype: entry.category || "Collection Item",
      subtypes: [],
      flavorText: entry.description || "",
      legalities: {},
      regulationMark: "",
      abilities: [],
      attacks: [],
      weaknesses: [],
      resistances: [],
      retreatCost: [],
      evolvesFrom: null,
      evolvesTo: [],
      rules: [],
      nationalPokedexNumbers: [],
      pricing: {
        priceType: entry.priceType || "manual",
        currency: entry.currency || state.ownedCollection.currency || "USD",
        currentPrice,
        sourceLabel: entry.priceSource || "Manual Entry",
        metrics: {},
        updatedAt: entry.updatedAt || null,
      },
      ownership: entry,
      ownershipMetrics: computeOwnershipMetrics(currentPrice, entry),
      history: Array.isArray(entry.history) ? entry.history : [],
    };
  }

  function buildHistoryChart(history, currency) {
    if (!Array.isArray(history) || history.length < 2) {
      return `
        <div class="collection-history">
          <strong>Price History</strong>
          <p class="collection-history-caption">History will appear here as snapshots accumulate through the worker.</p>
        </div>
      `;
    }

    const values = history
      .map((point) => Number(point.marketPrice ?? point.price ?? 0))
      .filter((value) => value > 0);

    if (values.length < 2) {
      return `
        <div class="collection-history">
          <strong>Price History</strong>
          <p class="collection-history-caption">Not enough pricing snapshots yet to draw a trend line.</p>
        </div>
      `;
    }

    const width = 640;
    const height = 180;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const points = values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * width;
        const y = height - ((value - min) / range) * (height - 24) - 12;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

    const latest = values[values.length - 1];
    const earliest = values[0];
    const delta = latest - earliest;
    const percent = earliest > 0 ? (delta / earliest) * 100 : null;

    return `
      <div class="collection-history">
        <strong>Price History</strong>
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="collection-history-line" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="#ffd644"></stop>
              <stop offset="100%" stop-color="#ff4b23"></stop>
            </linearGradient>
          </defs>
          <polyline
            fill="none"
            stroke="url(#collection-history-line)"
            stroke-width="5"
            stroke-linecap="round"
            stroke-linejoin="round"
            points="${points}"
          ></polyline>
        </svg>
        <p class="collection-history-caption">
          ${formatCurrency(latest, currency)} current | ${delta >= 0 ? "+" : ""}${formatCurrency(delta, currency)} since first snapshot
          ${percent != null ? `(${formatPercent(percent)})` : ""}
        </p>
      </div>
    `;
  }

  function renderSummary(cards) {
    const collectionCards = cards.filter((card) => card.ownershipMetrics);
    const totalItems = collectionCards.reduce((sum, card) => sum + Number(card.ownershipMetrics.quantity || 0), 0);
    const investedValue = collectionCards.reduce((sum, card) => sum + Number(card.ownershipMetrics.investedValue || 0), 0);
    const currentValue = collectionCards.reduce((sum, card) => sum + Number(card.ownershipMetrics.currentValue || 0), 0);
    const deltaValue = currentValue - investedValue;
    const deltaPercent = investedValue > 0 ? (deltaValue / investedValue) * 100 : null;
    const currency = state.ownedCollection.currency || "USD";

    elements.summary.innerHTML = `
      <article class="collection-metric">
        <p class="collection-metric-label">Tracked Items</p>
        <p class="collection-metric-value">${cards.length}</p>
        <p class="collection-metric-subtext">${totalItems} total units across your collection</p>
      </article>
      <article class="collection-metric">
        <p class="collection-metric-label">Cost Basis</p>
        <p class="collection-metric-value">${formatCurrency(investedValue, currency)}</p>
        <p class="collection-metric-subtext">Based on the purchase prices you log for each collection entry</p>
      </article>
      <article class="collection-metric">
        <p class="collection-metric-label">Estimated Value</p>
        <p class="collection-metric-value">${formatCurrency(currentValue, currency)}</p>
        <p class="collection-metric-subtext">Using the selected market price for each tracked item</p>
      </article>
      <article class="collection-metric">
        <p class="collection-metric-label">Unrealized Return</p>
        <p class="collection-metric-value">${formatCurrency(deltaValue, currency)}</p>
        <p class="collection-metric-subtext">${deltaPercent != null ? formatPercent(deltaPercent) : "Add purchase prices to calculate returns"}</p>
      </article>
    `;
  }

  function renderDetail(card) {
    const ownership = card.ownershipMetrics || {};
    const attacks = card.attacks?.length
      ? `<ul class="collection-detail-list">${card.attacks
          .map(
            (attack) => `
              <li>
                <strong>${escapeHtml(attack.name || "Attack")}</strong>
                ${attack.damage ? `<span> | ${escapeHtml(attack.damage)}</span>` : ""}
                ${attack.text ? `<div>${escapeHtml(attack.text)}</div>` : ""}
              </li>`,
          )
          .join("")}</ul>`
      : '<p class="collection-detail-copy">No attack data available for this item.</p>';

    const rules = card.rules?.length
      ? `<ul class="collection-detail-list">${card.rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ul>`
      : '<p class="collection-detail-copy">No additional card rules surfaced for this item.</p>';

    elements.detailPanel.innerHTML = `
      <div class="collection-detail-hero">
        <div>
          ${card.image ? `<img class="collection-detail-image" src="${escapeHtml(card.image)}" alt="${escapeHtml(card.title)}">` : ""}
        </div>
        <div>
          <p class="collection-eyebrow">${escapeHtml(card.setName || card.supertype || "Collection Item")}</p>
          <h2 class="collection-detail-title">${escapeHtml(card.title)}</h2>
          <p class="collection-detail-copy">${escapeHtml(card.subtitle || "Tracked collection item")}</p>
          ${card.flavorText ? `<p class="collection-detail-copy">${escapeHtml(card.flavorText)}</p>` : ""}
          <div class="collection-detail-price-grid">
            <article class="collection-detail-stat">
              <p class="collection-detail-stat-label">Current Price</p>
              <p class="collection-detail-stat-value">${formatCurrency(card.pricing?.currentPrice, card.pricing?.currency)}</p>
            </article>
            <article class="collection-detail-stat">
              <p class="collection-detail-stat-label">Price Source</p>
              <p class="collection-detail-stat-value">${escapeHtml(card.pricing?.sourceLabel || "Unavailable")}</p>
            </article>
            <article class="collection-detail-stat">
              <p class="collection-detail-stat-label">Cost Basis</p>
              <p class="collection-detail-stat-value">${formatCurrency(ownership.investedValue, card.pricing?.currency)}</p>
            </article>
            <article class="collection-detail-stat">
              <p class="collection-detail-stat-label">Return</p>
              <p class="collection-detail-stat-value">
                ${
                  ownership.deltaAmount != null
                    ? `${ownership.deltaAmount >= 0 ? "+" : ""}${formatCurrency(ownership.deltaAmount, card.pricing?.currency)} ${ownership.deltaPercent != null ? `(${formatPercent(ownership.deltaPercent)})` : ""}`
                    : "Add purchase prices to calculate"
                }
              </p>
            </article>
          </div>
        </div>
      </div>

      ${buildHistoryChart(card.history, card.pricing?.currency)}

      <div class="collection-detail-meta">
        <div><dt>Set</dt><dd>${escapeHtml(card.setName || "N/A")}</dd></div>
        <div><dt>Number</dt><dd>${escapeHtml(card.number || "N/A")}</dd></div>
        <div><dt>Rarity</dt><dd>${escapeHtml(card.rarity || "N/A")}</dd></div>
        <div><dt>Artist</dt><dd>${escapeHtml(card.artist || "N/A")}</dd></div>
        <div><dt>HP</dt><dd>${escapeHtml(card.hp || "N/A")}</dd></div>
        <div><dt>Types</dt><dd>${escapeHtml((card.types || []).join(", ") || "N/A")}</dd></div>
        <div><dt>Weaknesses</dt><dd>${escapeHtml((card.weaknesses || []).map((item) => item.type).join(", ") || "N/A")}</dd></div>
        <div><dt>Retreat</dt><dd>${escapeHtml((card.retreatCost || []).join(", ") || "N/A")}</dd></div>
      </div>

      <div class="collection-detail-columns">
        <section class="collection-detail-column">
          <h3>Attacks & Abilities</h3>
          ${attacks}
        </section>
        <section class="collection-detail-column">
          <h3>Card Context</h3>
          ${rules}
        </section>
      </div>
    `;
  }

  function renderStatus(message, mode) {
    elements.status.textContent = message;
    elements.status.setAttribute("data-mode", mode || "info");
  }

  function renderCardGrid(cards, target, clickHandler) {
    target.innerHTML = cards
      .map((card) => {
        const ownershipMetrics = card.ownershipMetrics || {};
        const deltaAmount = ownershipMetrics.deltaAmount;
        const deltaPercent = ownershipMetrics.deltaPercent;
        const hasMovement = typeof deltaAmount === "number" && typeof deltaPercent === "number";
        const directionClass = hasMovement
          ? deltaAmount > 0
            ? "collection-movement collection-movement--up"
            : deltaAmount < 0
              ? "collection-movement collection-movement--down"
              : "collection-movement collection-movement--flat"
          : "collection-movement";
        const badges = [
          card.supertype,
          card.pricing?.priceType && card.pricing.priceType !== "unavailable" ? card.pricing.priceType : null,
          card.ownership?.condition || null,
        ].filter(Boolean);

        return `
          <article class="collection-card collection-card--vertical" data-card-id="${escapeHtml(card.id)}">
            <div class="collection-card-media">
              ${card.thumbnail ? `<img src="${escapeHtml(card.thumbnail)}" alt="${escapeHtml(card.title)}" loading="lazy">` : ""}
            </div>
            <div class="collection-card-content">
              <h3>${escapeHtml(card.title)}</h3>
              <p class="collection-card-copy">${escapeHtml(card.subtitle || "Tracked collection item")}</p>
              <div class="collection-card-badges">
                ${badges.map((badge) => `<span class="collection-badge">${escapeHtml(badge)}</span>`).join("")}
              </div>
              <div class="collection-card-price">${formatCurrency(card.pricing?.currentPrice, card.pricing?.currency)}</div>
              <div class="${directionClass}">
                ${
                  hasMovement
                    ? `${deltaAmount >= 0 ? "+" : ""}${formatCurrency(deltaAmount, card.pricing?.currency)} (${formatPercent(deltaPercent)})`
                    : escapeHtml(card.pricing?.sourceLabel || "Pricing unavailable")
                }
              </div>
              <div class="collection-ownership-row">
                <span>Qty</span>
                <strong>${escapeHtml(String(ownershipMetrics.quantity || 1))}</strong>
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    Array.from(target.querySelectorAll("[data-card-id]")).forEach((element) => {
      element.addEventListener("click", () => {
        const cardId = element.getAttribute("data-card-id");
        const selected = cards.find((card) => card.id === cardId);

        if (selected) {
          clickHandler(selected).catch((error) => {
            renderStatus(error instanceof Error ? error.message : "Unable to load card details.", "error");
          });
        }
      });
    });
  }

  async function fetchJson(url) {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    return response.json();
  }

  async function fetchWorkerCard(cardId, ownership) {
    const params = new URLSearchParams();

    if (ownership?.priceType) {
      params.set("priceType", ownership.priceType);
    }

    const suffix = params.toString() ? `?${params.toString()}` : "";
    const payload = await fetchJson(`${apiBase}/api/pokemon/cards/${encodeURIComponent(cardId)}${suffix}`);
    const card = payload.card || null;

    if (!card) {
      throw new Error("Card detail is unavailable.");
    }

    if (ownership) {
      card.ownership = ownership;
      card.ownershipMetrics = computeOwnershipMetrics(card.pricing?.currentPrice ?? null, ownership);
      card.title = ownership.label || card.cardName || card.title;
    }

    return card;
  }

  async function fetchDirectCard(cardId, ownership) {
    const params = new URLSearchParams({ select: CARD_SELECT_FIELDS });
    const payload = await fetchJson(`${directApiBase}/cards/${encodeURIComponent(cardId)}?${params.toString()}`);
    return mapCardPayload(payload.data, ownership, []);
  }

  async function enrichOwnedEntry(entry) {
    if (entry.source === "custom") {
      return mapCustomEntry(entry);
    }

    if (!entry.cardId) {
      throw new Error("A tracked collection entry is missing cardId.");
    }

    if (apiBase) {
      return fetchWorkerCard(entry.cardId, entry);
    }

    return fetchDirectCard(entry.cardId, entry);
  }

  async function loadCollectionPayload() {
    if (apiBase) {
      try {
        const payload = await fetchJson(`${apiBase}/api/collection/cards`);
        return { payload, mode: "worker", warning: "" };
      } catch (error) {
        if (!ownedCardsUrl) {
          throw error;
        }
        const payload = await fetchJson(ownedCardsUrl);
        return {
          payload,
          mode: "fallback",
          warning: "The collection worker could not be reached, so the page is using the local fallback inventory.",
        };
      }
    }

    const payload = await fetchJson(ownedCardsUrl);
    return { payload, mode: "fallback", warning: "" };
  }

  async function hydrateCollectionCards(payload, mode) {
    const normalized = normalizeOwnedCollection(payload);
    state.ownedCollection = normalized;

    if (mode === "worker") {
      return normalized.cards;
    }

    return Promise.all(normalized.cards.map((entry) => enrichOwnedEntry(entry)));
  }

  async function selectCard(card) {
    let selectedCard = card;

    if (
      apiBase &&
      card.kind === "api" &&
      (!Array.isArray(card.history) || !card.history.length) &&
      !card.ownership?.source
    ) {
      selectedCard = await fetchWorkerCard(card.id, card.ownership);
    }

    state.selectedCard = selectedCard;
    renderDetail(selectedCard);
  }

  async function loadCollection() {
    const { payload, mode, warning } = await loadCollectionPayload();
    state.sourceMode = mode;
    state.ownedCards = await hydrateCollectionCards(payload, mode);

    if (!state.ownedCards.length) {
      elements.ownedGrid.innerHTML = "";
      elements.ownedEmpty.hidden = false;
      renderSummary([]);
      renderStatus(
        warning ||
          (mode === "worker"
            ? "Worker-backed mode is active. Add cards from the Manage Collection page to publish them here."
            : "Direct fallback mode is active. Add cards to assets/data/owned-cards.json or configure the worker backend."),
        warning ? "error" : mode === "worker" ? "worker" : "fallback",
      );
      return;
    }

    elements.ownedEmpty.hidden = true;
    renderSummary(state.ownedCards);
    renderCardGrid(state.ownedCards, elements.ownedGrid, selectCard);
    await selectCard(state.ownedCards[0]);

    renderStatus(
      warning ||
        (mode === "worker"
          ? "Worker-backed mode active. Collection cards and pricing history are being served from Cloudflare."
          : "Direct Pokemon TCG API fallback mode active. Configure the worker URL to unlock server-side history and website-managed cards."),
      warning ? "error" : mode === "worker" ? "worker" : "fallback",
    );
  }

  async function searchCards(query) {
    if (!query.trim()) {
      state.searchResults = [];
      elements.searchFeedback.textContent = "Enter a card name or card number to search.";
      elements.searchResults.innerHTML = "";
      return;
    }

    elements.searchFeedback.textContent = "Searching cards...";

    if (apiBase) {
      const payload = await fetchJson(`${apiBase}/api/pokemon/cards/search?q=${encodeURIComponent(query)}`);
      state.searchResults = Array.isArray(payload?.cards) ? payload.cards : [];
    } else {
      const params = new URLSearchParams({
        q: buildPokemonQuery(query),
        pageSize: "12",
        orderBy: "-set.releaseDate",
        select: CARD_SELECT_FIELDS,
      });
      const payload = await fetchJson(`${directApiBase}/cards?${params.toString()}`);
      state.searchResults = Array.isArray(payload?.data)
        ? payload.data.map((card) => mapCardPayload(card, null, []))
        : [];
    }

    elements.searchFeedback.textContent = `${state.searchResults.length} result${state.searchResults.length === 1 ? "" : "s"} found.`;
    renderCardGrid(state.searchResults, elements.searchResults, selectCard);
  }

  function bindEvents() {
    elements.searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = new FormData(elements.searchForm).get("query");

      searchCards(String(query || "")).catch((error) => {
        elements.searchFeedback.textContent = error instanceof Error ? error.message : "Search failed.";
      });
    });
  }

  bindEvents();

  loadCollection().catch((error) => {
    renderStatus("Failed to load the collection app.", "error");
    elements.ownedEmpty.hidden = false;
    elements.ownedEmpty.textContent = error instanceof Error ? error.message : "Collection load failed.";
  });
})();

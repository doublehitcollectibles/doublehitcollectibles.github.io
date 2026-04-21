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

  const defaultDetailPanelMarkup = elements.detailPanel?.innerHTML || "";

  const gridLayoutApi = window.CollectionGridLayout || {
    buildInlineDetailLayout(cards) {
      return Array.isArray(cards) ? cards.map((card) => ({ type: "card", card })) : [];
    },
  };

  const state = {
    ownedCollection: { collectionName: "Double Hit Collection", currency: "USD", cards: [] },
    ownedCards: [],
    searchResults: [],
    selectedCard: null,
    inlineDetailTarget: null,
    inlineDetailCardId: null,
    selectionRequestId: 0,
    sourceMode: apiBase ? "worker" : "fallback",
  };

  let resizeTimer = 0;

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

  function truncateText(value, maxLength) {
    const normalized = String(value || "").trim();

    if (!normalized || normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
  }

  function normalizeDisplayText(value) {
    if (typeof value === "string") {
      return value.trim();
    }

    if (value == null) {
      return "";
    }

    return String(value).trim();
  }

  function buildCollectionSubtitle(card) {
    const subtitle = normalizeDisplayText(card?.subtitle);

    if (subtitle) {
      return subtitle;
    }

    if (card?.kind === "custom" || card?.source === "custom" || card?.game || card?.category) {
      return buildCustomCollectibleSubtitle(card) || "Tracked collection item";
    }

    const fallbackSubtitle = [
      normalizeDisplayText(card?.setName),
      normalizeDisplayText(card?.rarity),
      normalizeDisplayText(card?.number),
    ]
      .filter(Boolean)
      .join(" | ");

    return fallbackSubtitle || "Tracked collection item";
  }

  function buildCustomCollectibleSubtitle(entry) {
    const clean = (value) => String(value ?? "").trim();

    return [
      clean(entry?.game),
      clean(entry?.category),
      clean(entry?.series),
      clean(entry?.variant) || clean(entry?.itemNumber),
    ]
      .filter(Boolean)
      .join(" | ");
  }

  function getGridColumnCount(target) {
    const isCompact = window.matchMedia("(max-width: 640px)").matches;
    const gap = isCompact ? 12 : 14;
    const minCardWidth = isCompact ? 152 : 172;
    const width = target?.clientWidth || target?.offsetWidth || 0;

    if (!width) {
      return 1;
    }

    return Math.max(1, Math.floor((width + gap) / (minCardWidth + gap)));
  }

  function resolveInlineSelection(cards, targetKey) {
    const activeCardId = state.inlineDetailTarget === targetKey ? state.inlineDetailCardId : null;

    if (!activeCardId) {
      return { activeCardId: null, detailCard: null };
    }

    const matchingCard = cards.find((card) => card.id === activeCardId) || null;

    if (!matchingCard) {
      return { activeCardId: null, detailCard: null };
    }

    return {
      activeCardId,
      detailCard: state.selectedCard?.id === activeCardId ? state.selectedCard : matchingCard,
    };
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
    const displayLabel = normalizeDisplayText(ownership?.label);
    const rawVariant =
      pricing.currentPrice != null
        ? {
            key: "raw",
            label: "Raw",
            currency: pricing.currency,
            currentPrice: pricing.currentPrice,
            sourceLabel: pricing.sourceLabel,
            updatedAt: pricing.updatedAt,
            metrics: pricing.metrics,
          }
        : null;

    return {
      kind: "api",
      id: card.id,
      title: displayLabel || card.name,
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
      priceVariants: rawVariant ? [rawVariant] : [],
      historySeries: [],
      marketSourceUrl: null,
      ownership: ownership || null,
      ownershipMetrics: computeOwnershipMetrics(pricing.currentPrice, ownership || null),
      history: Array.isArray(history) ? history : [],
    };
  }

  function mapCustomEntry(entry) {
    const currentPrice = entry.currentPrice != null ? Number(entry.currentPrice) : null;
    const displayLabel = normalizeDisplayText(entry.label);
    const subtitle = buildCustomCollectibleSubtitle(entry);

    return {
      kind: "custom",
      id: entry.id || entry.label || entry.cardId || `custom-${Math.random().toString(36).slice(2)}`,
      title: displayLabel || "Custom Collection Item",
      cardName: displayLabel || "Custom Collection Item",
      subtitle,
      image: entry.image || "",
      thumbnail: entry.image || "",
      setName: entry.game || entry.series || "",
      rarity: entry.category || entry.variant || "",
      number: entry.itemNumber || "",
      artist: entry.artist || "",
      hp: null,
      types: [],
      supertype: entry.category || entry.game || "Collection Item",
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
      priceVariants:
        currentPrice != null
          ? [
              {
                key: "raw",
                label: "Raw",
                currency: entry.currency || state.ownedCollection.currency || "USD",
                currentPrice,
                sourceLabel: entry.priceSource || "Manual Entry",
                updatedAt: entry.updatedAt || null,
                metrics: {},
              },
            ]
          : [],
      historySeries: [],
      marketSourceUrl: null,
      ownership: entry,
      ownershipMetrics: computeOwnershipMetrics(currentPrice, entry),
      history: Array.isArray(entry.history) ? entry.history : [],
    };
  }

  function getPriceVariant(card, key) {
    return (Array.isArray(card?.priceVariants) ? card.priceVariants : []).find((variant) => variant.key === key) || null;
  }

  function getHistorySeries(card, key) {
    return (Array.isArray(card?.historySeries) ? card.historySeries : []).find((series) => series.key === key) || null;
  }

  function getSeriesDelta(series, currentPrice, metrics) {
      const explicitDeltaAmount = Number(metrics?.dailyChangeAmount);
      const explicitDeltaPercent = Number(metrics?.dailyChangePercent);

      if (Number.isFinite(explicitDeltaAmount)) {
        return {
          delta: explicitDeltaAmount,
          percent: Number.isFinite(explicitDeltaPercent)
            ? explicitDeltaPercent
            : currentPrice - explicitDeltaAmount > 0
              ? (explicitDeltaAmount / (currentPrice - explicitDeltaAmount)) * 100
              : null,
        };
      }

      if (!series || !Array.isArray(series.points) || series.points.length < 2) {
        return null;
      }

    const points = series.points
      .map((point) => ({
        timestamp: new Date(point?.capturedAt).getTime(),
        price: Number(point?.price),
      }))
      .filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.price) && point.price > 0);

    if (points.length < 2) {
      return null;
    }

    const latestPoint = points[points.length - 1];
    const comparisonCutoff = latestPoint.timestamp - 24 * 60 * 60 * 1000;
    const comparisonPoint =
      [...points]
        .reverse()
        .find((point) => point.timestamp <= comparisonCutoff && point.timestamp < latestPoint.timestamp) ||
      points[points.length - 2];
    const latestPrice =
      typeof currentPrice === "number" && Number.isFinite(currentPrice) && currentPrice > 0
        ? currentPrice
        : latestPoint.price;

    if (!comparisonPoint || comparisonPoint.price <= 0) {
      return null;
    }

    const delta = latestPrice - comparisonPoint.price;
    const percent = (delta / comparisonPoint.price) * 100;

    return {
      delta,
      percent,
    };
  }

  function renderMarketBlock(label, variant, delta) {
    const currency = variant?.currency || "USD";
    const hasPercent = typeof delta?.percent === "number" && Number.isFinite(delta.percent);
    const hasDeltaAmount = typeof delta?.delta === "number" && Number.isFinite(delta.delta);
    const deltaClass =
      hasPercent && delta.percent > 0
        ? "collection-market-change collection-market-change--up"
        : hasPercent && delta.percent < 0
          ? "collection-market-change collection-market-change--down"
          : "collection-market-change";

    return `
      <div class="collection-market-card">
        <span class="collection-market-label">${escapeHtml(label)}</span>
        <strong class="collection-market-value">${formatCurrency(variant?.currentPrice, currency)}</strong>
        <span class="${deltaClass}">
          ${
            hasPercent && hasDeltaAmount
              ? `${delta.delta >= 0 ? "+" : ""}${formatCurrency(delta.delta, currency)} (${formatPercent(delta.percent)})`
              : hasPercent
                ? `${delta.percent >= 0 ? "+" : ""}${formatPercent(delta.percent)}`
              : "No trend"
          }
        </span>
      </div>
    `;
  }

  function normalizeHistorySeries(card, currency) {
    const series = Array.isArray(card?.historySeries) ? card.historySeries : [];
    const validSeries = series
      .map((item, index) => ({
        key: item?.key || `series-${index + 1}`,
        label: item?.label || `Series ${index + 1}`,
        currency: item?.currency || currency || "USD",
        sourceLabel: item?.sourceLabel || "Market",
        color: item?.color || (index === 0 ? "#4aa8ff" : "#ffd84a"),
        points: Array.isArray(item?.points)
          ? item.points
              .map((point) => ({
                capturedAt: point?.capturedAt,
                price: Number(point?.price),
              }))
              .filter((point) => point.capturedAt && Number.isFinite(point.price) && point.price > 0)
          : [],
      }))
      .filter((item) => item.points.length >= 2);

    if (validSeries.length) {
      return validSeries;
    }

    const fallbackHistory = Array.isArray(card?.history) ? card.history : [];
    const fallbackPoints = fallbackHistory
      .map((point) => ({
        capturedAt: point?.capturedAt,
        price: Number(point?.marketPrice),
      }))
      .filter((point) => point.capturedAt && Number.isFinite(point.price) && point.price > 0);

    if (fallbackPoints.length < 2) {
      return [];
    }

    return [
      {
        key: "snapshot",
        label: card?.pricing?.priceType && card.pricing.priceType !== "unavailable" ? card.pricing.priceType : "Market",
        currency: card?.pricing?.currency || currency || "USD",
        sourceLabel: card?.pricing?.sourceLabel || "Market",
        color: "#ff8a4c",
        points: fallbackPoints,
      },
    ];
  }

  function formatShortDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(date);
  }

  function buildHistoryChart(card, currency, options = {}) {
    const compact = Boolean(options.compact);
    const historySeries = normalizeHistorySeries(card, currency);
    const usingProviderHistory =
      Boolean(card?.marketSourceUrl) &&
      Array.isArray(card?.historySeries) &&
      card.historySeries.some((series) => Array.isArray(series?.points) && series.points.length >= 2);
    const chartClassName = `collection-history${compact ? " collection-history--compact" : ""}`;
    const chartTitle = options.title || "Price History";

    if (!historySeries.length) {
      return `
        <div class="${chartClassName}">
          <strong>${escapeHtml(chartTitle)}</strong>
          <p class="collection-history-caption">History will appear here as live pricing data becomes available for this card.</p>
        </div>
      `;
    }

    const width = compact ? 460 : 640;
    const height = compact ? 188 : 220;
    const padding = compact
      ? { top: 16, right: 12, bottom: 34, left: 48 }
      : { top: 18, right: 12, bottom: 38, left: 54 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const allPoints = historySeries.flatMap((series) =>
      series.points.map((point) => ({
        timestamp: new Date(point.capturedAt).getTime(),
        price: point.price,
      })),
    );
    const timestamps = allPoints.map((point) => point.timestamp).filter((value) => Number.isFinite(value));
    const values = allPoints.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0);

    if (!timestamps.length || values.length < 2) {
      return `
        <div class="${chartClassName}">
          <strong>${escapeHtml(chartTitle)}</strong>
          <p class="collection-history-caption">Not enough market history is available yet to draw this chart.</p>
        </div>
      `;
    }

    const minX = Math.min(...timestamps);
    const maxX = Math.max(...timestamps);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const xRange = maxX - minX || 1;
    const gridLines = compact ? 3 : 4;
    const grid = Array.from({ length: gridLines }, (_, index) => {
      const ratio = index / (gridLines - 1);
      const y = padding.top + plotHeight * ratio;
      const price = max - range * ratio;
      return {
        y,
        label: formatCurrency(price, currency),
      };
    });
    const tickCount = Math.min(compact ? 4 : 5, timestamps.length);
    const xTicks = Array.from({ length: tickCount }, (_, index) => {
      const ratio = tickCount === 1 ? 0 : index / (tickCount - 1);
      const timestamp = minX + xRange * ratio;
      const x = padding.left + plotWidth * ratio;

      return {
        x,
        label: formatShortDate(timestamp),
      };
    });
      const lines = historySeries.map((series) => {
      const points = series.points
        .map((point) => {
          const timestamp = new Date(point.capturedAt).getTime();
          const x = padding.left + ((timestamp - minX) / xRange) * plotWidth;
          const y = padding.top + plotHeight - ((point.price - min) / range) * plotHeight;
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ");
      const latestPoint = series.points[series.points.length - 1];
        const matchingVariant = getPriceVariant(card, series.key);
        const deltaMetrics = getSeriesDelta(series, latestPoint.price, matchingVariant?.metrics);

      return {
        ...series,
        pointsAttr: points,
        latestPrice: latestPoint.price,
        delta: deltaMetrics?.delta ?? null,
        percent: deltaMetrics?.percent ?? null,
      };
    });

    return `
      <div class="${chartClassName}">
        <div class="collection-history-header">
          <strong>${escapeHtml(chartTitle)}</strong>
          <div class="collection-history-legend">
            ${lines
              .map(
                (series) => `
                  <span class="collection-history-legend-item">
                    <span class="collection-history-dot" style="--history-color: ${escapeHtml(series.color)};"></span>
                    ${escapeHtml(series.label)}
                  </span>`,
              )
              .join("")}
          </div>
        </div>
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
          ${grid
            .map(
              (line) => `
                <line x1="${padding.left}" y1="${line.y}" x2="${width - padding.right}" y2="${line.y}" class="collection-history-grid-line"></line>
                <text x="${padding.left - 8}" y="${line.y + 4}" text-anchor="end" class="collection-history-axis-label">${escapeHtml(line.label)}</text>`,
            )
            .join("")}
          ${xTicks
            .map(
              (tick) => `
                <text x="${tick.x}" y="${height - 10}" text-anchor="middle" class="collection-history-axis-label">${escapeHtml(tick.label)}</text>`,
            )
            .join("")}
          ${lines
            .map(
              (series) => `
                <polyline
                  fill="none"
                  stroke="${escapeHtml(series.color)}"
                  stroke-width="${compact ? 3 : 4}"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  points="${series.pointsAttr}"
                ></polyline>`,
            )
            .join("")}
        </svg>
        <div class="collection-history-summary">
          ${lines
            .map(
              (series) => `
                <div class="collection-history-summary-card">
                  <span class="collection-history-summary-label">${escapeHtml(series.label)}</span>
                  <strong>${formatCurrency(series.latestPrice, series.currency)}</strong>
                  <span class="collection-history-summary-delta ${
                    series.delta > 0 ? "collection-history-summary-delta--up" : series.delta < 0 ? "collection-history-summary-delta--down" : ""
                  }">
                    ${series.delta >= 0 ? "+" : ""}${formatCurrency(series.delta, series.currency)}
                    ${series.percent != null ? `(${formatPercent(series.percent)})` : ""}
                  </span>
                </div>`,
            )
            .join("")}
        </div>
        <p class="collection-history-caption">
          ${
            usingProviderHistory
              ? `Live provider history from <a href="${escapeHtml(card.marketSourceUrl)}" target="_blank" rel="noreferrer">PriceCharting</a>`
              : `Stored Cloudflare snapshot history built from prior refreshes of ${escapeHtml(lines[0].sourceLabel || "market data")}`
          }
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
        <p class="collection-metric-subtext">${totalItems} units in collection</p>
      </article>
      <article class="collection-metric">
        <p class="collection-metric-label">Cost Basis</p>
        <p class="collection-metric-value">${formatCurrency(investedValue, currency)}</p>
        <p class="collection-metric-subtext">Your logged purchase total</p>
      </article>
      <article class="collection-metric">
        <p class="collection-metric-label">Estimated Value</p>
        <p class="collection-metric-value">${formatCurrency(currentValue, currency)}</p>
        <p class="collection-metric-subtext">Current market estimate</p>
      </article>
      <article class="collection-metric">
        <p class="collection-metric-label">Unrealized Return</p>
        <p class="collection-metric-value">${formatCurrency(deltaValue, currency)}</p>
        <p class="collection-metric-subtext">${deltaPercent != null ? formatPercent(deltaPercent) : "Add purchase prices to calculate returns"}</p>
      </article>
    `;
  }

  function getCardDisplayTitle(card) {
    return (
      normalizeDisplayText(card?.title) ||
      normalizeDisplayText(card?.cardName) ||
      normalizeDisplayText(card?.name) ||
      normalizeDisplayText(card?.id) ||
      "Collection Item"
    );
  }

  function normalizeCollectionCardRecord(card) {
    const displayTitle = getCardDisplayTitle(card);
    const displaySubtitle = buildCollectionSubtitle(card);
    const displayImage = normalizeDisplayText(card?.image) || normalizeDisplayText(card?.thumbnail);
    const displayThumbnail = normalizeDisplayText(card?.thumbnail) || displayImage;

    return {
      ...card,
      title: displayTitle,
      cardName: normalizeDisplayText(card?.cardName) || displayTitle,
      subtitle: displaySubtitle,
      setName: normalizeDisplayText(card?.setName),
      rarity: normalizeDisplayText(card?.rarity),
      number: normalizeDisplayText(card?.number),
      image: displayImage,
      thumbnail: displayThumbnail,
    };
  }

  function renderDetail(card) {
    const displayTitle = getCardDisplayTitle(card);
    const ownership = card.ownershipMetrics || {};
    const rawPrice = getPriceVariant(card, "raw");
    const psa10Price = getPriceVariant(card, "psa10");
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
      <div class="collection-detail-layout">
        <aside class="collection-detail-aside">
          ${card.image ? `<img class="collection-detail-image" src="${escapeHtml(card.image)}" alt="${escapeHtml(displayTitle)}">` : ""}
        </aside>
        <div class="collection-detail-main">
          <div class="collection-detail-hero">
            <div>
              <p class="collection-eyebrow">${escapeHtml(card.setName || card.supertype || "Collection Item")}</p>
              <h2 class="collection-detail-title">${escapeHtml(displayTitle)}</h2>
              <p class="collection-detail-copy">${escapeHtml(card.subtitle || "Tracked collection item")}</p>
              ${card.flavorText ? `<p class="collection-detail-copy">${escapeHtml(card.flavorText)}</p>` : ""}
              <div class="collection-detail-price-grid">
                <article class="collection-detail-stat">
                  <p class="collection-detail-stat-label">Raw</p>
                  <p class="collection-detail-stat-value">${formatCurrency(rawPrice?.currentPrice ?? card.pricing?.currentPrice, rawPrice?.currency || card.pricing?.currency)}</p>
                  <p class="collection-detail-stat-copy">${escapeHtml(rawPrice?.sourceLabel || card.pricing?.sourceLabel || "Unavailable")}</p>
                </article>
                <article class="collection-detail-stat">
                  <p class="collection-detail-stat-label">PSA 10</p>
                  <p class="collection-detail-stat-value">${formatCurrency(psa10Price?.currentPrice, psa10Price?.currency || card.pricing?.currency)}</p>
                  <p class="collection-detail-stat-copy">${escapeHtml(psa10Price?.sourceLabel || "Unavailable")}</p>
                </article>
                <article class="collection-detail-stat">
                  <p class="collection-detail-stat-label">Cost Basis</p>
                  <p class="collection-detail-stat-value">${formatCurrency(ownership.investedValue, card.pricing?.currency)}</p>
                  <p class="collection-detail-stat-copy">Based on your logged purchase price and quantity</p>
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
                  <p class="collection-detail-stat-copy">${escapeHtml(card.pricing?.sourceLabel || "Unavailable")}</p>
                </article>
              </div>
            </div>
          </div>

          ${buildHistoryChart(card, card.pricing?.currency)}

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
        </div>
      </div>
    `;
  }

  function renderInlineDetail(card, span, targetKey) {
    const ownership = card.ownershipMetrics || {};
    const rawPrice = getPriceVariant(card, "raw") || (card.pricing?.currentPrice != null
      ? {
          currentPrice: card.pricing.currentPrice,
          currency: card.pricing.currency,
          sourceLabel: card.pricing.sourceLabel,
        }
      : null);
    const psa10Price = getPriceVariant(card, "psa10");
    const badges = [
      card.supertype,
      card.rarity,
      card.ownership?.condition,
      ownership.quantity ? `Qty ${ownership.quantity}` : null,
    ].filter(Boolean);
    const historyMarkup = buildHistoryChart(card, rawPrice?.currency || card.pricing?.currency, { compact: true });

    return `
      <article
        class="collection-inline-detail"
        style="--inline-detail-span: ${escapeHtml(String(span || 1))};"
        data-inline-detail-for="${escapeHtml(card.id)}"
      >
        <div class="collection-inline-detail-shell">
          <div class="collection-inline-detail-header">
            <button
              class="collection-inline-detail-close"
              type="button"
              data-inline-detail-close="${escapeHtml(targetKey)}"
              aria-label="Close compact detail"
            >
              Hide
            </button>
          </div>
          <div class="collection-inline-detail-body">
            <div class="collection-inline-detail-pills">
              ${badges.map((badge) => `<span class="collection-inline-detail-pill">${escapeHtml(badge)}</span>`).join("")}
            </div>
            <div class="collection-inline-detail-stats">
              <article class="collection-inline-detail-stat">
                <span class="collection-inline-detail-stat-label">Raw</span>
                <span class="collection-inline-detail-stat-value">${formatCurrency(rawPrice?.currentPrice, rawPrice?.currency || card.pricing?.currency)}</span>
              </article>
              <article class="collection-inline-detail-stat">
                <span class="collection-inline-detail-stat-label">PSA10</span>
                <span class="collection-inline-detail-stat-value">${formatCurrency(psa10Price?.currentPrice, psa10Price?.currency || card.pricing?.currency)}</span>
              </article>
              <article class="collection-inline-detail-stat">
                <span class="collection-inline-detail-stat-label">Cost</span>
                <span class="collection-inline-detail-stat-value">${formatCurrency(ownership.investedValue, card.pricing?.currency)}</span>
              </article>
              <article class="collection-inline-detail-stat">
                <span class="collection-inline-detail-stat-label">Return</span>
                <span class="collection-inline-detail-stat-value">
                  ${
                    ownership.deltaAmount != null
                      ? `${ownership.deltaAmount >= 0 ? "+" : ""}${formatCurrency(ownership.deltaAmount, card.pricing?.currency)}`
                      : "N/A"
                  }
                </span>
              </article>
            </div>
            <div class="collection-inline-detail-history">
              ${historyMarkup}
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function renderStatus(message, mode) {
    elements.status.textContent = message;
    elements.status.setAttribute("data-mode", mode || "info");
  }

  function renderCardMarkup(card, isSelected) {
        const displayTitle = getCardDisplayTitle(card);
        const displaySubtitle = buildCollectionSubtitle(card);
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
        const rawVariant = getPriceVariant(card, "raw") || (card.pricing?.currentPrice != null
          ? {
              currentPrice: card.pricing.currentPrice,
              currency: card.pricing.currency,
            }
          : null);
        const psa10Variant = getPriceVariant(card, "psa10");
        const rawDelta = getSeriesDelta(
            getHistorySeries(card, "raw") || getHistorySeries(card, "snapshot"),
            rawVariant?.currentPrice,
            rawVariant?.metrics,
          );
        const psa10Delta = getSeriesDelta(getHistorySeries(card, "psa10"), psa10Variant?.currentPrice, psa10Variant?.metrics);
        const badges = [
          card.supertype,
          card.ownership?.condition || null,
        ].filter(Boolean);

        const movementMarkup = hasMovement
          ? `<div class="${directionClass}">
              ${deltaAmount >= 0 ? "+" : ""}${formatCurrency(deltaAmount, card.pricing?.currency)} (${formatPercent(deltaPercent)}) vs cost basis
            </div>`
          : '<div class="collection-movement collection-movement--empty" aria-hidden="true">&nbsp;</div>';

        return `
          <article
            class="collection-card collection-card--vertical${isSelected ? " collection-card--selected" : ""}"
            data-card-id="${escapeHtml(card.id)}"
          >
            <div class="collection-card-media">
              ${card.thumbnail ? `<img src="${escapeHtml(card.thumbnail)}" alt="${escapeHtml(displayTitle)}" loading="lazy">` : ""}
            </div>
            <div class="collection-card-content">
              <h3 class="collection-card-title">${escapeHtml(displayTitle)}</h3>
              <p class="collection-card-copy collection-card-subtitle">${escapeHtml(displaySubtitle)}</p>
              <div class="collection-card-badges">
                ${badges.map((badge) => `<span class="collection-badge">${escapeHtml(badge)}</span>`).join("")}
              </div>
              <div class="collection-card-markets">
                ${renderMarketBlock("Raw", rawVariant, rawDelta)}
                ${renderMarketBlock("PSA 10", psa10Variant, psa10Delta)}
              </div>
              ${movementMarkup}
              <div class="collection-ownership-row">
                <span>Qty</span>
                <strong>${escapeHtml(String(ownershipMetrics.quantity || 1))}</strong>
              </div>
            </div>
          </article>
        `;
  }

  function renderCardGrid(cards, target, targetKey) {
    const { activeCardId, detailCard } = resolveInlineSelection(cards, targetKey);
    const items = gridLayoutApi.buildInlineDetailLayout(cards, activeCardId, getGridColumnCount(target));

    target.innerHTML = items
      .map((item) => {
        if (item.type === "detail") {
          return detailCard ? renderInlineDetail(detailCard, item.span, targetKey) : "";
        }

        return renderCardMarkup(item.card, item.card.id === activeCardId);
      })
      .join("");

    Array.from(target.querySelectorAll("[data-card-id]")).forEach((element) => {
      element.addEventListener("click", () => {
        const cardId = element.getAttribute("data-card-id");
        const selected = cards.find((card) => card.id === cardId);

        if (state.inlineDetailTarget === targetKey && state.inlineDetailCardId === cardId) {
          clearSelectedCard();
          return;
        }

        if (selected) {
          selectCard(selected, { inlineTarget: targetKey }).catch((error) => {
            renderStatus(error instanceof Error ? error.message : "Unable to load card details.", "error");
          });
        }
      });
    });

    Array.from(target.querySelectorAll("[data-inline-detail-close]")).forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        clearSelectedCard();
      });
    });
  }

  function renderOwnedGrid() {
    renderCardGrid(state.ownedCards, elements.ownedGrid, "owned");
  }

  function renderSearchResultsGrid() {
    renderCardGrid(state.searchResults, elements.searchResults, "search");
  }

  function renderAllCardGrids() {
    renderOwnedGrid();
    renderSearchResultsGrid();
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    return response.json();
  }

  async function fetchWorkerCard(cardId, ownership, refresh) {
    const params = new URLSearchParams();

    if (ownership?.priceType) {
      params.set("priceType", ownership.priceType);
    }

    if (refresh) {
      params.set("refresh", "1");
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
      card.title = normalizeDisplayText(ownership.label) || getCardDisplayTitle(card);
    }

    return normalizeCollectionCardRecord(card);
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
      return normalized.cards.map((card) => normalizeCollectionCardRecord(card));
    }

    return Promise.all(normalized.cards.map((entry) => enrichOwnedEntry(entry)));
  }

  function clearSelectedCard() {
    state.selectionRequestId += 1;
    state.inlineDetailTarget = null;
    state.inlineDetailCardId = null;
    state.selectedCard = null;
    renderAllCardGrids();
    elements.detailPanel.innerHTML = defaultDetailPanelMarkup;
  }

  function syncCardAcrossCollections(updatedCard) {
    const replaceCard = (card) => (card.id === updatedCard.id ? updatedCard : card);
    state.ownedCards = state.ownedCards.map(replaceCard);
    state.searchResults = state.searchResults.map(replaceCard);
  }

  async function selectCard(card, options = {}) {
    const requestId = ++state.selectionRequestId;
    const inlineTarget = options.inlineTarget || null;

    if (inlineTarget) {
      state.inlineDetailTarget = inlineTarget;
      state.inlineDetailCardId = card.id;
    }

    state.selectedCard = card;
    renderAllCardGrids();
    renderDetail(card);

    let selectedCard = card;

    if (apiBase && card.kind === "api") {
      selectedCard = await fetchWorkerCard(card.id, card.ownership, true);
    }

    if (requestId !== state.selectionRequestId) {
      return;
    }

    state.selectedCard = selectedCard;
    syncCardAcrossCollections(selectedCard);
    if (inlineTarget) {
      state.inlineDetailCardId = selectedCard.id;
    }
    renderAllCardGrids();
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
    renderOwnedGrid();
    await selectCard(state.ownedCards[0]);

    renderStatus(
      warning ||
        (mode === "worker"
          ? "Worker-backed mode active. Pokemon TCG market pricing is primary, with PriceCharting filling PSA 10 and missing market gaps."
          : "Direct Pokemon TCG API fallback mode active. Configure the worker URL to unlock server-side history and website-managed cards."),
      warning ? "error" : mode === "worker" ? "worker" : "fallback",
    );
  }

  async function searchCards(query) {
    if (!query.trim()) {
      state.searchResults = [];
      if (state.inlineDetailTarget === "search") {
        state.inlineDetailTarget = null;
        state.inlineDetailCardId = null;
      }
      elements.searchFeedback.textContent = "Enter a card name or card number to search.";
      elements.searchResults.innerHTML = "";
      return;
    }

    elements.searchFeedback.textContent = "Searching cards...";

    if (apiBase) {
      const payload = await fetchJson(`${apiBase}/api/pokemon/cards/search?q=${encodeURIComponent(query)}`);
      state.searchResults = Array.isArray(payload?.cards)
        ? payload.cards.map((card) => normalizeCollectionCardRecord(card))
        : [];
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

    if (
      state.inlineDetailTarget === "search" &&
      !state.searchResults.some((card) => card.id === state.inlineDetailCardId)
    ) {
      state.inlineDetailTarget = null;
      state.inlineDetailCardId = null;
    }

    renderSearchResultsGrid();
  }

  function bindEvents() {
    elements.searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = new FormData(elements.searchForm).get("query");

      searchCards(String(query || "")).catch((error) => {
        elements.searchFeedback.textContent = error instanceof Error ? error.message : "Search failed.";
      });
    });

    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (state.inlineDetailTarget) {
          renderAllCardGrids();
        }
      }, 90);
    });
  }

  bindEvents();

  loadCollection().catch((error) => {
    renderStatus("Failed to load the collection app.", "error");
    elements.ownedEmpty.hidden = false;
    elements.ownedEmpty.textContent = error instanceof Error ? error.message : "Collection load failed.";
  });
})();

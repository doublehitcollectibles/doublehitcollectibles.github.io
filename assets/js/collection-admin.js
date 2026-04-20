(function () {
  const app = document.querySelector("[data-collection-admin-app]");

  if (!app) {
    return;
  }

  const apiBase = (app.dataset.apiBase || "").trim().replace(/\/$/, "");
  const tokenStorageKey = "doublehit.collection.admin.token";
  const requiresLogin = new URL(window.location.href).searchParams.get("required") === "1";

  const elements = {
    status: app.querySelector("[data-admin-status]"),
    loginCard: app.querySelector("[data-admin-login-card]"),
    loginForm: app.querySelector("[data-admin-login-form]"),
    loginFeedback: app.querySelector("[data-admin-login-feedback]"),
    workspace: app.querySelector("[data-admin-workspace]"),
    sessionCopy: app.querySelector("[data-admin-session-copy]"),
    logoutButton: app.querySelector("[data-admin-logout]"),
    modeSwitch: app.querySelector("[data-admin-mode-switch]"),
    modeButtons: Array.from(app.querySelectorAll("[data-admin-mode]")),
    searchTitle: app.querySelector("[data-admin-search-title]"),
    searchCopy: app.querySelector("[data-admin-search-copy]"),
    searchForm: app.querySelector("[data-admin-search-form]"),
    customHelper: app.querySelector("[data-admin-custom-helper]"),
    searchFeedback: app.querySelector("[data-admin-search-feedback]"),
    searchResults: app.querySelector("[data-admin-search-results]"),
    searchPagination: app.querySelector("[data-admin-search-pagination]"),
    selection: app.querySelector("[data-admin-selection]"),
    cardForm: app.querySelector("[data-admin-card-form]"),
    formCopy: app.querySelector("[data-admin-form-copy]"),
    labelText: app.querySelector("[data-admin-label-text]"),
    labelInput: app.querySelector("[data-admin-label-input]"),
    pokemonOnlyFields: Array.from(app.querySelectorAll("[data-admin-pokemon-only]")),
    customFields: app.querySelector("[data-admin-custom-fields]"),
    submitButton: app.querySelector("[data-admin-submit]"),
    resetButton: app.querySelector("[data-admin-reset]"),
    cardList: app.querySelector("[data-admin-card-list]"),
  };

  const state = {
    token: window.localStorage.getItem(tokenStorageKey) || "",
    user: null,
    searchResults: [],
    searchPage: 1,
    selectedCard: null,
    storedCards: [],
    cardLookup: {},
    editingEntryId: null,
    entryMode: "api",
  };

  const SEARCH_RESULTS_PER_PAGE = 6;
  const SEARCH_PAGE_BUTTON_WINDOW = 5;

  function normalizeEntrySource(value) {
    return String(value || "").trim().toLowerCase() === "custom" ? "custom" : "api";
  }

  function normalizeOptionalText(value) {
    const normalized = String(value ?? "").trim();
    return normalized || undefined;
  }

  function normalizeOptionalNumber(value) {
    if (value == null || value === "") {
      return undefined;
    }

    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function buildCustomSubtitle(entry) {
    return [
      normalizeOptionalText(entry?.game),
      normalizeOptionalText(entry?.category),
      normalizeOptionalText(entry?.series),
      normalizeOptionalText(entry?.variant) || normalizeOptionalText(entry?.itemNumber),
    ]
      .filter(Boolean)
      .join(" | ");
  }

  function getEntryDisplayTitle(entry, lookup) {
    return (
      normalizeOptionalText(entry?.label) ||
      normalizeOptionalText(lookup?.cardName) ||
      normalizeOptionalText(lookup?.title) ||
      normalizeOptionalText(entry?.cardId) ||
      "Collection Item"
    );
  }

  function getEntryDisplaySubtitle(entry, lookup) {
    if (normalizeEntrySource(entry?.source) === "custom") {
      return buildCustomSubtitle(entry) || normalizeOptionalText(entry?.condition) || "Manual collectible";
    }

    return normalizeOptionalText(lookup?.subtitle) || normalizeOptionalText(entry?.condition) || "Stored collection card";
  }

  function buildCustomPreviewModel(entry) {
    const title = normalizeOptionalText(entry?.label) || "Custom collectible";
    const subtitle = buildCustomSubtitle(entry) || "Set the game, category, series, or variant to describe this item.";

    return {
      title,
      subtitle,
      image: normalizeOptionalText(entry?.image) || "",
      currentPrice: normalizeOptionalNumber(entry?.currentPrice),
      currency: normalizeOptionalText(entry?.currency) || "USD",
      sourceLabel: normalizeOptionalText(entry?.priceSource) || "Manual entry",
    };
  }

  function buildCollectionEntryPayload(fields, entryMode) {
    const source = normalizeEntrySource(entryMode || fields?.source);
    const basePayload = {
      source,
      label: normalizeOptionalText(fields?.label),
      quantity: Math.max(1, Number.parseInt(String(fields?.quantity || "1"), 10) || 1),
      purchasePrice: normalizeOptionalNumber(fields?.purchasePrice),
      purchaseDate: normalizeOptionalText(fields?.purchaseDate),
      condition: normalizeOptionalText(fields?.condition),
      notes: normalizeOptionalText(fields?.notes),
    };

    const cardId = normalizeOptionalText(fields?.cardId);

    if (cardId) {
      basePayload.cardId = cardId;
    }

    if (source === "custom") {
      const customPayload = {
        ...basePayload,
        game: normalizeOptionalText(fields?.game),
        category: normalizeOptionalText(fields?.category),
        series: normalizeOptionalText(fields?.series),
        variant: normalizeOptionalText(fields?.variant),
        itemNumber: normalizeOptionalText(fields?.itemNumber),
        image: normalizeOptionalText(fields?.image),
        currentPrice: normalizeOptionalNumber(fields?.currentPrice),
        priceSource: normalizeOptionalText(fields?.priceSource),
        description: normalizeOptionalText(fields?.description),
        artist: normalizeOptionalText(fields?.artist),
        currency: normalizeOptionalText(fields?.currency) || "USD",
      };

      Object.keys(customPayload).forEach((key) => {
        if (customPayload[key] === undefined) {
          delete customPayload[key];
        }
      });

      return customPayload;
    }

    const apiPayload = {
      ...basePayload,
      priceType: normalizeOptionalText(fields?.priceType),
    };

    Object.keys(apiPayload).forEach((key) => {
      if (apiPayload[key] === undefined) {
        delete apiPayload[key];
      }
    });

    return apiPayload;
  }

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

  function detailKey(cardId, priceType) {
    return `${cardId}::${priceType || "auto"}`;
  }

  function renderStatus(message, mode) {
    elements.status.textContent = message;
    elements.status.setAttribute("data-mode", mode || "info");
  }

  function renderLoginFeedback(message, mode) {
    if (!elements.loginFeedback) {
      return;
    }

    if (!message) {
      elements.loginFeedback.hidden = true;
      elements.loginFeedback.textContent = "";
      elements.loginFeedback.removeAttribute("data-mode");
      return;
    }

    elements.loginFeedback.hidden = false;
    elements.loginFeedback.textContent = message;
    elements.loginFeedback.setAttribute("data-mode", mode || "info");
  }

  function notifyAuthChanged(options) {
    const detail = options || {};
    window.dispatchEvent(
      new CustomEvent("doublehit-admin-auth-changed", {
        detail: {
          token: typeof detail.token === "string" ? detail.token : state.token,
          username: typeof detail.username === "string" ? detail.username : state.user?.username || "",
          signedOut: Boolean(detail.signedOut),
        },
      }),
    );
  }

  function focusLoginField() {
    if (elements.loginForm?.elements?.username && typeof elements.loginForm.elements.username.focus === "function") {
      elements.loginForm.elements.username.focus();
    }
  }

  function clearRequiredLoginFlag() {
    const url = new URL(window.location.href);

    if (!url.searchParams.has("required")) {
      return;
    }

    url.searchParams.delete("required");
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }

  function buildHeaders(includeAuth) {
    const headers = new Headers({
      "content-type": "application/json",
    });

    if (includeAuth && state.token) {
      headers.set("authorization", `Bearer ${state.token}`);
    }

    return headers;
  }

  async function apiJson(path, init) {
    const requestInit = {
      ...init,
      headers: init?.headers || buildHeaders(Boolean(init?.authenticated)),
    };
    delete requestInit.authenticated;

    const response = await fetch(`${apiBase}${path}`, requestInit);
    const text = await response.text();
    let payload = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { error: text };
      }
    }

    if (!response.ok) {
      const rawMessage = payload?.error || text || `Request failed (${response.status})`;
      const message = typeof rawMessage === "string"
        ? rawMessage.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240)
        : `Request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    return payload;
  }

  function setAuthenticated(authenticated) {
    elements.loginCard.hidden = authenticated;
    elements.workspace.hidden = !authenticated;

    if (authenticated) {
      renderLoginFeedback("", "info");
    }
  }

  function setFormDisabled(form, disabled) {
    if (!form) {
      return;
    }

    Array.from(form.elements).forEach((field) => {
      field.disabled = disabled;
    });
  }

  function setWorkspaceEnabled(enabled) {
    setFormDisabled(elements.loginForm, !enabled);
    setFormDisabled(elements.searchForm, !enabled);
    setFormDisabled(elements.cardForm, !enabled);
    elements.logoutButton.disabled = !enabled;
    elements.resetButton.disabled = !enabled;
  }

  function setToken(token) {
    state.token = token || "";

    if (state.token) {
      window.localStorage.setItem(tokenStorageKey, state.token);
    } else {
      window.localStorage.removeItem(tokenStorageKey);
    }
  }

  function updateSubmitLabel() {
    if (state.editingEntryId) {
      elements.submitButton.textContent = state.entryMode === "custom" ? "Save Item" : "Save Changes";
      return;
    }

    elements.submitButton.textContent = state.entryMode === "custom" ? "Add Item" : "Add Card";
  }

  function getSelectionPrompt() {
    return state.entryMode === "custom"
      ? "Manual collectible mode is active. Fill in the item details to preview sealed product or other games."
      : "Choose a card from the search results to begin.";
  }

  function getCustomFieldValues() {
    return {
      label: elements.cardForm.elements.label.value,
      game: elements.cardForm.elements.game?.value,
      category: elements.cardForm.elements.category?.value,
      series: elements.cardForm.elements.series?.value,
      variant: elements.cardForm.elements.variant?.value,
      itemNumber: elements.cardForm.elements.itemNumber?.value,
      image: elements.cardForm.elements.image?.value,
      currentPrice: elements.cardForm.elements.currentPrice?.value,
      priceSource: elements.cardForm.elements.priceSource?.value,
      currency: elements.cardForm.elements.currency?.value,
    };
  }

  function renderSelection() {
    if (state.entryMode === "custom") {
      const preview = buildCustomPreviewModel(getCustomFieldValues());

      if (
        preview.title === "Custom collectible" &&
        preview.subtitle === "Set the game, category, series, or variant to describe this item."
      ) {
        elements.selection.innerHTML = getSelectionPrompt();
        return;
      }

      elements.selection.innerHTML = `
        <article class="collection-admin-selection-card">
          ${preview.image ? `<img src="${escapeHtml(preview.image)}" alt="${escapeHtml(preview.title)}" loading="lazy">` : ""}
          <div>
            <p class="collection-eyebrow">Manual Collectible</p>
            <h3>${escapeHtml(preview.title)}</h3>
            <p class="collection-card-copy">${escapeHtml(preview.subtitle)}</p>
            <p class="collection-admin-selection-price">${formatCurrency(preview.currentPrice, preview.currency)}</p>
            <p class="collection-card-copy">${escapeHtml(preview.sourceLabel)}</p>
          </div>
        </article>
      `;
      return;
    }

    const card = state.selectedCard;

    if (!card) {
      elements.selection.innerHTML = getSelectionPrompt();
      return;
    }

    elements.selection.innerHTML = `
      <article class="collection-admin-selection-card">
        ${card.thumbnail ? `<img src="${escapeHtml(card.thumbnail)}" alt="${escapeHtml(card.title)}" loading="lazy">` : ""}
        <div>
          <p class="collection-eyebrow">Selected Card</p>
          <h3>${escapeHtml(card.title)}</h3>
          <p class="collection-card-copy">${escapeHtml(card.subtitle || "Pokemon card")}</p>
          <p class="collection-admin-selection-price">${formatCurrency(card.pricing?.currentPrice, card.pricing?.currency)}</p>
        </div>
      </article>
    `;
  }

  function setEntryMode(mode, options) {
    const nextMode = normalizeEntrySource(mode);
    const preserveValues = Boolean(options?.preserveValues);
    state.entryMode = nextMode;
    elements.cardForm.elements.source.value = nextMode;

    elements.modeButtons.forEach((button) => {
      const isActive = button.getAttribute("data-admin-mode") === nextMode;
      button.classList.toggle("collection-admin-mode-button--active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    if (elements.searchTitle) {
      elements.searchTitle.textContent = nextMode === "custom" ? "Manual Collectible Entry" : "Search Pokemon Cards";
    }

    if (elements.searchCopy) {
      elements.searchCopy.textContent =
        nextMode === "custom"
          ? "Manual mode lets you add sealed product, Riftbound, and other collectibles without a Pokemon API lookup."
          : "Find a Pokemon card, then attach ownership details before saving it to your collection.";
    }

    if (elements.formCopy) {
      elements.formCopy.textContent =
        nextMode === "custom"
          ? "Add the item name, game, product/category details, market price, and ownership information you want to track."
          : "Select a card and save the quantity, cost basis, condition, and notes you want to track.";
    }

    if (elements.labelText) {
      elements.labelText.textContent = nextMode === "custom" ? "Item Name" : "Display Label";
    }

    if (elements.labelInput) {
      elements.labelInput.placeholder =
        nextMode === "custom" ? "Required item name, like Riftbound Booster Box" : "Optional custom display name";
    }

    const customMode = nextMode === "custom";
    elements.searchForm.hidden = customMode;
    elements.customHelper.hidden = !customMode;
    elements.searchFeedback.hidden = customMode;
    elements.searchResults.hidden = customMode;
    elements.searchPagination.hidden = customMode || !state.searchResults.length;
    elements.pokemonOnlyFields.forEach((field) => {
      field.hidden = customMode;
    });

    if (elements.customFields) {
      elements.customFields.hidden = !customMode;
    }

    if (customMode && !state.editingEntryId && !state.selectedCard) {
      elements.cardForm.elements.cardId.value = "";
      elements.cardForm.elements.priceType.value = "";
    }

    if (!customMode && !preserveValues) {
      elements.searchFeedback.textContent = "Search for a card to start building your collection.";
    }

    updateSubmitLabel();
    renderSelection();
  }

  function resetForm(clearSelection) {
    elements.cardForm.reset();
    elements.cardForm.elements.source.value = state.entryMode;
    elements.cardForm.elements.entryId.value = "";
    elements.cardForm.elements.cardId.value = "";
    elements.cardForm.elements.quantity.value = "1";
    if (elements.cardForm.elements.currency) {
      elements.cardForm.elements.currency.value = "USD";
    }
    state.editingEntryId = null;

    if (clearSelection) {
      state.selectedCard = null;
    }

    updateSubmitLabel();
    renderSelection();
  }

  function populateFormFromEntry(entry) {
    const source = normalizeEntrySource(entry.source);
    setEntryMode(source, { preserveValues: true });
    elements.cardForm.elements.source.value = source;
    elements.cardForm.elements.entryId.value = String(entry.id);
    elements.cardForm.elements.cardId.value = entry.cardId || "";
    elements.cardForm.elements.label.value = entry.label || "";
    elements.cardForm.elements.quantity.value = String(entry.quantity || 1);
    elements.cardForm.elements.purchasePrice.value = entry.purchasePrice ?? "";
    elements.cardForm.elements.purchaseDate.value = entry.purchaseDate || "";
    elements.cardForm.elements.priceType.value = entry.priceType || "";
    elements.cardForm.elements.condition.value = entry.condition || "";
    elements.cardForm.elements.notes.value = entry.notes || "";
    if (elements.cardForm.elements.game) {
      elements.cardForm.elements.game.value = entry.game || "";
      elements.cardForm.elements.category.value = entry.category || "";
      elements.cardForm.elements.series.value = entry.series || "";
      elements.cardForm.elements.variant.value = entry.variant || "";
      elements.cardForm.elements.itemNumber.value = entry.itemNumber || "";
      elements.cardForm.elements.image.value = entry.image || "";
      elements.cardForm.elements.currentPrice.value = entry.currentPrice ?? "";
      elements.cardForm.elements.priceSource.value = entry.priceSource || "";
      elements.cardForm.elements.description.value = entry.description || "";
      elements.cardForm.elements.artist.value = entry.artist || "";
      elements.cardForm.elements.currency.value = entry.currency || "USD";
    }
    state.editingEntryId = entry.id;
    updateSubmitLabel();
    renderSelection();
  }

  function beginCreateFlow(card) {
    setEntryMode("api", { preserveValues: true });
    state.selectedCard = card;
    elements.cardForm.elements.source.value = "api";
    elements.cardForm.elements.entryId.value = "";
    elements.cardForm.elements.cardId.value = card.id;
    elements.cardForm.elements.label.value = "";
    elements.cardForm.elements.quantity.value = "1";
    elements.cardForm.elements.purchasePrice.value = "";
    elements.cardForm.elements.purchaseDate.value = "";
    elements.cardForm.elements.priceType.value =
      card.pricing?.priceType && card.pricing.priceType !== "unavailable" ? card.pricing.priceType : "";
    elements.cardForm.elements.condition.value = "";
    elements.cardForm.elements.notes.value = "";
    if (elements.cardForm.elements.game) {
      elements.cardForm.elements.game.value = "";
      elements.cardForm.elements.category.value = "";
      elements.cardForm.elements.series.value = "";
      elements.cardForm.elements.variant.value = "";
      elements.cardForm.elements.itemNumber.value = "";
      elements.cardForm.elements.image.value = "";
      elements.cardForm.elements.currentPrice.value = "";
      elements.cardForm.elements.priceSource.value = "";
      elements.cardForm.elements.description.value = "";
      elements.cardForm.elements.artist.value = "";
      elements.cardForm.elements.currency.value = "USD";
    }
    state.editingEntryId = null;
    updateSubmitLabel();
    renderSelection();
  }

  function getSearchPageCount() {
    return Math.max(1, Math.ceil(state.searchResults.length / SEARCH_RESULTS_PER_PAGE));
  }

  function getVisibleSearchResults() {
    const pageCount = getSearchPageCount();
    const currentPage = Math.min(Math.max(state.searchPage, 1), pageCount);
    const startIndex = (currentPage - 1) * SEARCH_RESULTS_PER_PAGE;
    return state.searchResults.slice(startIndex, startIndex + SEARCH_RESULTS_PER_PAGE);
  }

  function updateSearchFeedback() {
    if (!state.searchResults.length) {
      return;
    }

    const pageCount = getSearchPageCount();
    const currentPage = Math.min(Math.max(state.searchPage, 1), pageCount);
    const start = (currentPage - 1) * SEARCH_RESULTS_PER_PAGE + 1;
    const end = Math.min(start + SEARCH_RESULTS_PER_PAGE - 1, state.searchResults.length);

    elements.searchFeedback.textContent = `${state.searchResults.length} result${state.searchResults.length === 1 ? "" : "s"} found. Showing ${start}-${end}${pageCount > 1 ? `, page ${currentPage} of ${pageCount}` : ""}.`;
  }

  function renderSearchPagination() {
    if (!elements.searchPagination) {
      return;
    }

    const pageCount = getSearchPageCount();

    if (!state.searchResults.length || pageCount <= 1) {
      elements.searchPagination.hidden = true;
      elements.searchPagination.innerHTML = "";
      return;
    }

    const currentPage = Math.min(Math.max(state.searchPage, 1), pageCount);
    const halfWindow = Math.floor(SEARCH_PAGE_BUTTON_WINDOW / 2);
    let startPage = Math.max(1, currentPage - halfWindow);
    let endPage = Math.min(pageCount, startPage + SEARCH_PAGE_BUTTON_WINDOW - 1);
    startPage = Math.max(1, endPage - SEARCH_PAGE_BUTTON_WINDOW + 1);
    const pageButtons = Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index);

    elements.searchPagination.hidden = false;
    elements.searchPagination.innerHTML = `
      <span class="collection-admin-search-pagination-copy">Results</span>
      <button type="button" class="collection-admin-pagination-button" data-admin-search-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>
        Previous
      </button>
      ${pageButtons
        .map(
          (page) => `
            <button
              type="button"
              class="collection-admin-pagination-button${page === currentPage ? " collection-admin-pagination-button--active" : ""}"
              data-admin-search-page="${page}"
              ${page === currentPage ? 'aria-current="page"' : ""}
            >
              ${page}
            </button>`,
        )
        .join("")}
      <button type="button" class="collection-admin-pagination-button" data-admin-search-page="${currentPage + 1}" ${currentPage === pageCount ? "disabled" : ""}>
        Next
      </button>
    `;

    Array.from(elements.searchPagination.querySelectorAll("[data-admin-search-page]")).forEach((button) => {
      button.addEventListener("click", () => {
        const page = Number.parseInt(button.getAttribute("data-admin-search-page") || "", 10);

        if (!Number.isFinite(page)) {
          return;
        }

        state.searchPage = Math.min(Math.max(page, 1), pageCount);
        renderSearchResults();
      });
    });
  }

  function renderSearchResults() {
    const cards = getVisibleSearchResults();

    if (!state.searchResults.length) {
      elements.searchResults.innerHTML = "";
      renderSearchPagination();
      return;
    }

    elements.searchResults.innerHTML = cards
      .map(
        (card) => `
          <article class="collection-card collection-card--vertical">
            <div class="collection-card-media">
              ${card.thumbnail ? `<img src="${escapeHtml(card.thumbnail)}" alt="${escapeHtml(card.title)}" loading="lazy">` : ""}
            </div>
            <div class="collection-card-content">
              <h3>${escapeHtml(card.title)}</h3>
              <p class="collection-card-copy">${escapeHtml(card.subtitle || "Pokemon card")}</p>
              <div class="collection-card-price">${formatCurrency(card.pricing?.currentPrice, card.pricing?.currency)}</div>
              <div class="collection-movement">${escapeHtml(card.pricing?.sourceLabel || "Pokemon TCG API")}</div>
              <div class="collection-admin-card-actions">
                <button type="button" class="collection-admin-secondary" data-admin-pick-card="${escapeHtml(card.id)}">
                  Use This Card
                </button>
              </div>
            </div>
          </article>
        `,
      )
      .join("");

    Array.from(elements.searchResults.querySelectorAll("[data-admin-pick-card]")).forEach((button) => {
      button.addEventListener("click", () => {
        const cardId = button.getAttribute("data-admin-pick-card");
        const card = state.searchResults.find((item) => item.id === cardId);

        if (card) {
          state.cardLookup[detailKey(card.id, card.pricing?.priceType)] = card;
          beginCreateFlow(card);
        }
      });
    });

    updateSearchFeedback();
    renderSearchPagination();
  }

  function renderStoredCards() {
    if (!state.storedCards.length) {
      elements.cardList.innerHTML = `
        <div class="collection-empty">
          No collection items are stored yet. Add a Pokemon card, sealed product, or another TCG collectible above.
        </div>
      `;
      return;
    }

    elements.cardList.innerHTML = state.storedCards
      .map((entry) => {
        const source = normalizeEntrySource(entry.source);
        const lookup =
          source === "api" && entry.cardId
            ? state.cardLookup[detailKey(entry.cardId, entry.priceType)] || state.cardLookup[detailKey(entry.cardId, "")]
            : null;
        const title = getEntryDisplayTitle(entry, lookup);
        const subtitle = getEntryDisplaySubtitle(entry, lookup);
        const thumbnail = normalizeOptionalText(lookup?.thumbnail) || normalizeOptionalText(entry.image);
        const currentPrice = source === "custom" ? entry.currentPrice : lookup?.pricing?.currentPrice;
        const currentCurrency = source === "custom" ? entry.currency : lookup?.pricing?.currency;
        const purchaseCurrency = source === "custom" ? entry.currency || "USD" : "USD";
        const sourceLabel = source === "custom" ? entry.priceSource || "Manual entry" : entry.priceType || "Auto Detect";

        return `
          <article class="collection-admin-entry">
            <div class="collection-admin-entry-copy">
              ${thumbnail ? `<img src="${escapeHtml(thumbnail)}" alt="${escapeHtml(title)}" loading="lazy">` : ""}
              <div>
                <h3>${escapeHtml(title)}</h3>
                <p>${escapeHtml(subtitle)}</p>
                <div class="collection-admin-entry-meta">
                  <span>${escapeHtml(source === "custom" ? "Manual" : "Pokemon API")}</span>
                  <span>Qty ${escapeHtml(String(entry.quantity || 1))}</span>
                  <span>Cost ${formatCurrency(entry.purchasePrice, purchaseCurrency)}</span>
                  <span>Market ${formatCurrency(currentPrice, currentCurrency || "USD")}</span>
                  <span>${escapeHtml(sourceLabel)}</span>
                </div>
              </div>
            </div>
            <div class="collection-admin-entry-actions">
              <button type="button" class="collection-admin-secondary" data-admin-edit-entry="${entry.id}">Edit</button>
              <button type="button" class="collection-admin-danger" data-admin-delete-entry="${entry.id}">Delete</button>
            </div>
          </article>
        `;
      })
      .join("");

    Array.from(elements.cardList.querySelectorAll("[data-admin-edit-entry]")).forEach((button) => {
      button.addEventListener("click", () => {
        const entryId = Number.parseInt(button.getAttribute("data-admin-edit-entry") || "", 10);
        const entry = state.storedCards.find((item) => item.id === entryId);

        if (entry) {
          editEntry(entry).catch((error) => {
            renderStatus(error instanceof Error ? error.message : "Failed to load card details.", "error");
          });
        }
      });
    });

    Array.from(elements.cardList.querySelectorAll("[data-admin-delete-entry]")).forEach((button) => {
      button.addEventListener("click", () => {
        const entryId = Number.parseInt(button.getAttribute("data-admin-delete-entry") || "", 10);
        const entry = state.storedCards.find((item) => item.id === entryId);

        if (entry) {
          removeEntry(entry).catch((error) => {
            renderStatus(error instanceof Error ? error.message : "Failed to delete card.", "error");
          });
        }
      });
    });
  }

  async function warmCardLookup(entries) {
    const uniqueEntries = [];
    const seen = new Set();

    entries.forEach((entry) => {
      if (normalizeEntrySource(entry.source) !== "api" || !entry.cardId) {
        return;
      }

      const key = detailKey(entry.cardId, entry.priceType);
      if (!seen.has(key)) {
        seen.add(key);
        uniqueEntries.push(entry);
      }
    });

    const results = await Promise.allSettled(
      uniqueEntries.map((entry) =>
        apiJson(`/api/pokemon/cards/${encodeURIComponent(entry.cardId)}${entry.priceType ? `?priceType=${encodeURIComponent(entry.priceType)}` : ""}`),
      ),
    );

    results.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value?.card) {
        const entry = uniqueEntries[index];
        state.cardLookup[detailKey(entry.cardId, entry.priceType)] = result.value.card;
      }
    });
  }

  async function loadStoredCards() {
    const payload = await apiJson("/api/admin/collection/cards", { authenticated: true });
    state.storedCards = Array.isArray(payload?.cards) ? payload.cards : [];
    await warmCardLookup(state.storedCards);
    renderStoredCards();
  }

  async function searchCards(query) {
    if (state.entryMode === "custom") {
      return;
    }

    if (!query.trim()) {
      state.searchResults = [];
      state.searchPage = 1;
      elements.searchFeedback.textContent = "Enter a card name or card number to search.";
      renderSearchResults();
      return;
    }

    elements.searchFeedback.textContent = "Searching Pokemon TCG API...";
    const payload = await apiJson(`/api/pokemon/cards/search?q=${encodeURIComponent(query)}`);
    state.searchResults = Array.isArray(payload?.cards) ? payload.cards : [];
    state.searchPage = 1;

    if (!state.searchResults.length) {
      elements.searchFeedback.textContent = "No results found. Try a different card name or number.";
      renderSearchResults();
      return;
    }

    renderSearchResults();
  }

  async function editEntry(entry) {
    if (normalizeEntrySource(entry.source) === "custom") {
      state.selectedCard = null;
      populateFormFromEntry(entry);
      renderStatus(`Editing ${getEntryDisplayTitle(entry)}.`, "worker");
      return;
    }

    const query = entry.priceType ? `?priceType=${encodeURIComponent(entry.priceType)}` : "";
    const payload = await apiJson(`/api/pokemon/cards/${encodeURIComponent(entry.cardId)}${query}`);
    const card = payload?.card;

    if (!card) {
      throw new Error("Card detail unavailable.");
    }

    state.cardLookup[detailKey(entry.cardId, entry.priceType)] = card;
    state.selectedCard = card;
    populateFormFromEntry(entry);
    renderSelection();
    renderStatus(`Editing ${entry.label || card.cardName || entry.cardId}.`, "worker");
  }

  async function removeEntry(entry) {
    const confirmDelete = window.confirm(`Remove ${getEntryDisplayTitle(entry)} from the collection?`);

    if (!confirmDelete) {
      return;
    }

    await apiJson(`/api/admin/collection/cards/${entry.id}`, {
      method: "DELETE",
      authenticated: true,
    });

    if (state.editingEntryId === entry.id) {
      resetForm(true);
    }

    await loadStoredCards();
    renderStatus("Card removed from the Cloudflare collection backend.", "worker");
  }

  async function submitCardForm(event) {
    event.preventDefault();

    const formData = new FormData(elements.cardForm);
    const payload = buildCollectionEntryPayload(Object.fromEntries(formData.entries()), state.entryMode);

    if (payload.source === "api" && !payload.cardId) {
      renderStatus("Choose a card before saving it to the collection.", "error");
      return;
    }

    if (payload.source === "custom" && !payload.label) {
      renderStatus("Add an item name before saving a manual collectible.", "error");
      return;
    }

    const entryId = String(formData.get("entryId") || "").trim();
    const path = entryId ? `/api/admin/collection/cards/${encodeURIComponent(entryId)}` : "/api/admin/collection/cards";

    await apiJson(path, {
      method: entryId ? "PUT" : "POST",
      authenticated: true,
      body: JSON.stringify(payload),
      headers: buildHeaders(true),
    });

    await loadStoredCards();
    renderStatus(
      entryId
        ? "Collection item updated in Cloudflare."
        : payload.source === "custom"
          ? "Custom collectible added to your Cloudflare-backed collection."
          : "Card added to your Cloudflare-backed collection.",
      "worker",
    );
    resetForm(true);
  }

  async function submitLogin(event) {
    event.preventDefault();
    renderLoginFeedback("Signing in...", "info");

    const formData = new FormData(elements.loginForm);
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "");

    const payload = await apiJson("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
      headers: buildHeaders(false),
    });

    setToken(payload.token);
    state.user = payload.user || null;
    elements.sessionCopy.textContent = `Signed in as ${payload.user?.username || username}.`;
    setAuthenticated(true);
    notifyAuthChanged({
      token: payload.token,
      username: payload.user?.username || username,
    });
    clearRequiredLoginFlag();
    renderStatus("Admin session ready. You can now search and save cards.", "worker");
    await loadStoredCards();
  }

  async function checkSession() {
    if (!apiBase) {
      setAuthenticated(false);
      setWorkspaceEnabled(false);
      notifyAuthChanged({ signedOut: true, token: "" });
      renderLoginFeedback("Set pokemon_api_base_url before using the admin login.", "error");
      renderStatus("Set site.pokemon_api_base_url to your Cloudflare Worker URL to use the admin workspace.", "error");
      return;
    }

    setWorkspaceEnabled(true);

    if (!state.token) {
      setAuthenticated(false);
      renderLoginFeedback(
        requiresLogin
          ? "Admin login required before you can manage the collection."
          : "Use your configured admin username and plain password to sign in.",
        requiresLogin ? "error" : "info",
      );
      renderStatus(
        requiresLogin
          ? "Sign in with the configured admin account to open the collection workspace."
          : "Sign in to manage the Cloudflare-backed collection.",
        requiresLogin ? "error" : "info",
      );
      focusLoginField();
      return;
    }

    try {
      const payload = await apiJson("/api/auth/session", {
        method: "GET",
        authenticated: true,
      });

      state.user = payload.user || null;
      elements.sessionCopy.textContent = `Signed in as ${payload.user?.username || "admin"}.`;
      setAuthenticated(true);
      notifyAuthChanged({
        token: state.token,
        username: payload.user?.username || "admin",
      });
      clearRequiredLoginFlag();
      renderStatus("Admin session restored.", "worker");
      await loadStoredCards();
    } catch (error) {
      setToken("");
      setAuthenticated(false);
      notifyAuthChanged({ signedOut: true, token: "" });
      renderLoginFeedback("Your previous admin session expired. Sign in again.", "error");
      renderStatus(error instanceof Error ? error.message : "Session expired. Sign in again.", "error");
      focusLoginField();
    }
  }

  function logout() {
    setToken("");
    state.user = null;
    state.searchResults = [];
    state.storedCards = [];
    state.cardLookup = {};
    state.selectedCard = null;
    elements.searchResults.innerHTML = "";
    elements.cardList.innerHTML = "";
    elements.searchFeedback.textContent = "Search for a card to start building your collection.";
    setEntryMode("api", { preserveValues: true });
    resetForm(true);
    renderLoginFeedback("You have been signed out.", "info");
    setAuthenticated(false);
    notifyAuthChanged({ signedOut: true, token: "" });
    renderStatus("Signed out. Sign in to manage the Cloudflare-backed collection.", "info");
    focusLoginField();
  }

  function bindEvents() {
    elements.loginForm.addEventListener("submit", (event) => {
      submitLogin(event).catch((error) => {
        const message = error instanceof Error ? error.message : "Login failed.";
        renderLoginFeedback(message, "error");
        renderStatus(message, "error");
      });
    });

    elements.searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = new FormData(elements.searchForm).get("query");
      searchCards(String(query || "")).catch((error) => {
        elements.searchFeedback.textContent = error instanceof Error ? error.message : "Search failed.";
      });
    });

    elements.modeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.getAttribute("data-admin-mode") || "api";
        state.selectedCard = null;
        setEntryMode(mode, { preserveValues: true });

        if (normalizeEntrySource(mode) === "api") {
          elements.searchFeedback.textContent = "Search for a card to start building your collection.";
        }

        renderStatus(
          normalizeEntrySource(mode) === "custom"
            ? "Manual collectible mode is ready for sealed product and other TCG entries."
            : "Pokemon card search mode is ready.",
          "info",
        );
      });
    });

    elements.cardForm.addEventListener("submit", (event) => {
      submitCardForm(event).catch((error) => {
        renderStatus(error instanceof Error ? error.message : "Failed to save card.", "error");
      });
    });

    elements.cardForm.addEventListener("input", () => {
      if (state.entryMode === "custom") {
        renderSelection();
      }
    });

    elements.resetButton.addEventListener("click", () => {
      resetForm(true);
      renderStatus("Form cleared.", "info");
    });

    elements.logoutButton.addEventListener("click", () => {
      logout();
    });
  }

  setEntryMode("api", { preserveValues: true });
  bindEvents();
  checkSession().catch((error) => {
    renderLoginFeedback(error instanceof Error ? error.message : "Admin workspace failed to initialize.", "error");
    renderStatus(error instanceof Error ? error.message : "Admin workspace failed to initialize.", "error");
  });
})();

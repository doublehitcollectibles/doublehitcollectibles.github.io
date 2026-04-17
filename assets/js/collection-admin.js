(function () {
  const app = document.querySelector("[data-collection-admin-app]");

  if (!app) {
    return;
  }

  const apiBase = (app.dataset.apiBase || "").trim().replace(/\/$/, "");
  const tokenStorageKey = "doublehit.collection.admin.token";

  const elements = {
    status: app.querySelector("[data-admin-status]"),
    loginCard: app.querySelector("[data-admin-login-card]"),
    loginForm: app.querySelector("[data-admin-login-form]"),
    workspace: app.querySelector("[data-admin-workspace]"),
    sessionCopy: app.querySelector("[data-admin-session-copy]"),
    logoutButton: app.querySelector("[data-admin-logout]"),
    searchForm: app.querySelector("[data-admin-search-form]"),
    searchFeedback: app.querySelector("[data-admin-search-feedback]"),
    searchResults: app.querySelector("[data-admin-search-results]"),
    selection: app.querySelector("[data-admin-selection]"),
    cardForm: app.querySelector("[data-admin-card-form]"),
    submitButton: app.querySelector("[data-admin-submit]"),
    resetButton: app.querySelector("[data-admin-reset]"),
    cardList: app.querySelector("[data-admin-card-list]"),
  };

  const state = {
    token: window.localStorage.getItem(tokenStorageKey) || "",
    user: null,
    searchResults: [],
    selectedCard: null,
    storedCards: [],
    cardLookup: {},
    editingEntryId: null,
  };

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
    elements.submitButton.textContent = state.editingEntryId ? "Save Changes" : "Add Card";
  }

  function resetForm(clearSelection) {
    elements.cardForm.reset();
    elements.cardForm.elements.entryId.value = "";
    elements.cardForm.elements.cardId.value = "";
    elements.cardForm.elements.quantity.value = "1";
    state.editingEntryId = null;
    updateSubmitLabel();

    if (clearSelection) {
      state.selectedCard = null;
      elements.selection.innerHTML = "Choose a card from the search results to begin.";
    }
  }

  function renderSelection() {
    const card = state.selectedCard;

    if (!card) {
      elements.selection.innerHTML = "Choose a card from the search results to begin.";
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

  function populateFormFromEntry(entry) {
    elements.cardForm.elements.entryId.value = String(entry.id);
    elements.cardForm.elements.cardId.value = entry.cardId;
    elements.cardForm.elements.label.value = entry.label || "";
    elements.cardForm.elements.quantity.value = String(entry.quantity || 1);
    elements.cardForm.elements.purchasePrice.value = entry.purchasePrice ?? "";
    elements.cardForm.elements.purchaseDate.value = entry.purchaseDate || "";
    elements.cardForm.elements.priceType.value = entry.priceType || "";
    elements.cardForm.elements.condition.value = entry.condition || "";
    elements.cardForm.elements.notes.value = entry.notes || "";
    state.editingEntryId = entry.id;
    updateSubmitLabel();
  }

  function beginCreateFlow(card) {
    state.selectedCard = card;
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
    state.editingEntryId = null;
    updateSubmitLabel();
    renderSelection();
  }

  function renderSearchResults(cards) {
    if (!cards.length) {
      elements.searchResults.innerHTML = "";
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
  }

  function renderStoredCards() {
    if (!state.storedCards.length) {
      elements.cardList.innerHTML = `
        <div class="collection-empty">
          No cards are stored yet. Search for a card above and save your first collection entry.
        </div>
      `;
      return;
    }

    elements.cardList.innerHTML = state.storedCards
      .map((entry) => {
        const lookup =
          state.cardLookup[detailKey(entry.cardId, entry.priceType)] || state.cardLookup[detailKey(entry.cardId, "")];
        const title = entry.label || lookup?.cardName || lookup?.title || entry.cardId;
        const subtitle = lookup?.subtitle || entry.condition || "Stored collection card";

        return `
          <article class="collection-admin-entry">
            <div class="collection-admin-entry-copy">
              ${lookup?.thumbnail ? `<img src="${escapeHtml(lookup.thumbnail)}" alt="${escapeHtml(title)}" loading="lazy">` : ""}
              <div>
                <h3>${escapeHtml(title)}</h3>
                <p>${escapeHtml(subtitle)}</p>
                <div class="collection-admin-entry-meta">
                  <span>Qty ${escapeHtml(String(entry.quantity || 1))}</span>
                  <span>Cost ${formatCurrency(entry.purchasePrice, "USD")}</span>
                  <span>${escapeHtml(entry.priceType || "Auto Detect")}</span>
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
    if (!query.trim()) {
      state.searchResults = [];
      elements.searchFeedback.textContent = "Enter a card name or card number to search.";
      renderSearchResults([]);
      return;
    }

    elements.searchFeedback.textContent = "Searching Pokemon TCG API...";
    const payload = await apiJson(`/api/pokemon/cards/search?q=${encodeURIComponent(query)}`);
    state.searchResults = Array.isArray(payload?.cards) ? payload.cards : [];
    elements.searchFeedback.textContent = `${state.searchResults.length} result${state.searchResults.length === 1 ? "" : "s"} found.`;
    renderSearchResults(state.searchResults);
  }

  async function editEntry(entry) {
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
    const confirmDelete = window.confirm(`Remove ${entry.label || entry.cardId} from the collection?`);

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
    const cardId = String(formData.get("cardId") || "").trim();

    if (!cardId) {
      renderStatus("Choose a card before saving it to the collection.", "error");
      return;
    }

    const payload = {
      cardId,
      label: String(formData.get("label") || "").trim() || undefined,
      quantity: Number.parseInt(String(formData.get("quantity") || "1"), 10) || 1,
      purchasePrice: String(formData.get("purchasePrice") || "").trim() === ""
        ? undefined
        : Number.parseFloat(String(formData.get("purchasePrice"))),
      purchaseDate: String(formData.get("purchaseDate") || "").trim() || undefined,
      priceType: String(formData.get("priceType") || "").trim() || undefined,
      condition: String(formData.get("condition") || "").trim() || undefined,
      notes: String(formData.get("notes") || "").trim() || undefined,
    };

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
      entryId ? "Collection card updated in Cloudflare." : "Card added to your Cloudflare-backed collection.",
      "worker",
    );
    resetForm(true);
  }

  async function submitLogin(event) {
    event.preventDefault();

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
    renderStatus("Admin session ready. You can now search and save cards.", "worker");
    await loadStoredCards();
  }

  async function checkSession() {
    if (!apiBase) {
      setAuthenticated(false);
      setWorkspaceEnabled(false);
      renderStatus("Set site.pokemon_api_base_url to your Cloudflare Worker URL to use the admin workspace.", "error");
      return;
    }

    setWorkspaceEnabled(true);

    if (!state.token) {
      setAuthenticated(false);
      renderStatus("Sign in to manage the Cloudflare-backed collection.", "info");
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
      renderStatus("Admin session restored.", "worker");
      await loadStoredCards();
    } catch (error) {
      setToken("");
      setAuthenticated(false);
      renderStatus(error instanceof Error ? error.message : "Session expired. Sign in again.", "error");
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
    resetForm(true);
    setAuthenticated(false);
    renderStatus("Signed out. Sign in to manage the Cloudflare-backed collection.", "info");
  }

  function bindEvents() {
    elements.loginForm.addEventListener("submit", (event) => {
      submitLogin(event).catch((error) => {
        renderStatus(error instanceof Error ? error.message : "Login failed.", "error");
      });
    });

    elements.searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = new FormData(elements.searchForm).get("query");
      searchCards(String(query || "")).catch((error) => {
        elements.searchFeedback.textContent = error instanceof Error ? error.message : "Search failed.";
      });
    });

    elements.cardForm.addEventListener("submit", (event) => {
      submitCardForm(event).catch((error) => {
        renderStatus(error instanceof Error ? error.message : "Failed to save card.", "error");
      });
    });

    elements.resetButton.addEventListener("click", () => {
      resetForm(true);
      renderStatus("Form cleared.", "info");
    });

    elements.logoutButton.addEventListener("click", () => {
      logout();
    });
  }

  bindEvents();
  checkSession().catch((error) => {
    renderStatus(error instanceof Error ? error.message : "Admin workspace failed to initialize.", "error");
  });
})();

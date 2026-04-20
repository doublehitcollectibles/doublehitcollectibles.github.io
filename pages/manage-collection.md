---
layout: page
title: Manage Double Hit Collection
description: Secure admin workspace for the Double Hit Collectibles collection.
permalink: /manage-collection/
page_class: collection-page collection-admin-page
---

<section
  class="collection-app collection-admin-app"
  data-collection-admin-app
  data-api-base="{{ site.pokemon_api_base_url | default: '' }}"
>
  <header class="collection-hero">
    <p class="collection-eyebrow">Collection Admin</p>
    <h1>Manage Double Hit Collection</h1>
    <p class="collection-lead">
      Sign in to search Pokemon cards, log sealed product, and add other TCG collectibles like Riftbound directly to
      the Cloudflare backend that powers the live collection page.
    </p>
    <div class="collection-status" data-admin-status>
      Preparing admin workspace...
    </div>
    <div class="collection-hero-actions">
      <a class="collection-action-link" href="{{ '/collection/' | relative_url }}">View Collection</a>
    </div>
  </header>

  <section class="collection-admin-shell">
    <section class="collection-grid-wrap collection-admin-card" data-admin-login-card>
      <div class="collection-section-heading">
        <div>
          <h2>Admin Login</h2>
          <p>Use the username and password configured in your Cloudflare Worker environment.</p>
        </div>
      </div>

      <form class="collection-admin-form" data-admin-login-form>
        <label class="collection-admin-field">
          <span>Username</span>
          <input type="text" name="username" autocomplete="username" required />
        </label>
        <label class="collection-admin-field">
          <span>Password</span>
          <input type="password" name="password" autocomplete="current-password" required />
        </label>
        <div class="collection-admin-actions">
          <button type="submit">Sign In</button>
        </div>
      </form>
      <div class="collection-admin-feedback" data-admin-login-feedback hidden></div>
    </section>

    <section class="collection-grid-wrap collection-admin-card" data-admin-workspace hidden>
      <div class="collection-section-heading">
        <div>
          <h2>Collection Workspace</h2>
          <p data-admin-session-copy>Signed in.</p>
        </div>
        <div class="collection-hero-actions">
          <button class="collection-action-link collection-action-link--button" type="button" data-admin-logout>
            Sign Out
          </button>
        </div>
      </div>

      <div class="collection-admin-mode-switch" data-admin-mode-switch>
        <button type="button" class="collection-admin-mode-button collection-admin-mode-button--active" data-admin-mode="api">
          Pokemon Cards
        </button>
        <button type="button" class="collection-admin-mode-button" data-admin-mode="custom">
          Sealed + Other Games
        </button>
      </div>

      <div class="collection-admin-grid">
        <section class="collection-admin-panel">
          <div class="collection-section-heading">
            <div>
              <h2 data-admin-search-title>Search Pokemon Cards</h2>
              <p data-admin-search-copy>Find a Pokemon card, then attach ownership details before saving it to your collection.</p>
            </div>
          </div>

          <form class="collection-search-form collection-admin-search-form" data-admin-search-form>
            <label class="screen-reader-text" for="collection-admin-search-input">Search cards</label>
            <input
              id="collection-admin-search-input"
              name="query"
              type="search"
              placeholder="Search a card like Mewtwo 281"
              autocomplete="off"
            />
            <button type="submit">Search</button>
          </form>
          <div class="collection-admin-helper" data-admin-custom-helper hidden>
            <h3>Manual collectible mode</h3>
            <p>Add sealed product or other games from the form on the right. This mode is ideal for Pokemon sealed, Riftbound singles, decks, booster boxes, promos, and anything else without a live API lookup.</p>
            <div class="collection-admin-helper-tags">
              <span>Pokemon ETB</span>
              <span>Riftbound Single</span>
              <span>Booster Box</span>
              <span>Promo Pack</span>
            </div>
          </div>
          <div class="collection-search-feedback" data-admin-search-feedback>
            Search for a card to start building your collection.
          </div>
          <div class="collection-grid collection-admin-results" data-admin-search-results></div>
          <div class="collection-admin-search-pagination" data-admin-search-pagination hidden></div>
        </section>

        <section class="collection-admin-panel">
          <div class="collection-section-heading">
            <div>
              <h2>Item Details</h2>
              <p data-admin-form-copy>Select a card and save the quantity, cost basis, condition, and notes you want to track.</p>
            </div>
          </div>

          <div class="collection-admin-selection" data-admin-selection>
            Choose a card from the search results or switch to manual collectible mode.
          </div>

          <form class="collection-admin-form" data-admin-card-form>
            <input type="hidden" name="source" value="api" />
            <input type="hidden" name="cardId" />
            <input type="hidden" name="entryId" />

            <label class="collection-admin-field">
              <span data-admin-label-text>Display Label</span>
              <input
                type="text"
                name="label"
                placeholder="Optional custom display name"
                data-admin-label-input
              />
            </label>

            <div class="collection-admin-form-grid">
              <label class="collection-admin-field">
                <span>Quantity</span>
                <input type="number" name="quantity" min="1" step="1" value="1" required />
              </label>
              <label class="collection-admin-field">
                <span>Purchase Price</span>
                <input type="number" name="purchasePrice" min="0" step="0.01" placeholder="0.00" />
              </label>
              <label class="collection-admin-field">
                <span>Purchase Date</span>
                <input type="date" name="purchaseDate" />
              </label>
              <label class="collection-admin-field" data-admin-pokemon-only>
                <span>Price Type</span>
                <select name="priceType">
                  <option value="">Auto Detect</option>
                  <option value="normal">normal</option>
                  <option value="holofoil">holofoil</option>
                  <option value="reverseHolofoil">reverseHolofoil</option>
                  <option value="1stEditionHolofoil">1stEditionHolofoil</option>
                  <option value="1stEditionNormal">1stEditionNormal</option>
                  <option value="unlimitedHolofoil">unlimitedHolofoil</option>
                  <option value="unlimitedNormal">unlimitedNormal</option>
                </select>
              </label>
            </div>

            <div class="collection-admin-custom-fields" data-admin-custom-fields hidden>
              <div class="collection-admin-form-grid">
                <label class="collection-admin-field">
                  <span>Game</span>
                  <input type="text" name="game" placeholder="Pokemon, Riftbound, One Piece..." />
                </label>
                <label class="collection-admin-field">
                  <span>Category</span>
                  <input type="text" name="category" placeholder="Sealed Product, Single, Deck..." />
                </label>
                <label class="collection-admin-field">
                  <span>Series / Set</span>
                  <input type="text" name="series" placeholder="Ascended Heroes, Origins..." />
                </label>
                <label class="collection-admin-field">
                  <span>Variant</span>
                  <input type="text" name="variant" placeholder="Pokemon Center ETB, Showcase..." />
                </label>
                <label class="collection-admin-field">
                  <span>Item Number</span>
                  <input type="text" name="itemNumber" placeholder="44, GG45/GG70, SKU..." />
                </label>
                <label class="collection-admin-field">
                  <span>Current Market Price</span>
                  <input type="number" name="currentPrice" min="0" step="0.01" placeholder="0.00" />
                </label>
                <label class="collection-admin-field">
                  <span>Price Source</span>
                  <input type="text" name="priceSource" placeholder="Manual, TCGplayer, eBay sold..." />
                </label>
                <label class="collection-admin-field">
                  <span>Currency</span>
                  <select name="currency">
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="CAD">CAD</option>
                  </select>
                </label>
              </div>

              <div class="collection-admin-form-grid">
                <label class="collection-admin-field">
                  <span>Image URL</span>
                  <input type="url" name="image" placeholder="https://..." />
                </label>
                <label class="collection-admin-field">
                  <span>Artist / Maker</span>
                  <input type="text" name="artist" placeholder="Optional artist, brand, or manufacturer" />
                </label>
              </div>

              <label class="collection-admin-field">
                <span>Description</span>
                <textarea
                  name="description"
                  rows="3"
                  placeholder="Add quick notes about the product, finish, rarity, or edition..."
                ></textarea>
              </label>
            </div>

            <label class="collection-admin-field">
              <span>Condition</span>
              <input type="text" name="condition" placeholder="Near Mint, PSA 10, Binder copy..." />
            </label>

            <label class="collection-admin-field">
              <span>Notes</span>
              <textarea name="notes" rows="4" placeholder="Why you bought it, what makes it important, grading notes..."></textarea>
            </label>

            <div class="collection-admin-actions">
              <button type="submit" data-admin-submit>Add Card</button>
              <button type="button" class="collection-admin-secondary" data-admin-reset>Clear</button>
            </div>
          </form>
        </section>
      </div>

      <section class="collection-admin-panel">
        <div class="collection-section-heading">
          <div>
            <h2>Stored Collection Items</h2>
            <p>Your Cloudflare-backed collection entries across Pokemon cards, sealed product, and other games.</p>
          </div>
        </div>

        <div class="collection-admin-list" data-admin-card-list>
          Loading collection cards...
        </div>
      </section>
    </section>
  </section>
</section>

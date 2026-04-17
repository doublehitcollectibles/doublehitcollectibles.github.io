---
layout: page
title: Double Hit Collectibles Collection
description: Explore the Double Hit Collectibles collection, current pricing, and tracked card history.
permalink: /collection/
page_class: collection-page
---

<section
  class="collection-app"
  data-collection-app
  data-api-base="{{ site.pokemon_api_base_url | default: '' }}"
  data-direct-api="https://api.pokemontcg.io/v2"
  data-owned-cards-url="{{ '/assets/data/owned-cards.json' | relative_url }}"
>
  <header class="collection-hero">
    <p class="collection-eyebrow">Double Hit Collectibles</p>
    <h1>Double Hit Collectibles Collection</h1>
    <p class="collection-lead">
      A live collection wall for the cards and sealed products you own, with current market pricing, cost basis, price
      movement, and card context that helps visitors understand what makes each piece stand out.
    </p>
    <div class="collection-status" data-collection-status>
      Preparing collection data...
    </div>
    <div class="collection-hero-actions">
      <a
        class="collection-action-link"
        href="{{ '/manage-collection/' | relative_url }}"
        data-manage-collection-link
      >
        Manage Collection
      </a>
    </div>
    <form class="collection-search-form collection-search-form--hero" data-card-search-form>
      <label class="screen-reader-text" for="collection-search-input">Search cards</label>
      <input
        id="collection-search-input"
        name="query"
        type="search"
        placeholder="Search a card like Mewtwo 281"
        autocomplete="off"
      />
      <button type="submit">Search</button>
    </form>
  </header>

  <section class="collection-search">
    <div class="collection-section-heading">
      <h2>Card Explorer</h2>
      <p>Search the Pokemon TCG API to surface card details, current prices, and supporting context for visitors.</p>
    </div>
    <div class="collection-search-feedback" data-search-feedback></div>
    <div class="collection-search-results" data-search-results></div>
  </section>

  <section class="collection-detail" data-card-detail>
    <div class="collection-section-heading">
      <h2>Card Detail</h2>
      <p>Select a card from your collection or the search results to view its card data and pricing history.</p>
    </div>
    <div class="collection-detail-panel" data-card-detail-panel>
      Choose a card to inspect its artwork, set details, weaknesses, attacks, legality, and market profile.
    </div>
  </section>

  <section class="collection-summary" data-collection-summary></section>

  <section class="collection-grid-wrap">
    <div class="collection-section-heading">
      <h2>Tracked Collection</h2>
      <p>Your owned cards and products, rendered in a collection grid with current pricing and movement at a glance.</p>
    </div>
    <div class="collection-grid" data-owned-grid></div>
    <div class="collection-empty" data-owned-empty hidden>
      Sign in on the manage page to add cards to your Cloudflare-backed collection inventory.
    </div>
  </section>
</section>

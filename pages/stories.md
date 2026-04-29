---
layout: story-index
title: Stories
description: Published Double Hit Collectibles stories and articles.
permalink: /stories/
page_class: story-index-page
---

<section
  class="story-index-app"
  data-story-index-app
  data-api-base="{{ site.pokemon_api_base_url | default: '' }}"
  data-story-template-url="{{ '/story/' | relative_url }}"
>
  <p class="post-info story-index-eyebrow">Published Stories</p>
  <h1 class="post-title" data-pretext-balance data-pretext-target-lines="3">Stories + Articles</h1>
  <p class="post-subtitle" data-pretext-measure>
    Read the latest Double Hit Collectibles updates, collection notes, and longer-form stories as they are published.
  </p>

  <div class="story-index-status" data-story-index-status>
    Loading published stories...
  </div>
  <div
    data-story-index-static-story
    data-title="Welcome to Double Hit Collectibles"
    data-description="Learn what Double Hit Collectibles is, what this site is meant to document, and the future plans for updates, highlights, stories, and vending shows."
    data-url="{{ '/welcome-to-double-hit-collectibles/' | absolute_url }}"
    data-cover-url="{{ '/assets/img/blog-image.png' | absolute_url }}"
    data-cover-alt="Double Hit Collectibles welcome article cover"
    data-published-at="2026-04-15T12:00:00-07:00"
    data-cta="Read Article"
    hidden
  ></div>
  <section class="story-index-grid" data-story-index-list></section>
</section>

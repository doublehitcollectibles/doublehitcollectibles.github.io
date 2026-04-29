---
layout: page
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
  <header class="story-index-hero">
    <p class="story-index-eyebrow">Published Stories</p>
    <h1>Stories + Articles</h1>
    <p>
      Read the latest Double Hit Collectibles updates, collection notes, and longer-form stories as they are published.
    </p>
  </header>

  <div class="story-index-status" data-story-index-status>
    Loading published stories...
  </div>
  <section class="story-index-grid" data-story-index-list></section>
</section>

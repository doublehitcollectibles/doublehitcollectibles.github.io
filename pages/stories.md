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
  <section class="story-index-grid" data-story-index-list></section>
</section>

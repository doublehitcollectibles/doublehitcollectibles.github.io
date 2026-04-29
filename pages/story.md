---
layout: page
title: Story
description: Read a Double Hit Collectibles story.
permalink: /story/
page_class: collection-page story-public-page
---

<section
  class="story-public-app"
  data-story-public-app
  data-api-base="{{ site.pokemon_api_base_url | default: '' }}"
>
  <article class="story-template-post story-public-post" data-story-public-article hidden>
    <p class="post-info">
      <span data-story-public-date>Loading story...</span>
      <span data-story-public-minutes></span>
    </p>
    <h1 class="post-title" data-story-public-title></h1>
    <p class="post-subtitle" data-story-public-subtitle></p>
    <img class="post-cover story-template-cover" data-story-public-cover alt="" hidden />
    <div class="story-rendered-body" data-story-public-body></div>
  </article>

  <section class="collection-grid-wrap story-public-state" data-story-public-state>
    Loading story...
  </section>
</section>

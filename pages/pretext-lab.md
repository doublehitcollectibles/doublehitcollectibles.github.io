---
layout: pretext-page
title: Pretext Foundation
description: Shared Pretext runtime and a dedicated layout for Double Hit Collectibles.
permalink: /pretext-lab/
eyebrow: Shared text layout system
hero_intro: Pretext is now wired into the project as a shared runtime, so extension pages can use the raw library APIs or drop into reusable balanced headlines, measured copy blocks, and rich inline ribbons without redoing the plumbing.
pretext_target_lines: 3
hero_ribbon:
  - text: Site-wide runtime
    className: pretext-pill pretext-pill--accent
    break: never
    extraWidth: 36
  - text: Balanced headlines
    className: pretext-pill
    break: never
    extraWidth: 34
  - text: Rich inline fragments
    className: pretext-pill
    break: never
    extraWidth: 42
  - text: Measured text blocks
    className: pretext-pill
    break: never
    extraWidth: 38
stats:
  - label: Runtime surface
    value: Shared across the whole site
  - label: Page model
    value: New pretext powered layout
  - label: Direct access
    value: window.DoubleHitPretext.api
section_title: How the new foundation works
feature_cards:
  - kicker: Runtime
    title: Raw Pretext APIs are exposed globally
    description: Any page can call window.DoubleHitPretext.api for paragraph measurement, line walking, line materialization, or locale controls, and can reach the rich inline helpers through window.DoubleHitPretext.richInline.
  - kicker: Layout
    title: Pretext page layouts ship with live components
    description: This page uses the shared runtime to balance headings, predict measured copy height, and render rich inline pills so extension pages can start from a working pattern instead of custom setup.
  - kicker: Existing theme
    title: Jekflix pages now have optional Pretext hooks too
    description: Featured titles, post cards, and post detail headings can already take advantage of the new runtime, which makes the integration site-wide rather than limited to one lab page.
  - kicker: Workflow
    title: GitHub Pages rebuilds the bundle automatically
    description: The Pages workflow now installs the frontend dependencies and runs the Gulp build before Jekyll, so the deployed site keeps the shared runtime in sync with source changes.
---

This is the first working pass of a Pretext foundation inside the current Jekyll site.

### What changed

- Pretext is installed as a project dependency instead of being pasted in as a one-off script.
- The frontend build now bundles a dedicated runtime so the library is available to the whole site.
- A new `pretext-page` layout gives us a clean place to design future editorial or collectible-specific landing pages around Pretext behaviors.

### How extension pages can use it

Use the shared runtime in two ways:

- Declaratively, with `data-pretext-balance`, `data-pretext-measure`, and `data-pretext-rich-inline`.
- Programmatically, with `window.DoubleHitPretext.api` and `window.DoubleHitPretext.richInline`.

That means we can keep Jekyll for content and routing while adding Pretext-driven experiences where they actually matter: product stories, launch pages, feature callouts, collector guides, and other custom surfaces.

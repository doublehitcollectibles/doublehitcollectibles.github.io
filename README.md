# Doublehit Collectibles

Doublehit Collectibles is the personal Pokemon trading card brand and collection website of Braden Lee (`0x00C0DE`).

The goal of this project is to present a curated collection in a professional way, document why specific cards were acquired, and ultimately demonstrate that the collection is being built with strategy, discipline, and long-term value in mind.

Live site: [doublehitcollectibles.github.io](https://doublehitcollectibles.github.io/)

## Live Site Preview

### Homepage

![Doublehit Collectibles live homepage](assets/img/readme/live-home.png)

### About Page

![Doublehit Collectibles live about page](assets/img/readme/live-about.png)

## Vision

This website is intended to be more than a simple gallery of Pokemon cards.

It is being developed as a brand-forward collection showcase where visitors can see:

- what is currently in the collection
- how the collection is being positioned over time
- the reasoning behind acquisitions
- how disciplined purchases can create stronger long-term results

The broader idea is to build trust with potential customers, collectors, and collaborators by showing that the collection is not random inventory. Each purchase is intended to support a larger strategy.

## Collection Showcase Direction

The current direction for Doublehit Collectibles is to make the site a polished public-facing home for:

- featured cards and collection highlights
- Pokemon TCG updates, pickups, and release notes
- brand storytelling around why specific items matter
- future collection dashboards and performance views

Over time, the site can evolve from a content-driven showcase into a collection intelligence platform.

## Planned Market Tracking

One of the main product ideas under consideration is a value-tracking layer that compares:

- the price originally paid for a card
- the current market value of that card
- the unrealized gain or loss in dollars
- the percentage return over time

The intent is to present the collection the way modern portfolio tools present investment performance, similar to how Collectr displays returns and percentage movement.

If this direction is pursued, the site may eventually support:

- purchase-price records for cards in the collection
- current market pricing pulled from a permitted pricing source
- collection-level gain/loss summaries
- per-card return percentages
- time-based performance views to show how the collection has moved historically

For Collectr specifically, the idea would be to evaluate whether a stable and permitted API or export workflow exists before building around it. That integration should only be used if it is reliable and compatible with Collectr's terms and access model.

## Why This Matters

The long-term value of the site is not only in showing what is owned, but in communicating how the collection is being managed.

That means the website should help visitors understand:

- that cards were selected intentionally
- that purchases were made for a purpose
- that the collection is being monitored with a business and investment mindset
- that Doublehit Collectibles operates with a strategy rather than impulse buying

This positioning helps turn the collection into a stronger brand story and gives future customers more confidence in the quality of the collection.

## Repository Purpose

This repository powers the GitHub Pages site for Doublehit Collectibles.

It currently supports:

- brand pages and collection-focused content
- homepage visuals and featured post presentation
- blog-style posts for updates, releases, and highlights
- custom styling and branding for the Doublehit Collectibles identity

## Tech Stack

- Jekyll for site generation
- GitHub Pages for hosting and deployment
- Sass for styling
- JavaScript for interactive site behavior
- GitHub Actions for deployment automation

## Project Structure

- `_posts/` contains site posts and updates
- `_layouts/` and `_includes/` contain reusable page structure
- `_sass/` contains the site's styling
- `assets/` contains compiled assets and images used by the live site
- `src/` contains source configuration and build inputs
- `.github/workflows/pages.yml` contains the GitHub Pages deployment workflow

## Local Development

Install dependencies:

```bash
bundle install
npm install
```

Run the site build:

```bash
npm run build
```

Run local development tooling:

```bash
npm run dev
```

If you want to serve the Jekyll site directly:

```bash
bundle exec jekyll serve
```

## Deployment

The production site is deployed through GitHub Pages.

- pushes to `main` publish the live site
- feature and working changes can be prepared on development branches before being synced to `main`

## Brand Ownership

- Brand: `Doublehit Collectibles`
- Owner: `Braden Lee`
- Handle: `0x00C0DE`
- Focus: `Pokemon trading cards`

## License

See [LICENSE](LICENSE) for the licensing terms used in this repository.

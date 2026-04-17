# Pricing Service Architecture

Double Hit Collectibles includes a Cloudflare Workers backend under [workers/pricing-service](C:/Users/blee9/coding/braden_githubio/doublehitcollectibles.githubio.io/workers/pricing-service).

## Goals

- keep the public GitHub Pages site static and fast
- let the owner manage collection cards through the website
- store owned-card records in Cloudflare D1
- fetch Pokemon card data from the official Pokemon TCG API
- retain repeated price snapshots so collection history can be shown over time

## Runtime Shape

- `Cloudflare Worker`
  - public collection routes
  - authenticated admin routes
  - Pokemon card search and detail routes
- `Cloudflare D1`
  - owned collection cards
  - Pokemon price snapshots
  - existing pricing tables from the broader backend foundation
- `Cloudflare KV`
  - hot cache for pricing summaries
- `Cloudflare Queue`
  - existing background refresh jobs
- `Durable Object`
  - existing per-query lock support
- `Cloudflare Cron Trigger`
  - periodic refresh of tracked cards

## Collection Request Flow

1. The public site calls `GET /api/collection/cards`.
2. The worker reads stored collection entries from D1.
3. The worker hydrates each entry with Pokemon TCG API data and recent stored price history.
4. The site renders the collection grid, ownership metrics, and price history.

## Admin Request Flow

1. The owner signs in through `POST /api/auth/login`.
2. The worker validates the configured username and password.
3. The worker returns a signed bearer token.
4. The browser stores that token locally and sends it on admin requests.
5. The manage page uses:
   - `GET /api/admin/collection/cards`
   - `POST /api/admin/collection/cards`
   - `PUT /api/admin/collection/cards/:id`
   - `DELETE /api/admin/collection/cards/:id`

## Scheduled Refresh Flow

1. The hourly cron trigger runs in the worker.
2. The worker loads tracked Pokemon entries from both:
   - the static fallback file
   - the D1-backed collection table
3. The worker refreshes stale card snapshots.
4. The public site can then show updated pricing history without making a fresh upstream request for every page view.

## Auth Model

The current admin login is intentionally simple:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH`
- `SESSION_SECRET`

These are configured in the Cloudflare Worker environment rather than through a public sign-up flow. This keeps the site owner in control while avoiding account-management complexity for the first version.

Use the helper in [workers/pricing-service/scripts/generate-password-hash.mjs](C:/Users/blee9/coding/braden_githubio/doublehitcollectibles.githubio.io/workers/pricing-service/scripts/generate-password-hash.mjs) to generate the password hash value.

## Current Scope

The D1-backed website workflow currently focuses on Pokemon card entries sourced from the Pokemon TCG API.

The local JSON fallback still supports custom manual items such as sealed product, but those are not yet part of the authenticated D1 collection workflow.

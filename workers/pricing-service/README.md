# Double Hit Pricing Service

This Cloudflare Workers subproject is the backend collection and pricing service for Double Hit Collectibles.

It is designed to:

- authenticate the site owner for collection management
- search the official Pokemon TCG API
- store owned-card records in Cloudflare D1
- hydrate the public collection page with card detail and ownership metrics
- store repeated card snapshots so price history can be shown over time

## What It Includes

- `POST /api/auth/login`
- `GET /api/auth/session`
- `GET /api/collection/cards`
- `GET /api/admin/collection/cards`
- `POST /api/admin/collection/cards`
- `PUT /api/admin/collection/cards/:id`
- `DELETE /api/admin/collection/cards/:id`
- `GET /api/visitors`
- `POST /api/visitors/track`
- `POST /api/visitors/leave`
- `GET /api/pokemon/cards/search?q=mewtwo 281`
- `GET /api/pokemon/cards/:id`
- the existing queue, KV, and durable-object foundation for broader pricing workflows
- an hourly scheduled refresh for tracked Pokemon cards

## Authentication

The first version uses a single admin account configured through worker environment values:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH`
- `SESSION_SECRET`

Generate the password hash with:

```bash
npm run hash-password -- "your-password"
```

Set the output as `ADMIN_PASSWORD_HASH`.

## Local Setup

```bash
cd workers/pricing-service
npm install
copy .dev.vars.example .dev.vars
```

Apply local migrations:

```bash
npx wrangler d1 migrations apply doublehit-pricing --local
```

If the visitor widget schema changes are already deployed elsewhere, run the same command against production before using the live counter:

```bash
npx wrangler d1 migrations apply doublehit-pricing
```

Start local development:

```bash
npm run dev
```

## Deploy

1. Create the D1 database, KV namespace, queue, and durable object bindings in Cloudflare.
2. Replace the placeholder IDs in `wrangler.jsonc`.
3. Set the production secrets and vars:

```bash
npx wrangler secret put POKEMON_TCG_API_KEY
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put SESSION_SECRET
```

Set `ADMIN_USERNAME` as a worker environment variable.

4. Deploy:

```bash
npm run deploy
```

## Observability

Workers Logs are enabled in `wrangler.jsonc` with full head sampling for the current traffic level. After deploy, open the Worker in Cloudflare and use **Observability** for persisted invocation logs, custom JSON logs, request status, and timing.

The Worker emits structured events for:

- `worker.request`
- `visitor.stats`
- `visitor.track`
- `visitor.leave`
- `worker.queue.batch`
- `pricing.refresh.completed`
- `pricing.refresh.failed`
- `scheduled.watchlist_refresh.completed`
- `scheduled.collection_refresh.completed`

For live debugging from this directory:

```bash
npx wrangler tail
```

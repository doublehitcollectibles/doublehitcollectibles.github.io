# Pokemon Collection Page

The collection experience now has two connected pages:

- [pages/collection.md](C:/Users/blee9/coding/braden_githubio/doublehitcollectibles.githubio.io/pages/collection.md)
- [pages/manage-collection.md](C:/Users/blee9/coding/braden_githubio/doublehitcollectibles.githubio.io/pages/manage-collection.md)

The front-end pieces are powered by:

- [assets/js/collection.js](C:/Users/blee9/coding/braden_githubio/doublehitcollectibles.githubio.io/assets/js/collection.js)
- [assets/js/collection-admin.js](C:/Users/blee9/coding/braden_githubio/doublehitcollectibles.githubio.io/assets/js/collection-admin.js)
- [assets/data/owned-cards.json](C:/Users/blee9/coding/braden_githubio/doublehitcollectibles.githubio.io/assets/data/owned-cards.json)
- [workers/pricing-service](C:/Users/blee9/coding/braden_githubio/doublehitcollectibles.githubio.io/workers/pricing-service)

## Collection Sources

When `pokemon_api_base_url` is configured, the public collection page reads from the Cloudflare Worker and D1 database. This is the preferred setup because it lets you:

- sign in from the website
- add cards through the browser
- store ownership data in Cloudflare D1
- keep price history snapshots on the backend

When `pokemon_api_base_url` is blank, the page falls back to `assets/data/owned-cards.json`.

## Local Fallback File

The fallback inventory source is [assets/data/owned-cards.json](C:/Users/blee9/coding/braden_githubio/doublehitcollectibles.githubio.io/assets/data/owned-cards.json).

Example entry:

```json
{
  "collectionName": "Double Hit Collection",
  "currency": "USD",
  "cards": [
    {
      "cardId": "sv3pt5-151",
      "label": "Mew ex",
      "quantity": 1,
      "purchasePrice": 245.0,
      "purchaseDate": "2026-03-12",
      "priceType": "holofoil",
      "condition": "Near Mint",
      "notes": "Personal grail pickup"
    },
    {
      "source": "custom",
      "label": "Ascended Heroes Pokemon Center Elite Trainer Box",
      "category": "Sealed Product",
      "quantity": 2,
      "purchasePrice": 410.0,
      "currentPrice": 457.13,
      "currency": "USD",
      "image": "/assets/img/uploads/example-sealed-item.png",
      "priceSource": "Manual Entry"
    }
  ]
}
```

`source: "custom"` is only used in fallback mode. The Cloudflare-backed collection UI currently stores Pokemon card entries from the Pokemon TCG API.

## Worker Configuration

To enable the Cloudflare-backed collection workflow:

1. Deploy the worker in [workers/pricing-service](C:/Users/blee9/coding/braden_githubio/doublehitcollectibles.githubio.io/workers/pricing-service).
2. Set the `POKEMON_TCG_API_KEY` secret.
3. Set the admin auth configuration:
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD_HASH`
   - `SESSION_SECRET`
4. Generate the password hash with:
   - `npm run hash-password -- "your-password"` from [workers/pricing-service](C:/Users/blee9/coding/braden_githubio/doublehitcollectibles.githubio.io/workers/pricing-service)
5. Set `pokemon_api_base_url` in both:
   - [src/yml/site.yml](C:/Users/blee9/coding/braden_githubio/doublehitcollectibles.githubio.io/src/yml/site.yml)
   - [_config.yml](C:/Users/blee9/coding/braden_githubio/doublehitcollectibles.githubio.io/_config.yml)
6. Run the D1 migrations, including:
   - [workers/pricing-service/migrations/0002_pokemon_card_snapshots.sql](C:/Users/blee9/coding/braden_githubio/doublehitcollectibles.githubio.io/workers/pricing-service/migrations/0002_pokemon_card_snapshots.sql)
   - [workers/pricing-service/migrations/0003_collection_cards_auth.sql](C:/Users/blee9/coding/braden_githubio/doublehitcollectibles.githubio.io/workers/pricing-service/migrations/0003_collection_cards_auth.sql)

## Backend Routes

The worker exposes the routes the site now uses:

- `GET /api/collection/cards`
- `GET /api/pokemon/cards/search?q=...`
- `GET /api/pokemon/cards/:id`
- `POST /api/auth/login`
- `GET /api/auth/session`
- `GET /api/admin/collection/cards`
- `POST /api/admin/collection/cards`
- `PUT /api/admin/collection/cards/:id`
- `DELETE /api/admin/collection/cards/:id`

The worker stores price snapshots over time so the public collection page can show history built from repeated captures.

# Double Hit Collectibles

Double Hit Collectibles is the public website and collection platform for Braden Lee (`0x00C0DE`).

Live site: [doublehitcollectibles.github.io](https://doublehitcollectibles.github.io/)

The project combines a branded Jekyll front end with a Cloudflare-backed collection and pricing service. The result is a site that can act as both a content home base and a live collectible portfolio for cards, graded cards, sealed product, and mixed TCG inventory.

## What The Website Offers

The live site currently includes:

- a branded homepage for posts, updates, and featured content
- an About page styled to match the collection experience
- a public collection page at `/collection/`
- a secure admin workspace at `/manage-collection/`

## Public Collection Experience

The collection page is not just a static gallery. It is a live collection surface built around worker-backed data and PriceCharting-backed market information.

Key features include:

- tracked collection summary cards for item count, cost basis, estimated value, and unrealized return
- a tracked collection grid that supports duplicate ownership variants such as raw and PSA 10
- inline detail panels that open beside the exact selected card
- compact price-history charts inside the inline detail view
- raw/ungraded and PSA 10 market boxes
- explicit return comparisons against raw or PSA 10 cost basis
- shared collectible search for users and admins
- mixed collectible search results for:
  - Pokemon singles
  - variant cards such as metal and hyper rare results
  - sealed Pokemon product
  - other TCG collectibles such as Riftbound

The public page also supports progressive refresh behavior:

- stored collection data renders first for speed
- background refresh batches update tracked cards without overloading the Cloudflare worker
- users can still click a specific card to force a fresh update for that item

## Admin Workspace

The admin page is the browser-based collection management workspace for the live site.

It supports:

- worker-backed sign-in using configured admin credentials
- searching the same mixed collectible catalog used by the public collection explorer
- adding, editing, and deleting collection entries
- adding Pokemon cards, sealed product, and other TCG items
- saving quantity, purchase price, purchase date, condition, notes, and display label
- choosing whether a Pokemon card is tracked as `Raw` or `PSA 10`
- preserving correct cost-basis and return math for raw vs graded ownership
- storing custom mixed-collectible metadata such as game, category, series, variant, item number, image, and price source

## Pricing And Data Model

The current collection stack uses multiple data sources, but the tracked collection pricing itself is now centered on PriceCharting.

Current behavior:

- PriceCharting is used for tracked raw/ungraded and PSA 10 market pricing
- PriceCharting search powers mixed collectible discovery for sealed product and other TCG items
- Pokemon TCG API is still used for Pokemon card metadata and card-detail enrichment where relevant
- Cloudflare D1 stores owned collection entries and persisted price payloads
- stored payloads include history so repeat page loads do not need to refetch every detail immediately
- periodic refreshes keep tracked cards updated over time
- the public page can fall back to `assets/data/owned-cards.json` if the worker is unavailable

## Cloudflare Worker Features

The backend lives in [workers/pricing-service](workers/pricing-service) and powers the interactive parts of the site.

Capabilities include:

- public collection routes
- authenticated admin routes
- Pokemon card search and detail routes
- mixed collectible search routes
- PriceCharting item-detail hydration
- D1-backed collection storage
- queue and scheduled refresh workflows
- persistent pricing snapshots and payload storage

Representative routes:

- `GET /api/collection/cards`
- `GET /api/pokemon/cards/search?q=...`
- `GET /api/pokemon/cards/:id`
- `GET /api/collectibles/search?q=...`
- `GET /api/pricecharting/search?q=...`
- `GET /api/pricecharting/item?id=...`
- `POST /api/auth/login`
- `GET /api/auth/session`
- `GET /api/admin/collection/cards`
- `POST /api/admin/collection/cards`
- `PUT /api/admin/collection/cards/:id`
- `DELETE /api/admin/collection/cards/:id`

## Repository Structure

- `_posts/` contains homepage/editorial content
- `pages/` contains standalone site pages such as `about.md`, `collection.md`, and `manage-collection.md`
- `_layouts/` and `_includes/` contain the Jekyll layout system
- `_sass/` contains the site styling, including the collection/admin experience
- `assets/js/` contains the browser-side collection and admin logic
- `assets/data/owned-cards.json` contains the local fallback inventory source
- `docs/` contains internal collection and worker architecture notes
- `workers/pricing-service/` contains the Cloudflare worker, D1 migrations, scripts, and TypeScript source

## Local Development

Install the site dependencies:

```bash
bundle install
npm install
```

Build the site:

```bash
npm run build
```

Run the site in development mode:

```bash
npm run dev
```

Serve the site directly with Jekyll if needed:

```bash
bundle exec jekyll serve
```

## Worker Development

Install worker dependencies:

```bash
cd workers/pricing-service
npm install
```

Type-check the worker:

```bash
npm run check
```

Run the worker locally:

```bash
npm run dev
```

Generate an admin password hash:

```bash
npm run hash-password -- "your-password"
```

## Configuration Notes

To use the Cloudflare-backed collection workflow locally or in production:

- deploy the worker in `workers/pricing-service`
- configure the worker secrets and vars for admin auth and upstream access
- apply the D1 migrations in `workers/pricing-service/migrations/`
- set `pokemon_api_base_url` to the worker URL in:
  - `_config.yml`
  - `src/yml/site.yml`

If `pokemon_api_base_url` is blank or unreachable, the public collection page falls back to the local JSON inventory file.

## Related Docs

- [docs/pokemon-collection.md](docs/pokemon-collection.md)
- [docs/pricing-service.md](docs/pricing-service.md)
- [workers/pricing-service/README.md](workers/pricing-service/README.md)

## Tech Stack

- Jekyll
- Sass
- JavaScript
- GitHub Pages
- Cloudflare Workers
- Cloudflare D1
- Cloudflare KV
- Cloudflare Queues
- Cloudflare Durable Objects
- PriceCharting
- Pokemon TCG API

## License

See [LICENSE](LICENSE).

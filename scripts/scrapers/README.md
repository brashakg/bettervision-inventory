# Product scrapers

Pulls product data from brand/retailer sites and catalogs it in the IMS as
DRAFT products for review. Two-step flow, deliberately decoupled:

```
scrape (site → JSON)                    import (JSON → IMS database)
npx tsx scripts/scrapers/titan-eyeplus.ts   DATABASE_URL=... npx tsx scripts/import-scraped.ts scripts/scrapers/output/titan-eyeplus.json
```

## Titan Eye+ (`titan-eyeplus.ts`)

Titan Eye+ server-renders every product's full record in the page's
`__NEXT_DATA__` JSON, and its sitemap lists the whole catalogue (~6.5k
products across Titan, Fastrack, Ray-Ban, Vogue, Maui Jim, Tommy Hilfiger,
Oakley, Prada, Gucci, and more). No headless browser needed.

```bash
# Sample N products across brands (default 10):
npx tsx scripts/scrapers/titan-eyeplus.ts --count 25

# Scrape specific product pages:
npx tsx scripts/scrapers/titan-eyeplus.ts --urls https://www.titaneyeplus.com/product/<slug> ...

# Custom output path:
npx tsx scripts/scrapers/titan-eyeplus.ts --count 10 --out /tmp/batch.json
```

Throttled to ~1 request/second. In sandboxed environments where outbound
HTTPS goes through a proxy, prefix with
`NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=<proxy-ca-bundle>` so Node's
`fetch` honors it (curl-style tools pick it up automatically).

## Importer (`../import-scraped.ts`)

```bash
DATABASE_URL="postgresql://..." npx tsx scripts/import-scraped.ts scripts/scrapers/output/titan-eyeplus.json [--dry-run] [--update]
```

- Reuses `src/lib/autoGenerate` — titles, SKUs, SEO fields, tags, and
  discount rules come out identical to the dashboard's Add Product flow.
- Products are created as `DRAFT`, **never pushed to Shopify** — review in
  the dashboard, then publish through the normal flow.
- Dedupes on brand + modelNo (case-insensitive). Re-runs skip existing
  products; `--update` refreshes prices on them instead.
- Images reference the source CDN URLs (`originalUrl` kept for audit).
- Each import writes a `SyncLog` entry recording the source URL.

## Adding a new source

1. Create `scripts/scrapers/<source>.ts` that emits `ScrapedProduct[]`
   (see `types.ts`) — that's the only contract.
2. Map the source's category names onto IMS category enums
   (`src/lib/categories.ts`).
3. The importer needs no changes.

## Data-source notes

- Product **specs** are factual data; product **images/copy** are the
  brands'. Titan Eye+ images are used here as placeholders for review —
  for publishing at scale, prefer official distributor feeds (Luxottica /
  Safilo / Titan dealer portals) or confirm retailer image rights.
- Scrapers break silently when sites redesign; the Titan adapter fails
  loudly (non-zero exit + per-URL errors) if `__NEXT_DATA__` disappears.

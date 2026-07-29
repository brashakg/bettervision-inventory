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
DATABASE_URL="postgresql://..." npx tsx scripts/import-scraped.ts scripts/scrapers/output/titan-eyeplus.json [--dry-run] [--update] [--keep-source-images]
```

- Reuses `src/lib/autoGenerate` — titles, SKUs, SEO fields, tags, and
  discount rules come out identical to the dashboard's Add Product flow.
- Products are created as `DRAFT`, **never pushed to Shopify** — review in
  the dashboard, then publish through the normal flow.
- **MRP only**: the source site's sale price is never imported. Selling
  price comes from the IMS category × brand discount rules, same as a
  hand-catalogued product. (No matching rule → SRP = MRP.)
- **Source marketing stays out**: promo tags ("Buy One Get One Free"),
  sale prices, and marketing copy are kept in the JSON's `raw` block for
  audit but never written to product columns.
- **Images are re-processed before entering the IMS**: downloaded,
  stripped of all EXIF/ICC/XMP metadata, resized to the app's 2048×2048
  standard (never enlarged), re-encoded as JPEG q85, and uploaded to the
  Shopify CDN via the app's `uploadFileToShopify` (falls back to
  `public/uploads/` when Shopify credentials aren't set, e.g. local dev).
  The source URL is kept as `originalUrl` for audit. Use
  `--keep-source-images` to hotlink instead for quick preview runs.
- Dedupes on brand + modelNo (case-insensitive). Re-runs skip existing
  products; `--update` refreshes prices on them instead.
- Each import writes a `SyncLog` entry recording the source URL.

## Running against production (from your machine)

```bash
git checkout main && git pull        # after the PR is merged
npm install

# 1. Scrape (no credentials needed):
npx tsx scripts/scrapers/titan-eyeplus.ts --count 10

# 2. Preview what would be imported (needs the Railway DATABASE_URL):
DATABASE_URL="postgresql://...railway..." \
  npx tsx scripts/import-scraped.ts scripts/scrapers/output/titan-eyeplus.json --dry-run

# 3. Import for real. Add Shopify credentials so processed images land on
#    the Shopify CDN instead of the ephemeral local filesystem:
DATABASE_URL="postgresql://...railway..." \
SHOPIFY_STORE_URL="bokaro-better-vision.myshopify.com" \
SHOPIFY_ACCESS_TOKEN="shpat_..." \
  npx tsx scripts/import-scraped.ts scripts/scrapers/output/titan-eyeplus.json
```

Then review the DRAFT products in the dashboard and publish through the
normal flow. Re-running an import is safe — existing products are skipped.

## Adding a new source

1. Create `scripts/scrapers/<source>.ts` that emits `ScrapedProduct[]`
   (see `types.ts`) — that's the only contract.
2. Map the source's category names onto IMS category enums
   (`src/lib/categories.ts`).
3. The importer needs no changes.

## Data-source notes

- Product **specs** are factual data; product **images/copy** are the
  brands'. Source marketing copy and promo tags are never imported, and
  images are re-processed — but for publishing at scale, prefer official
  distributor feeds (Luxottica / Safilo / Titan dealer portals) or confirm
  retailer image rights.
- Scrapers break silently when sites redesign; the Titan adapter fails
  loudly (non-zero exit + per-URL errors) if `__NEXT_DATA__` disappears.

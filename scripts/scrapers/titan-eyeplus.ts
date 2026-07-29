/**
 * Titan Eye+ product scraper.
 *
 * Titan Eye+ (titaneyeplus.com) is a Next.js storefront over a Magento
 * backend. Every product page server-renders its full product record in the
 * __NEXT_DATA__ JSON blob, so no headless browser is needed — plain HTTPS
 * fetches are enough. Product URLs come from the public sitemap.
 *
 * Usage:
 *   npx tsx scripts/scrapers/titan-eyeplus.ts [--count 10] [--out scripts/scrapers/output/titan-eyeplus.json]
 *   npx tsx scripts/scrapers/titan-eyeplus.ts --urls <url1> <url2> ...
 *
 * Output: JSON array of ScrapedProduct (see scripts/scrapers/types.ts),
 * normalized to the IMS Product/ProductVariant field names, ready for
 * scripts/import-scraped.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { ScrapedProduct } from "./types";

const SITEMAP_URL = "https://www.titaneyeplus.com/sitemap_product.xml";
const USER_AGENT =
  "BetterVisionCatalogBot/1.0 (+https://www.bettervision.in; catalog research)";
const FETCH_DELAY_MS = 800; // be polite: ~1 request/second

// Titan Eye+ product_category → IMS category enum
const CATEGORY_MAP: Record<string, string> = {
  EYEGLASSES: "SPECTACLES",
  SUNGLASSES: "SUNGLASSES",
  "READING GLASSES": "READING_GLASSES",
  "COMPUTER GLASSES": "COMPUTER_GLASSES",
  "CONTACT LENSES": "CONTACT_LENSES",
  "COLOR CONTACT LENSES": "COLOR_CONTACT_LENSES",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return res.text();
}

/** Pull all product URLs out of the sitemap. */
async function fetchProductUrls(): Promise<string[]> {
  const xml = await fetchText(SITEMAP_URL);
  return [...xml.matchAll(/<loc>(https:\/\/www\.titaneyeplus\.com\/product\/[^<]+)<\/loc>/g)].map(
    (m) => m[1]
  );
}

/**
 * Pick a brand-diverse sample: round-robin across brand slugs, alternating
 * eyeglasses / sunglasses, so a pilot run shows the full mapping range
 * instead of 10 near-identical Titan frames.
 */
function pickSample(urls: string[], count: number): string[] {
  const byBrand = new Map<string, string[]>();
  for (const url of urls) {
    const m = url.match(/-from-([a-z0-9-]+?)-[a-z0-9]+$/);
    if (!m) continue;
    const kind = url.includes("-eyeglasses-")
      ? "eyeglasses"
      : url.includes("-sunglasses-")
        ? "sunglasses"
        : null;
    if (!kind) continue;
    const key = `${m[1]}|${kind}`;
    if (!byBrand.has(key)) byBrand.set(key, []);
    byBrand.get(key)!.push(url);
  }
  // Preference order: house brands first (always in stock), then the
  // licensed brands the store also carries.
  const preferred = [
    "titan|eyeglasses",
    "rayban|sunglasses",
    "fastrack|eyeglasses",
    "vogue-eyewear|sunglasses",
    "titan|sunglasses",
    "tommy-hilfiger|eyeglasses",
    "maui-jim|sunglasses",
    "fastrack|sunglasses",
    "oakley|sunglasses",
    "prada|sunglasses",
    "gucci|sunglasses",
    "stepper|eyeglasses",
  ];
  const picked: string[] = [];
  for (const key of preferred) {
    if (picked.length >= count) break;
    const list = byBrand.get(key);
    if (list?.length) picked.push(list[0]);
  }
  // Top up from whatever is left if the preferred list didn't fill the quota.
  for (const list of byBrand.values()) {
    if (picked.length >= count) break;
    for (const url of list) {
      if (picked.length >= count) break;
      if (!picked.includes(url)) picked.push(url);
    }
  }
  return picked.slice(0, count);
}

/** Extract the server-rendered product record from a PDP's __NEXT_DATA__. */
function parseNextData(html: string): any {
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s
  );
  if (!m) throw new Error("__NEXT_DATA__ not found (page layout changed?)");
  return JSON.parse(m[1]);
}

const clean = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s && s !== "NA" && s !== "0" && s !== "null" ? s : undefined;
};

function normalize(url: string, nextData: any): ScrapedProduct {
  const p = nextData?.props?.pageProps?.productDetails?.products;
  if (!p?.product_sku) throw new Error("productDetails.products missing");

  // product_data is a JSON string with the raw Magento attribute row —
  // some fields (temple_material, weight, gender_filter) only live there.
  let pd: Record<string, any> = {};
  try {
    pd = JSON.parse(p.product_data || "{}");
  } catch {
    /* non-fatal — the outer record covers the essentials */
  }

  const rawCategory = String(p.product_category || p.category_name || "").toUpperCase();
  const category = CATEGORY_MAP[rawCategory] || rawCategory.replace(/\s+/g, "_");

  const mediaBase = (p.media_url || "https://api.titaneyeplus.com/media/").replace(/\/$/, "");
  const gallery: string[] = Array.isArray(p.image_gallery_list) ? p.image_gallery_list : [];
  const images = gallery.map((rel: string) => `${mediaBase}${rel.startsWith("/") ? "" : "/"}${rel}`);

  const mrp = Number(p.mrp_price || p.price || 0);

  // Titan sells one colorway per PDP (other colors are separate SKUs), so
  // each scrape yields one product with a single variant. The colour name
  // doubles as the IMS colorCode — Titan has no separate numeric code.
  const colorName = clean(p.color) || clean(pd.color) || "Default";

  return {
    source: "titaneyeplus.com",
    sourceUrl: url,
    category,
    brand: clean(p.brand) || clean(pd.brand) || "Titan",
    productName: clean(p.name),
    modelNo: String(p.product_sku),
    fullModelNo: String(p.product_sku),
    shape: clean(p.frame_shape),
    frameMaterial: clean(p.frame_material),
    templeMaterial: clean(pd.temple_material),
    frameType: clean(p.frame_type),
    gender: clean(p.gender) || clean(pd.gender_filter),
    countryOfOrigin: clean(p.country_of_manufacture),
    warranty: clean(p.warranty) || clean(pd.product_warranty),
    lensMaterial: clean(p.lens_material),
    uvProtection: clean(pd.uv_protection) || clean(pd.lens_feature),
    polarization: clean(pd.polarized) || clean(pd.polarised),
    mrp,
    images,
    variant: {
      colorCode: colorName,
      colorName,
      frameColor: clean(p.front_color) || clean(pd.frame_color),
      templeColor: clean(p.temple_color) || clean(pd.temple_colour),
      // lens_width_number is the true mm value; pd.lens_width / pd.frame_size
      // are Magento option IDs (e.g. "210"), so never fall back to those.
      frameSize: clean(pd.lens_width_number) || clean(p.frame_size),
      bridge: clean(p.bridge_width),
      templeLength: clean(p.temple_length) || clean(pd.temple_length_number),
      weight: clean(pd.weight),
      lensColour: clean(p.lens_colour),
      mrp,
      barcode: clean(p.ean_code),
    },
    // Audit-only extras — the importer never writes these to columns.
    // Titan's sale price, promo tags ("Buy One Get One Free"), and
    // marketing copy stay out of the IMS per catalogue policy.
    raw: {
      sourceFinalPrice: Number(p.final_price || 0) || undefined,
      sourceOfferTags: Array.isArray(p.short_offer_tag) ? p.short_offer_tag : undefined,
      stockQty: Number(p.sellable_quantity ?? p.qty ?? 0),
      titanCategory: p.product_category,
      scrapedAt: new Date().toISOString(),
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const getFlag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const count = Number(getFlag("--count") || 10);
  const out =
    getFlag("--out") || path.join("scripts", "scrapers", "output", "titan-eyeplus.json");

  let urls: string[];
  if (args.includes("--urls")) {
    urls = args.slice(args.indexOf("--urls") + 1).filter((a) => a.startsWith("http"));
  } else {
    console.log(`Fetching sitemap: ${SITEMAP_URL}`);
    const all = await fetchProductUrls();
    console.log(`Sitemap lists ${all.length} products; sampling ${count} across brands.`);
    urls = pickSample(all, count);
  }

  const products: ScrapedProduct[] = [];
  const failures: Array<{ url: string; error: string }> = [];
  for (const url of urls) {
    try {
      const html = await fetchText(url);
      const product = normalize(url, parseNextData(html));
      products.push(product);
      console.log(
        `✓ ${product.brand} ${product.modelNo} [${product.category}] ₹${product.mrp} — ${product.variant.colorName}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ url, error: message });
      console.error(`✗ ${url}: ${message}`);
    }
    await sleep(FETCH_DELAY_MS);
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(products, null, 2));
  console.log(`\nWrote ${products.length} products to ${out}`);
  if (failures.length) {
    console.error(`${failures.length} failed:`);
    for (const f of failures) console.error(`  ${f.url} — ${f.error}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Normalized output shape shared by all brand scrapers.
 *
 * Field names deliberately mirror the IMS Prisma models (Product /
 * ProductVariant / ProductImage) so scripts/import-scraped.ts can map a
 * scraped record onto the database with no per-source logic. Every scraper
 * adapter (Titan Eye+ today; Carrera, distributor Excel feeds, etc. later)
 * must emit this shape.
 */

export interface ScrapedVariant {
  /** IMS requires a colorCode per variant; sources without numeric codes use the colour name. */
  colorCode: string;
  colorName?: string;
  frameColor?: string;
  templeColor?: string;
  frameSize?: string;
  bridge?: string;
  templeLength?: string;
  weight?: string;
  lensColour?: string;
  tint?: string;
  /** Only MRP is carried over — selling price comes from the IMS discount
   *  rules at import time, never from the source site's sale price. */
  mrp: number;
  /** GTIN/EAN — maps to ProductVariant.barcode (synced to Shopify). */
  barcode?: string;
}

export interface ScrapedProduct {
  /** Source site hostname, e.g. "titaneyeplus.com". Stored in the import log. */
  source: string;
  sourceUrl: string;
  /** IMS category enum key (SPECTACLES, SUNGLASSES, ...). */
  category: string;
  brand: string;
  productName?: string;
  modelNo: string;
  fullModelNo?: string;
  shape?: string;
  frameMaterial?: string;
  templeMaterial?: string;
  frameType?: string;
  gender?: string;
  countryOfOrigin?: string;
  warranty?: string;
  lensMaterial?: string;
  uvProtection?: string;
  polarization?: string;
  /** Only MRP is carried over — see ScrapedVariant.mrp. */
  mrp: number;
  /** Absolute source image URLs, in display order. The importer downloads,
   *  strips metadata, resizes to the app's 2048px standard, and re-hosts
   *  them — these URLs never enter the database as-is. */
  images: string[];
  variant: ScrapedVariant;
  /** Source-specific extras (sale price, promo tags, marketing copy, stock)
   *  kept for debugging/audit only; never imported into columns. */
  raw?: Record<string, unknown>;
}

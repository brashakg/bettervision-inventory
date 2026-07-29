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
  mrp: number;
  discountedPrice?: number;
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
  productUSP?: string;
  description?: string;
  mrp: number;
  discountedPrice?: number;
  /** Absolute image URLs, in display order. */
  images: string[];
  variant: ScrapedVariant;
  /** Source-specific extras kept for debugging/audit; not imported into columns. */
  raw?: Record<string, unknown>;
}

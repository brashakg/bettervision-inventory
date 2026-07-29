/**
 * Image processing for scraped products.
 *
 * Source CDN images arrive with EXIF/XMP metadata and arbitrary dimensions.
 * Before an image enters the IMS (and later Shopify), it is:
 *   1. downloaded from the source CDN,
 *   2. stripped of all metadata (sharp drops EXIF/ICC/XMP unless asked to
 *      keep it; .rotate() bakes in EXIF orientation first so stripping it
 *      can't flip the image),
 *   3. resized to fit the app's standard 2048×2048 box (never enlarged) —
 *      the same limit the dashboard's upload path enforces,
 *   4. re-encoded as JPEG q85 (also matches the dashboard upload path),
 *   5. uploaded to the Shopify CDN via the app's existing
 *      uploadFileToShopify helper. When Shopify credentials are absent
 *      (local dev), it falls back to public/uploads/ exactly like
 *      /api/images does.
 */
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { uploadFileToShopify } from "../../src/lib/shopify";

const MAX_DIM = 2048; // same as imageUpload.ts COMPRESS_MAX_DIM
const JPEG_QUALITY = 85; // same as the dashboard's client-side compressor
const UPLOAD_DIR = join(process.cwd(), "public", "uploads");

const hasShopifyCreds = () =>
  Boolean(
    process.env.SHOPIFY_STORE_URL &&
      (process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN)
  );

export interface ProcessedImage {
  url: string;
  storage: "shopify_cdn" | "local";
  width: number;
  height: number;
  bytes: number;
}

/**
 * Download → strip metadata → resize → re-encode → store.
 * `baseName` should be unique per product image (e.g. "sg-rayb-rb3026-1").
 */
export async function processAndStoreImage(
  sourceUrl: string,
  baseName: string
): Promise<ProcessedImage> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status} for ${sourceUrl}`);
  const input = Buffer.from(await res.arrayBuffer());

  const output = await sharp(input)
    .rotate() // bake EXIF orientation before metadata is stripped
    .resize(MAX_DIM, MAX_DIM, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  const meta = await sharp(output).metadata();

  const fileName = `${baseName}-${randomBytes(4).toString("hex")}.jpg`;

  if (hasShopifyCreds()) {
    const uploaded = await uploadFileToShopify(output, fileName, "image/jpeg");
    if (uploaded.success && uploaded.url) {
      return {
        url: uploaded.url,
        storage: "shopify_cdn",
        width: meta.width || 0,
        height: meta.height || 0,
        bytes: output.length,
      };
    }
    // Fall through to local storage rather than losing the image.
    console.warn(`  ! Shopify CDN upload failed (${uploaded.error}); saving locally`);
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(join(UPLOAD_DIR, fileName), output);
  return {
    url: `/uploads/${fileName}`,
    storage: "local",
    width: meta.width || 0,
    height: meta.height || 0,
    bytes: output.length,
  };
}

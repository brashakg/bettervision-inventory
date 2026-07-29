/**
 * Import scraper output into the IMS database.
 *
 * Reads the normalized JSON produced by scripts/scrapers/*.ts and creates
 * Product + ProductVariant + ProductImage rows via Prisma, reusing the same
 * auto-generation pipeline (title, SKU, SEO, tags, discount rules) as the
 * dashboard's Add Product flow, so imported products are indistinguishable
 * from hand-catalogued ones.
 *
 * Safety rails:
 *   - Products land as DRAFT and are NOT pushed to Shopify — review them in
 *     the dashboard first, then publish through the normal flow.
 *   - imageDesignStatus stays null (same as Shopify-pulled products): these
 *     are finished catalog images, so they skip the designer queue.
 *   - Dedupe on brand + modelNo (case-insensitive): re-running an import
 *     skips products that already exist instead of duplicating them.
 *     Pass --update to refresh prices/stock fields on existing rows instead.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/import-scraped.ts scripts/scrapers/output/titan-eyeplus.json [--update] [--dry-run]
 */
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  generateTitle,
  generateSKU,
  generateSEOTitle,
  generateSEODescription,
  generatePageUrl,
  generateTags,
  generateHTMLDescription,
  calculateDiscountedPrice,
} from "../src/lib/autoGenerate";
import { ScrapedProduct } from "./scrapers/types";

const prisma = new PrismaClient();

async function importProduct(
  item: ScrapedProduct,
  discountRules: Awaited<ReturnType<typeof prisma.discountRule.findMany>>,
  opts: { update: boolean; dryRun: boolean }
): Promise<"created" | "updated" | "skipped"> {
  const existing = await prisma.product.findFirst({
    where: {
      brand: { equals: item.brand, mode: "insensitive" },
      modelNo: { equals: item.modelNo, mode: "insensitive" },
    },
    select: { id: true, title: true },
  });

  if (existing && !opts.update) {
    console.log(`  ↷ skip (exists): ${item.brand} ${item.modelNo} → ${existing.id}`);
    return "skipped";
  }

  if (existing && opts.update) {
    if (!opts.dryRun) {
      await prisma.product.update({
        where: { id: existing.id },
        data: { mrp: item.mrp, discountedPrice: item.discountedPrice || item.mrp },
      });
      await prisma.productVariant.updateMany({
        where: { productId: existing.id, colorCode: item.variant.colorCode },
        data: {
          mrp: item.variant.mrp,
          discountedPrice: item.variant.discountedPrice || item.variant.mrp,
          compareAtPrice: item.variant.mrp,
        },
      });
    }
    console.log(`  ↻ updated prices: ${item.brand} ${item.modelNo}`);
    return "updated";
  }

  // Same generation inputs as POST /api/products
  const genInput = { ...item } as Record<string, unknown>;
  const title = generateTitle(genInput);
  const productSku = generateSKU(genInput);
  // Scraped final_price is an explicit SRP from the source; fall back to the
  // category × brand discount rule only when the source gave no discount.
  const discountedPrice =
    item.discountedPrice && item.discountedPrice > 0
      ? item.discountedPrice
      : calculateDiscountedPrice(item.mrp, item.category, discountRules, item.brand);

  const variantSku = generateSKU({
    category: item.category,
    brand: item.brand,
    modelNo: item.modelNo,
    frameSize: item.variant.frameSize || "",
    colorCode: item.variant.colorCode,
  });

  console.log(`  + create: ${title}  [${productSku}]  ₹${item.mrp} → ₹${discountedPrice}`);
  if (opts.dryRun) return "created";

  const product = await prisma.product.create({
    data: {
      title,
      sku: productSku,
      status: "DRAFT",
      imageDesignStatus: null,
      category: item.category,
      brand: item.brand,
      productName: item.productName,
      modelNo: item.modelNo,
      fullModelNo: item.fullModelNo,
      shape: item.shape,
      frameMaterial: item.frameMaterial,
      templeMaterial: item.templeMaterial,
      frameType: item.frameType,
      gender: item.gender,
      countryOfOrigin: item.countryOfOrigin,
      warranty: item.warranty,
      lensMaterial: item.lensMaterial,
      uvProtection: item.uvProtection,
      polarization: item.polarization,
      productUSP: item.productUSP,
      mrp: item.mrp,
      discountedPrice,
      compareAtPrice: item.mrp,
      seoTitle: generateSEOTitle(genInput),
      seoDescription: generateSEODescription(genInput),
      pageUrl: generatePageUrl(genInput),
      tags: generateTags(genInput),
      htmlDescription: generateHTMLDescription(genInput),
      images: {
        create: item.images.map((url, i) => ({
          url,
          originalUrl: url,
          position: i,
          role: "EDITED",
        })),
      },
    },
  });

  const v = item.variant;
  await prisma.productVariant.create({
    data: {
      productId: product.id,
      colorCode: v.colorCode,
      colorName: v.colorName || null,
      frameColor: v.frameColor || null,
      templeColor: v.templeColor || null,
      frameSize: v.frameSize || null,
      bridge: v.bridge || null,
      templeLength: v.templeLength || null,
      weight: v.weight || null,
      lensColour: v.lensColour || null,
      tint: v.tint || null,
      mrp: v.mrp,
      discountedPrice: v.discountedPrice && v.discountedPrice > 0 ? v.discountedPrice : discountedPrice,
      compareAtPrice: v.mrp,
      sku: variantSku,
      barcode: v.barcode || null,
      title: `${v.colorCode}${v.frameSize ? " / " + v.frameSize : ""}`,
    },
  });

  await prisma.syncLog.create({
    data: {
      productId: product.id,
      action: "CREATE",
      status: "PENDING",
      message: `Imported from ${item.source} (${item.sourceUrl}) — awaiting review, not pushed to Shopify`,
    },
  });

  return "created";
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error(
      "Usage: npx tsx scripts/import-scraped.ts <scraped.json> [--update] [--dry-run]"
    );
    process.exit(1);
  }
  const opts = {
    update: args.includes("--update"),
    dryRun: args.includes("--dry-run"),
  };

  const items: ScrapedProduct[] = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(
    `Importing ${items.length} products from ${file}${opts.dryRun ? " (dry run)" : ""}`
  );

  const discountRules = await prisma.discountRule.findMany();
  const stats = { created: 0, updated: 0, skipped: 0, failed: 0 };

  for (const item of items) {
    try {
      if (!item.brand || !item.modelNo || !item.category) {
        throw new Error("missing required field (brand/modelNo/category)");
      }
      const result = await importProduct(item, discountRules, opts);
      stats[result]++;
    } catch (err) {
      stats.failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${item.brand ?? "?"} ${item.modelNo ?? "?"}: ${message}`);
    }
  }

  console.log(
    `\nDone: ${stats.created} created, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.failed} failed.`
  );
  if (stats.failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

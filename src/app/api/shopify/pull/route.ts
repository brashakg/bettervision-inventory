import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/apiAuth";
import { logActivity } from "@/lib/activityLog";
import {
  fetchAllProducts,
  fetchProductByShopifyId,
  type ShopifyProductNode,
} from "@/lib/shopify";

// Helper: extract metafield value
function getMetafield(
  product: ShopifyProductNode,
  namespace: string,
  key: string
): string | null {
  const mf = product.metafields.edges.find(
    (e) => e.node.namespace === namespace && e.node.key === key
  );
  return mf?.node.value || null;
}

// Helper: map Shopify status to our status
function mapStatus(shopifyStatus: string): string {
  switch (shopifyStatus) {
    case "ACTIVE":
      return "PUBLISHED";
    case "DRAFT":
      return "DRAFT";
    case "ARCHIVED":
      return "ARCHIVED";
    default:
      return "DRAFT";
  }
}

// Helper: guess category from product type, tags, etc.
function guessCategory(product: ShopifyProductNode): string {
  const type = (product.productType || "").toLowerCase();
  const tags = product.tags.map((t) => t.toLowerCase());
  const title = product.title.toLowerCase();

  if (
    type.includes("sunglass") ||
    tags.some((t) => t.includes("sunglass")) ||
    title.includes("sunglass")
  ) {
    return "SUNGLASSES";
  }
  if (
    type.includes("solution") ||
    type.includes("lens care") ||
    tags.some((t) => t.includes("solution"))
  ) {
    return "SOLUTIONS";
  }
  return "SPECTACLES";
}

// Helper: convert hyphenated/lowercase text to title case
// Handles compound words like "fullframe" -> "Full Frame", "orochiaro" -> "Orochiaro"
function toTitleCase(text: string): string {
  if (!text) return "";

  // Special compound word mappings
  const compoundWords: { [key: string]: string } = {
    fullframe: "Full Frame",
    halfrim: "Half Rim",
    rimless: "Rimless",
    "1year": "1 Year",
    "2year": "2 Year",
    "3year": "3 Year",
    "5year": "5 Year",
  };

  // Check for exact matches first
  if (compoundWords[text.toLowerCase()]) {
    return compoundWords[text.toLowerCase()];
  }

  // For normal words, capitalize first letter of each word
  return text
    .split(/[\s_-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// Helper: parse Shopify tags into structured fields
// Tags format: "brand_burberry", "shape_square", "framecolor_orochiaro", etc.
function parseTagsToFields(tags: string[]): {
  brand?: string;
  shape?: string;
  frameColor?: string;
  templeColor?: string;
  frameMaterial?: string;
  templeMaterial?: string;
  frameType?: string;
  frameSize?: string;
  bridge?: string;
  templeLength?: string;
  warranty?: string;
  weight?: string;
  gender?: string;
} {
  const parsed: any = {};

  for (const tag of tags) {
    const [prefix, ...valueParts] = tag.split("_");
    if (!prefix || valueParts.length === 0) continue;

    const value = valueParts.join("_"); // Handle cases where value contains underscore
    const lowerPrefix = prefix.toLowerCase();

    // Parse known tag prefixes
    if (lowerPrefix === "shape") {
      parsed.shape = toTitleCase(value);
    } else if (lowerPrefix === "framecolor") {
      parsed.frameColor = toTitleCase(value);
    } else if (lowerPrefix === "templecolor") {
      parsed.templeColor = toTitleCase(value);
    } else if (lowerPrefix === "framematerial") {
      parsed.frameMaterial = toTitleCase(value);
    } else if (lowerPrefix === "templematerial") {
      parsed.templeMaterial = toTitleCase(value);
    } else if (lowerPrefix === "frametype") {
      parsed.frameType = toTitleCase(value);
    } else if (lowerPrefix === "framesize") {
      parsed.frameSize = value; // Keep as-is (numeric)
    } else if (lowerPrefix === "bridge") {
      parsed.bridge = value; // Keep as-is (numeric)
    } else if (lowerPrefix === "templelength") {
      parsed.templeLength = value; // Keep as-is (numeric)
    } else if (lowerPrefix === "warranty") {
      parsed.warranty = toTitleCase(value);
    } else if (lowerPrefix === "weight") {
      parsed.weight = value; // Keep as-is (with unit like "27g")
    } else if (lowerPrefix === "gender") {
      parsed.gender = toTitleCase(value);
    } else if (lowerPrefix === "brand") {
      parsed.brand = toTitleCase(value);
    }
    // Ignore: other_xxx
  }

  return parsed;
}

// Helper: upsert a single Shopify product into local DB
async function upsertProduct(sp: ShopifyProductNode) {
  const existing = await prisma.product.findFirst({
    where: { shopifyProductId: sp.id },
    include: { variants: true, images: true },
  });

  const category = guessCategory(sp);
  const modelNo = getMetafield(sp, "custom", "model_no") || "";

  // Extract first variant price as base MRP
  const firstVariant = sp.variants.edges[0]?.node;
  const baseMrp = firstVariant
    ? parseFloat(firstVariant.compareAtPrice || firstVariant.price || "0")
    : 0;
  const basePrice = firstVariant ? parseFloat(firstVariant.price || "0") : 0;

  // Parse tags to extract structured fields
  const parsedTags = parseTagsToFields(sp.tags);

  // Brand priority: tag (brand_boss) > metafield > vendor (skip store name "Better Vision")
  const vendorName = sp.vendor || "";
  const isStoreName = vendorName.toLowerCase().includes("better vision") || vendorName.toLowerCase().includes("bettervision");
  const brand =
    parsedTags.brand ||
    getMetafield(sp, "custom", "brand") ||
    (isStoreName ? "" : vendorName) ||
    "Unknown";

  // Try to extract model number from title if metafield is empty
  // Titles are often "BOSS 1234" or "PRADA PR 54XV" — strip the brand prefix
  let effectiveModelNo = modelNo;
  if (!effectiveModelNo && sp.title && brand && brand !== "Unknown") {
    const titleUpper = sp.title.toUpperCase();
    const brandUpper = brand.toUpperCase();
    if (titleUpper.startsWith(brandUpper)) {
      effectiveModelNo = sp.title.slice(brand.length).trim();
    } else {
      // Title might not start with brand, use the full title as model reference
      effectiveModelNo = sp.title;
    }
  }

  // Build productData, only adding parsed tag values if the field is null/empty
  const productData: any = {
    shopifyProductId: sp.id,
    title: sp.title,
    category,
    status: mapStatus(sp.status),
    brand,
    modelNo: effectiveModelNo || null,
    fullModelNo: sp.title || null,
    productName: sp.title || null,
    htmlDescription: sp.descriptionHtml || null,
    seoTitle: sp.seo?.title || null,
    seoDescription: sp.seo?.description || null,
    tags: sp.tags.join(", "),
    pageUrl: sp.handle || null,
    mrp: baseMrp,
    discountedPrice: basePrice,
    compareAtPrice: baseMrp,
    gender: getMetafield(sp, "custom", "gender") || null,
    frameMaterial: getMetafield(sp, "custom", "frame_material") || null,
    shape: getMetafield(sp, "custom", "shape") || null,
    countryOfOrigin: getMetafield(sp, "custom", "country_of_origin") || null,
    warranty: getMetafield(sp, "custom", "warranty") || null,
  };

  // Add parsed tag values only if field is currently null/empty
  if (!productData.shape && parsedTags.shape) {
    productData.shape = parsedTags.shape;
  }
  if (!productData.frameMaterial && parsedTags.frameMaterial) {
    productData.frameMaterial = parsedTags.frameMaterial;
  }
  if (!productData.gender && parsedTags.gender) {
    productData.gender = parsedTags.gender;
  }
  if (!productData.warranty && parsedTags.warranty) {
    productData.warranty = parsedTags.warranty;
  }

  // Add additional parsed fields (these don't have metafield equivalents)
  if (parsedTags.frameColor) {
    productData.frameColor = parsedTags.frameColor;
  }
  if (parsedTags.templeColor) {
    productData.templeColor = parsedTags.templeColor;
  }
  if (parsedTags.templeMaterial) {
    productData.templeMaterial = parsedTags.templeMaterial;
  }
  if (parsedTags.frameType) {
    productData.frameType = parsedTags.frameType;
  }
  if (parsedTags.frameSize) {
    productData.frameSize = parsedTags.frameSize;
  }
  if (parsedTags.bridge) {
    productData.bridge = parsedTags.bridge;
  }
  if (parsedTags.templeLength) {
    productData.templeLength = parsedTags.templeLength;
  }
  if (parsedTags.weight) {
    productData.weight = parsedTags.weight;
  }

  let productId: string;

  if (existing) {
    // Update existing product
    await prisma.product.update({
      where: { id: existing.id },
      data: productData,
    });
    productId = existing.id;
  } else {
    // Create new product
    const created = await prisma.product.create({
      data: {
        ...productData,
        sku: firstVariant?.sku || `SHOP-${sp.handle || sp.id.split("/").pop()}`,
      },
    });
    productId = created.id;
  }

  // ── Sync images ──
  // Get existing image URLs to avoid duplicates
  const existingImages = existing?.images || [];
  const existingImageUrls = new Set(existingImages.map((i) => i.url));

  for (let idx = 0; idx < sp.images.edges.length; idx++) {
    const img = sp.images.edges[idx].node;
    if (!existingImageUrls.has(img.url)) {
      await prisma.productImage.create({
        data: {
          productId,
          url: img.url,
          originalUrl: img.url,
          position: idx,
          shopifyMediaId: img.id,
          isProcessed: true,
        },
      });
    }
  }

  // ── Sync variants ──
  const existingVariants = existing?.variants || [];
  const existingVariantShopifyIds = new Set(
    existingVariants.map((v) => v.shopifyVariantId).filter(Boolean)
  );

  for (const ve of sp.variants.edges) {
    const sv = ve.node;
    if (existingVariantShopifyIds.has(sv.id)) {
      // Update existing variant
      const localVariant = existingVariants.find(
        (v) => v.shopifyVariantId === sv.id
      );
      if (localVariant) {
        await prisma.productVariant.update({
          where: { id: localVariant.id },
          data: {
            mrp: parseFloat(sv.compareAtPrice || sv.price || "0"),
            discountedPrice: parseFloat(sv.price || "0"),
            compareAtPrice: parseFloat(sv.compareAtPrice || sv.price || "0"),
            barcode: sv.barcode || null,
            title: sv.title,
          },
        });
      }
    } else {
      // Extract color and size from selectedOptions
      const colorOpt = sv.selectedOptions.find(
        (o) => o.name.toLowerCase() === "color" || o.name.toLowerCase() === "colour"
      );
      const sizeOpt = sv.selectedOptions.find(
        (o) => o.name.toLowerCase() === "size"
      );

      const colorCode = colorOpt?.value || sv.title.split(" / ")[0] || "DEFAULT";
      const frameSize = sizeOpt?.value || sv.title.split(" / ")[1] || null;

      // Check if this variant already exists by colorCode + frameSize
      const existingByCode = existingVariants.find(
        (v) => v.colorCode === colorCode && v.frameSize === frameSize
      );

      if (existingByCode) {
        await prisma.productVariant.update({
          where: { id: existingByCode.id },
          data: {
            shopifyVariantId: sv.id,
            mrp: parseFloat(sv.compareAtPrice || sv.price || "0"),
            discountedPrice: parseFloat(sv.price || "0"),
            compareAtPrice: parseFloat(sv.compareAtPrice || sv.price || "0"),
            barcode: sv.barcode || null,
            title: sv.title,
            sku: sv.sku || null,
          },
        });
      } else {
        try {
          await prisma.productVariant.create({
            data: {
              productId,
              shopifyVariantId: sv.id,
              colorCode,
              frameSize,
              mrp: parseFloat(sv.compareAtPrice || sv.price || "0"),
              discountedPrice: parseFloat(sv.price || "0"),
              compareAtPrice: parseFloat(sv.compareAtPrice || sv.price || "0"),
              sku: sv.sku || null,
              barcode: sv.barcode || null,
              title: sv.title,
            },
          });
        } catch (e) {
          // Duplicate key — skip silently
          console.warn(`Skipped duplicate variant: ${sv.id}`, e);
        }
      }
    }
  }

  return productId;
}

// POST /api/shopify/pull — Pull ALL products from Shopify into local DB
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(["ADMIN"]);
    if (!auth.authorized) return auth.response!;

    const body = await request.json().catch(() => ({}));
    const singleProductId = body.shopifyProductId; // Optional: pull a single product

    let pulledCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    if (singleProductId) {
      // Pull a single product by Shopify GID
      const result = await fetchProductByShopifyId(singleProductId);
      if (!result.success || !result.product) {
        return NextResponse.json(
          { success: false, error: result.error || "Product not found" },
          { status: 404 }
        );
      }

      try {
        const existing = await prisma.product.findFirst({
          where: { shopifyProductId: singleProductId },
        });
        await upsertProduct(result.product);
        if (existing) updatedCount++;
        else pulledCount++;
      } catch (e) {
        errorCount++;
        errors.push(
          `${result.product.title}: ${e instanceof Error ? e.message : "Unknown error"}`
        );
      }
    } else {
      // Pull ALL products
      const result = await fetchAllProducts();
      if (!result.success || !result.products) {
        return NextResponse.json(
          { success: false, error: result.error || "Failed to fetch from Shopify" },
          { status: 502 }
        );
      }

      for (const sp of result.products) {
        try {
          const existing = await prisma.product.findFirst({
            where: { shopifyProductId: sp.id },
          });
          await upsertProduct(sp);
          if (existing) updatedCount++;
          else pulledCount++;
        } catch (e) {
          errorCount++;
          errors.push(
            `${sp.title}: ${e instanceof Error ? e.message : "Unknown error"}`
          );
        }
      }
    }

    // Log activity
    logActivity({
      userId: (auth.session?.user as any)?.id,
      userName: auth.session?.user?.name,
      userEmail: auth.session?.user?.email,
      action: "PULL",
      entity: "SHOPIFY",
      details: `Shopify pull: ${pulledCount} new, ${updatedCount} updated, ${errorCount} errors`,
    });

    return NextResponse.json({
      success: true,
      message: `Pull complete: ${pulledCount} new, ${updatedCount} updated, ${errorCount} errors`,
      summary: {
        newProducts: pulledCount,
        updatedProducts: updatedCount,
        errors: errorCount,
        errorDetails: errors.slice(0, 20), // Limit error details
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Shopify pull error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// GET /api/shopify/pull — Get pull status / preview what would be pulled
export async function GET() {
  try {
    const auth = await requireAuth(["ADMIN"]);
    if (!auth.authorized) return auth.response!;

    // Count local products with and without shopify IDs
    const [totalLocal, syncedProducts, unsyncedProducts] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { shopifyProductId: { not: null } } }),
      prisma.product.count({ where: { shopifyProductId: null } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        totalLocalProducts: totalLocal,
        syncedWithShopify: syncedProducts,
        localOnly: unsyncedProducts,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

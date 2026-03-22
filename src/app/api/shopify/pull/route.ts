import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/apiAuth";
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

// Helper: upsert a single Shopify product into local DB
async function upsertProduct(sp: ShopifyProductNode) {
  const existing = await prisma.product.findFirst({
    where: { shopifyProductId: sp.id },
    include: { variants: true, images: true },
  });

  const category = guessCategory(sp);
  const brand = getMetafield(sp, "custom", "brand") || sp.vendor || "Unknown";
  const modelNo = getMetafield(sp, "custom", "model_no") || "";

  // Extract first variant price as base MRP
  const firstVariant = sp.variants.edges[0]?.node;
  const baseMrp = firstVariant
    ? parseFloat(firstVariant.compareAtPrice || firstVariant.price || "0")
    : 0;
  const basePrice = firstVariant ? parseFloat(firstVariant.price || "0") : 0;

  const productData = {
    shopifyProductId: sp.id,
    title: sp.title,
    category,
    status: mapStatus(sp.status),
    brand,
    modelNo: modelNo || null,
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

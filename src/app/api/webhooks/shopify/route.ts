import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// Shopify sends webhooks as POST requests with HMAC verification
// The HMAC is in the X-Shopify-Hmac-Sha256 header

function verifyWebhookHmac(body: string, hmacHeader: string): boolean {
  const secret = process.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_WEBHOOK_SECRET || "";
  if (!secret) {
    console.warn("No webhook secret configured — skipping HMAC verification");
    return true; // Allow if no secret (for development)
  }
  const hash = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
}

// Handle product create/update from Shopify
async function handleProductCreateUpdate(payload: any) {
  const shopifyGid = `gid://shopify/Product/${payload.id}`;

  // Find existing product
  const existing = await prisma.product.findFirst({
    where: { shopifyProductId: shopifyGid },
    include: { variants: true },
  });

  const title = payload.title || "";
  const status =
    payload.status === "active"
      ? "PUBLISHED"
      : payload.status === "draft"
      ? "DRAFT"
      : "ARCHIVED";
  const tags = (payload.tags || "").split(", ").filter(Boolean).join(", ");
  const mrp = payload.variants?.[0]
    ? parseFloat(payload.variants[0].compare_at_price || payload.variants[0].price || "0")
    : 0;
  const price = payload.variants?.[0]
    ? parseFloat(payload.variants[0].price || "0")
    : 0;

  const productData = {
    shopifyProductId: shopifyGid,
    title,
    status,
    brand: payload.vendor || "Unknown",
    category: guessCategory(payload),
    htmlDescription: payload.body_html || null,
    tags,
    pageUrl: payload.handle || null,
    mrp,
    discountedPrice: price,
    compareAtPrice: mrp,
  };

  let productId: string;

  if (existing) {
    await prisma.product.update({
      where: { id: existing.id },
      data: productData,
    });
    productId = existing.id;
  } else {
    const created = await prisma.product.create({
      data: {
        ...productData,
        sku: payload.variants?.[0]?.sku || `SHOP-${payload.handle || payload.id}`,
      },
    });
    productId = created.id;
  }

  // Sync variants
  if (payload.variants) {
    const existingVariants = existing?.variants || [];
    const existingShopifyVIds = new Set(
      existingVariants.map((v) => v.shopifyVariantId).filter(Boolean)
    );

    for (const sv of payload.variants) {
      const svGid = `gid://shopify/ProductVariant/${sv.id}`;

      if (existingShopifyVIds.has(svGid)) {
        const local = existingVariants.find((v) => v.shopifyVariantId === svGid);
        if (local) {
          await prisma.productVariant.update({
            where: { id: local.id },
            data: {
              mrp: parseFloat(sv.compare_at_price || sv.price || "0"),
              discountedPrice: parseFloat(sv.price || "0"),
              compareAtPrice: parseFloat(sv.compare_at_price || sv.price || "0"),
              barcode: sv.barcode || null,
              sku: sv.sku || null,
              title: sv.title || null,
            },
          });
        }
      } else {
        // New variant
        const colorCode =
          sv.option1 || sv.title?.split(" / ")[0] || "DEFAULT";
        const frameSize = sv.option2 || sv.title?.split(" / ")[1] || null;

        try {
          await prisma.productVariant.create({
            data: {
              productId,
              shopifyVariantId: svGid,
              colorCode,
              frameSize,
              mrp: parseFloat(sv.compare_at_price || sv.price || "0"),
              discountedPrice: parseFloat(sv.price || "0"),
              compareAtPrice: parseFloat(sv.compare_at_price || sv.price || "0"),
              sku: sv.sku || null,
              barcode: sv.barcode || null,
              title: sv.title || null,
            },
          });
        } catch {
          // Skip duplicate
        }
      }
    }
  }

  return productId;
}

// Handle product delete from Shopify
async function handleProductDelete(payload: any) {
  const shopifyGid = `gid://shopify/Product/${payload.id}`;
  const existing = await prisma.product.findFirst({
    where: { shopifyProductId: shopifyGid },
  });
  if (existing) {
    await prisma.product.update({
      where: { id: existing.id },
      data: { status: "ARCHIVED" },
    });
  }
}

// Handle inventory level update
async function handleInventoryUpdate(payload: any) {
  // payload has inventory_item_id, location_id, available
  // We'd need to map inventory_item_id back to a variant
  // For now, log the event
  console.log("Inventory update:", payload);
}

// Handle order create
async function handleOrderCreate(payload: any) {
  // Log order for future order management features
  console.log(`Order created: ${payload.name || payload.id}`);
}

// Handle collection events
async function handleCollectionCreateUpdate(payload: any) {
  const shopifyGid = `gid://shopify/Collection/${payload.id}`;
  const existing = await prisma.collection.findUnique({
    where: { shopifyCollectionId: shopifyGid },
  });

  const data = {
    title: payload.title || "",
    handle: payload.handle || null,
    description: payload.body_html || null,
    descriptionHtml: payload.body_html || null,
    sortOrder: payload.sort_order || null,
    published: payload.published_at !== null,
    lastSyncedAt: new Date(),
  };

  if (existing) {
    if (!existing.locallyModified) {
      await prisma.collection.update({
        where: { shopifyCollectionId: shopifyGid },
        data,
      });
    }
  } else {
    await prisma.collection.create({
      data: {
        shopifyCollectionId: shopifyGid,
        ...data,
        collectionType: "CUSTOM",
      },
    });
  }
}

async function handleCollectionDelete(payload: any) {
  const shopifyGid = `gid://shopify/Collection/${payload.id}`;
  await prisma.collection
    .delete({ where: { shopifyCollectionId: shopifyGid } })
    .catch(() => {});
}

function guessCategory(payload: any): string {
  const type = (payload.product_type || "").toLowerCase();
  const tags = (payload.tags || "").toLowerCase();
  const title = (payload.title || "").toLowerCase();

  if (
    type.includes("sunglass") ||
    tags.includes("sunglass") ||
    title.includes("sunglass")
  ) {
    return "SUNGLASSES";
  }
  if (
    type.includes("solution") ||
    tags.includes("solution")
  ) {
    return "SOLUTIONS";
  }
  return "SPECTACLES";
}

// POST /api/webhooks/shopify — Receive incoming Shopify webhooks
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const hmacHeader = request.headers.get("x-shopify-hmac-sha256") || "";
    const topic = request.headers.get("x-shopify-topic") || "unknown";
    const shopifyDomain = request.headers.get("x-shopify-shop-domain") || "";

    // Verify HMAC
    if (hmacHeader && !verifyWebhookHmac(rawBody, hmacHeader)) {
      console.error("Webhook HMAC verification failed");
      await prisma.webhookEvent.create({
        data: {
          topic,
          status: "FAILED",
          message: "HMAC verification failed",
        },
      });
      return NextResponse.json(
        { success: false, error: "HMAC verification failed" },
        { status: 401 }
      );
    }

    const payload = JSON.parse(rawBody);
    const shopifyId = payload.id ? String(payload.id) : null;

    // Log the event
    const event = await prisma.webhookEvent.create({
      data: {
        topic,
        shopifyId,
        payload: rawBody.substring(0, 5000), // Truncate large payloads
        status: "RECEIVED",
      },
    });

    // Process based on topic
    try {
      switch (topic) {
        case "products/create":
        case "products/update":
          await handleProductCreateUpdate(payload);
          break;
        case "products/delete":
          await handleProductDelete(payload);
          break;
        case "inventory_levels/update":
          await handleInventoryUpdate(payload);
          break;
        case "orders/create":
        case "orders/updated":
          await handleOrderCreate(payload);
          break;
        case "collections/create":
        case "collections/update":
          await handleCollectionCreateUpdate(payload);
          break;
        case "collections/delete":
          await handleCollectionDelete(payload);
          break;
        default:
          console.log(`Unhandled webhook topic: ${topic}`);
      }

      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: "PROCESSED", message: `Handled ${topic} for ${shopifyDomain}` },
      });
    } catch (processError) {
      const errMsg =
        processError instanceof Error ? processError.message : "Processing failed";
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: "FAILED", message: errMsg },
      });
      console.error(`Webhook processing error (${topic}):`, errMsg);
    }

    // Always return 200 to Shopify so it doesn't retry
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json({ success: true }); // Still 200 to prevent retries
  }
}

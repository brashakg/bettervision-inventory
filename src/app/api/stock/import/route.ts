import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { items } = body as {
      items: Array<{ sku: string; quantity: number }>;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "items array is required" },
        { status: 400 }
      );
    }

    // Get or create the default SHOPIFY location
    let location = await prisma.location.findFirst({
      where: { code: "SHOPIFY" },
    });
    if (!location) {
      location = await prisma.location.create({
        data: {
          name: "Shopify Online Store",
          code: "SHOPIFY",
          address: "Online",
          isActive: true,
        },
      });
    }

    let matched = 0;
    let notFound = 0;
    let updated = 0;
    let errors: string[] = [];
    const notFoundSkus: string[] = [];

    // Process in batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const skus = batch.map((item) => item.sku);

      // Find products by SKU
      const products = await prisma.product.findMany({
        where: { sku: { in: skus } },
        select: { id: true, sku: true },
      });

      const skuToProduct = new Map(products.map((p) => [p.sku, p.id]));

      for (const item of batch) {
        const productId = skuToProduct.get(item.sku);
        if (!productId) {
          notFound++;
          if (notFoundSkus.length < 20) {
            notFoundSkus.push(item.sku);
          }
          continue;
        }

        matched++;
        try {
          await prisma.productLocation.upsert({
            where: {
              productId_locationId: {
                productId,
                locationId: location.id,
              },
            },
            update: { quantity: item.quantity },
            create: {
              productId,
              locationId: location.id,
              quantity: item.quantity,
            },
          });
          updated++;
        } catch (err: any) {
          errors.push(`SKU ${item.sku}: ${err.message}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalItems: items.length,
        matched,
        updated,
        notFound,
        errors: errors.length,
      },
      notFoundSkus: notFoundSkus.slice(0, 20),
      errors: errors.slice(0, 10),
    });
  } catch (err: any) {
    console.error("Stock import error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

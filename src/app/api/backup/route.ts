import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/apiAuth";

/**
 * GET /api/backup
 * Exports all products from the app database as JSON.
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth.authorized) return auth.response!;

    const products = await prisma.product.findMany({
      include: {
        variants: true,
        images: true,
        locations: {
          include: { location: true },
        },
      },
    });

    const exportData = {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      totalProducts: products.length,
      products: products.map((p) => ({
        sku: p.sku,
        title: p.title,
        productName: p.productName,
        fullModelNo: p.fullModelNo,
        modelNo: p.modelNo,
        brand: p.brand,
        subBrand: p.subBrand,
        label: p.label,
        category: p.category,
        status: p.status,
        mrp: p.mrp,
        discountedPrice: p.discountedPrice,
        compareAtPrice: p.compareAtPrice,
        shape: p.shape,
        frameColor: p.frameColor,
        frameColorCode: p.frameColorCode,
        templeColor: p.templeColor,
        frameMaterial: p.frameMaterial,
        templeMaterial: p.templeMaterial,
        frameType: p.frameType,
        frameSize: p.frameSize,
        bridge: p.bridge,
        templeLength: p.templeLength,
        gender: p.gender,
        genderLabel: p.genderLabel,
        lensColor: p.lensColor,
        lensTint: p.lensTint,
        lensUsp: p.lensUsp,
        lensMaterial: p.lensMaterial,
        polarization: p.polarization,
        uvProtection: p.uvProtection,
        productUsp: p.productUsp,
        usp1: p.usp1,
        usp2: p.usp2,
        warranty: p.warranty,
        countryOfOrigin: p.countryOfOrigin,
        gtin: p.gtin,
        weight: p.weight,
        htmlDescription: p.htmlDescription,
        seoTitle: p.seoTitle,
        seoDescription: p.seoDescription,
        pageUrl: p.pageUrl,
        tags: p.tags,
        shopifyProductId: p.shopifyProductId,
        barcode: p.barcode,
        images: p.images.map((img) => ({ url: img.url, altText: img.altText })),
        variants: p.variants.map((v) => ({
          sku: v.sku,
          title: v.title,
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          barcode: v.barcode,
          inventoryQuantity: v.inventoryQuantity,
        })),
        inventory: p.locations.map((pl) => ({
          locationName: pl.location.name,
          locationCode: pl.location.code,
          quantity: pl.quantity,
        })),
      })),
    };

    const json = JSON.stringify(exportData, null, 2);
    return new NextResponse(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="bv-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Backup failed" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/backup
 * Restores product inventory quantities from a previously exported backup JSON.
 * Only updates quantity fields; does NOT overwrite product data.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authorized) return auth.response!;

    const body = await request.json();
    const { products, restoreInventory = true } = body as {
      products: Array<{
        sku: string;
        inventory?: Array<{ locationCode: string; quantity: number }>;
        variants?: Array<{ sku: string; barcode?: string; inventoryQuantity: number }>;
      }>;
      restoreInventory: boolean;
    };

    if (!products || !Array.isArray(products)) {
      return NextResponse.json(
        { error: "Invalid backup file format" },
        { status: 400 }
      );
    }

    let matched = 0;
    let notFound = 0;
    let updated = 0;
    const notFoundSkus: string[] = [];
    const errors: string[] = [];

    for (const item of products) {
      const product = await prisma.product.findFirst({
        where: { sku: item.sku },
      });

      if (!product) {
        notFound++;
        if (notFoundSkus.length < 20) notFoundSkus.push(item.sku);
        continue;
      }

      matched++;

      // Restore variant barcodes if present
      if (item.variants) {
        for (const v of item.variants) {
          if (v.sku && v.barcode) {
            try {
              await prisma.productVariant.updateMany({
                where: { productId: product.id, sku: v.sku },
                data: { barcode: v.barcode },
              });
            } catch { /* skip if variant not found */ }
          }
        }
      }

      if (restoreInventory && item.inventory) {
        for (const inv of item.inventory) {
          try {
            let location = await prisma.location.findFirst({
              where: { code: inv.locationCode },
            });
            if (!location) {
              location = await prisma.location.create({
                data: {
                  name: inv.locationCode,
                  code: inv.locationCode,
                  address: "",
                  isActive: true,
                },
              });
            }
            await prisma.productLocation.upsert({
              where: {
                productId_locationId: {
                  productId: product.id,
                  locationId: location.id,
                },
              },
              update: { quantity: inv.quantity },
              create: {
                productId: product.id,
                locationId: location.id,
                quantity: inv.quantity,
              },
            });
            updated++;
          } catch (err: any) {
            errors.push(`SKU ${item.sku}: ${err.message}`);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalProducts: products.length,
        matched,
        updated,
        notFound,
        errors: errors.length,
      },
      notFoundSkus: notFoundSkus.slice(0, 20),
      errors: errors.slice(0, 10),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Restore failed" },
      { status: 500 }
    );
  }
}

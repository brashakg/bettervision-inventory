import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/apiAuth";
import {
  createProduct,
  setProductMetafields,
  type ShopifyVariantInput,
} from "@/lib/shopify";

interface SyncRequest {
  productIds: string[];
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(["ADMIN", "CATALOG_MANAGER"]);
    if (!auth.authorized) return auth.response!;

    const body: SyncRequest = await request.json();

    if (!body.productIds || body.productIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "productIds array is required" },
        { status: 400 }
      );
    }

    const products = await prisma.product.findMany({
      where: { id: { in: body.productIds } },
      include: {
        images: { orderBy: { position: "asc" } },
        variants: {
          include: {
            images: { orderBy: { position: "asc" } },
            locations: true,
          },
          orderBy: [{ colorCode: "asc" }, { frameSize: "asc" }],
        },
      },
    });

    if (products.length === 0) {
      return NextResponse.json(
        { success: false, error: "No products found" },
        { status: 404 }
      );
    }

    const results = [];
    const BATCH_SIZE = 10;
    const BATCH_DELAY_MS = 1000;

    for (let i = 0; i < products.length; i++) {
      const product = products[i];

      if (i > 0 && i % BATCH_SIZE === 0) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }

      if (product.shopifyProductId) {
        results.push({
          productId: product.id,
          status: "SKIPPED",
          message: "Product already synced to Shopify",
        });
        continue;
      }

      try {
        // ── Build product options and variants for Shopify ──
        const hasVariants = product.variants.length > 0;

        // Collect unique colors and sizes from variants
        const uniqueColors = [
          ...new Set(product.variants.map((v) => v.colorCode).filter(Boolean)),
        ];
        const uniqueSizes = [
          ...new Set(
            product.variants
              .map((v) => v.frameSize)
              .filter(Boolean) as string[]
          ),
        ];

        // Build product options for Shopify
        const productOptions: Array<{
          name: string;
          values: Array<{ name: string }>;
        }> = [];

        if (hasVariants && uniqueColors.length > 0) {
          productOptions.push({
            name: "Color",
            values: uniqueColors.map((c) => ({ name: c })),
          });
        }
        if (hasVariants && uniqueSizes.length > 0) {
          productOptions.push({
            name: "Size",
            values: uniqueSizes.map((s) => ({ name: s })),
          });
        }

        // Build Shopify variant inputs
        const shopifyVariants: ShopifyVariantInput[] = hasVariants
          ? product.variants.map((v) => {
              const optionValues: Array<{
                optionName: string;
                name: string;
              }> = [];
              if (v.colorCode) {
                optionValues.push({
                  optionName: "Color",
                  name: v.colorCode,
                });
              }
              if (v.frameSize) {
                optionValues.push({
                  optionName: "Size",
                  name: v.frameSize,
                });
              }
              return {
                optionValues,
                price: (v.discountedPrice || v.mrp || product.mrp || 0).toString(),
                compareAtPrice: (v.mrp || product.mrp || 0).toString(),
                sku: v.sku || "",
                barcode: v.barcode || "",
              };
            })
          : [];

        // Collect all images (product-level + variant-level)
        const allImages = [
          ...product.images.map((img) => ({
            src: img.url.startsWith("http")
              ? img.url
              : `${process.env.NEXTAUTH_URL || "http://localhost:3000"}${img.url}`,
            alt: product.title || "",
          })),
          ...product.variants.flatMap((v) =>
            v.images.map((img) => ({
              src: img.url.startsWith("http")
                ? img.url
                : `${process.env.NEXTAUTH_URL || "http://localhost:3000"}${img.url}`,
              alt: `${product.title || ""} ${v.colorCode || ""}`.trim(),
            }))
          ),
        ];

        // ── Create on Shopify ──
        const shopifyResult = await createProduct({
          title: product.title || `${product.brand} ${product.modelNo || ""}`.trim(),
          description: product.htmlDescription || "",
          images: allImages.length > 0 ? allImages : undefined,
          seoTitle: product.seoTitle || "",
          seoDescription: product.seoDescription || "",
          tags: product.tags?.split(", ") || [],
          productOptions:
            productOptions.length > 0 ? productOptions : undefined,
          variants: shopifyVariants.length > 0 ? shopifyVariants : undefined,
        });

        if (shopifyResult.success && shopifyResult.shopifyId) {
          // Update product with Shopify ID
          await prisma.product.update({
            where: { id: product.id },
            data: {
              shopifyProductId: shopifyResult.shopifyId,
              status: "PUBLISHED",
            },
          });

          // Map variant IDs back to our DB
          if (shopifyResult.variantIds && hasVariants) {
            for (const svId of shopifyResult.variantIds) {
              if (svId.sku) {
                const localVariant = product.variants.find(
                  (v) => v.sku === svId.sku
                );
                if (localVariant) {
                  await prisma.productVariant.update({
                    where: { id: localVariant.id },
                    data: { shopifyVariantId: svId.shopifyVariantId },
                  });
                }
              }
            }
          }

          // Set metafields for extra product data
          const metafields = [];
          if (product.brand) {
            metafields.push({
              namespace: "custom",
              key: "brand",
              value: product.brand,
              type: "single_line_text_field",
            });
          }
          if (product.modelNo) {
            metafields.push({
              namespace: "custom",
              key: "model_no",
              value: product.modelNo,
              type: "single_line_text_field",
            });
          }
          if (product.frameMaterial) {
            metafields.push({
              namespace: "custom",
              key: "frame_material",
              value: product.frameMaterial,
              type: "single_line_text_field",
            });
          }
          if (product.shape) {
            metafields.push({
              namespace: "custom",
              key: "shape",
              value: product.shape,
              type: "single_line_text_field",
            });
          }
          if (product.gender) {
            metafields.push({
              namespace: "custom",
              key: "gender",
              value: product.gender,
              type: "single_line_text_field",
            });
          }
          if (product.countryOfOrigin) {
            metafields.push({
              namespace: "custom",
              key: "country_of_origin",
              value: product.countryOfOrigin,
              type: "single_line_text_field",
            });
          }
          if (product.warranty) {
            metafields.push({
              namespace: "custom",
              key: "warranty",
              value: product.warranty,
              type: "single_line_text_field",
            });
          }

          if (metafields.length > 0) {
            await setProductMetafields(shopifyResult.shopifyId, metafields);
          }

          await prisma.syncLog.create({
            data: {
              productId: product.id,
              action: "SYNC",
              status: "SUCCESS",
              message: `Synced to Shopify with ${shopifyResult.variantIds?.length || 0} variant(s)`,
            },
          });

          results.push({
            productId: product.id,
            status: "SUCCESS",
            shopifyProductId: shopifyResult.shopifyId,
            variantCount: shopifyResult.variantIds?.length || 0,
            message: shopifyResult.message,
          });
        } else {
          await prisma.syncLog.create({
            data: {
              productId: product.id,
              action: "SYNC",
              status: "FAILED",
              message: shopifyResult.message,
            },
          });

          results.push({
            productId: product.id,
            status: "FAILED",
            message: shopifyResult.message,
          });
        }
      } catch (syncError) {
        const errMsg =
          syncError instanceof Error ? syncError.message : "Unknown sync error";

        await prisma.syncLog.create({
          data: {
            productId: product.id,
            action: "SYNC",
            status: "FAILED",
            message: errMsg,
          },
        });

        results.push({
          productId: product.id,
          status: "FAILED",
          message: errMsg,
        });
      }
    }

    const successCount = results.filter((r) => r.status === "SUCCESS").length;
    const failedCount = results.filter((r) => r.status === "FAILED").length;
    const skippedCount = results.filter((r) => r.status === "SKIPPED").length;

    return NextResponse.json({
      success: true,
      data: results,
      summary: {
        total: products.length,
        success: successCount,
        failed: failedCount,
        skipped: skippedCount,
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/apiAuth";
import { fetchAllCollections } from "@/lib/shopify";

// POST /api/collections/sync — Pull all collections from Shopify and upsert locally
export async function POST() {
  try {
    const auth = await requireAuth(["ADMIN"]);
    if (!auth.authorized) return auth.response!;

    const result = await fetchAllCollections();
    if (!result.success || !result.collections) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to fetch from Shopify" },
        { status: 502 }
      );
    }

    let created = 0;
    let updated = 0;

    for (const sc of result.collections) {
      const isSmartCollection = sc.ruleSet !== null && sc.ruleSet.rules.length > 0;

      const data = {
        title: sc.title,
        handle: sc.handle,
        description: sc.description || null,
        descriptionHtml: sc.descriptionHtml || null,
        collectionType: isSmartCollection ? "SMART" : "CUSTOM",
        sortOrder: sc.sortOrder || null,
        templateSuffix: sc.templateSuffix || null,
        imageUrl: sc.image?.url || null,
        imageAlt: sc.image?.altText || null,
        seoTitle: sc.seo?.title || null,
        seoDescription: sc.seo?.description || null,
        published: true,
        productsCount: sc.productsCount?.count || 0,
        rules: isSmartCollection ? JSON.stringify(sc.ruleSet!.rules) : null,
        disjunctive: sc.ruleSet?.appliedDisjunctively || false,
        lastSyncedAt: new Date(),
      };

      const existing = await prisma.collection.findUnique({
        where: { shopifyCollectionId: sc.id },
      });

      if (existing) {
        // Only update if not locally modified
        if (!existing.locallyModified) {
          await prisma.collection.update({
            where: { shopifyCollectionId: sc.id },
            data,
          });
        } else {
          // Just update the sync timestamp
          await prisma.collection.update({
            where: { shopifyCollectionId: sc.id },
            data: { lastSyncedAt: new Date() },
          });
        }
        updated++;
      } else {
        await prisma.collection.create({
          data: {
            shopifyCollectionId: sc.id,
            ...data,
          },
        });
        created++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${result.collections.length} collections (${created} new, ${updated} updated)`,
      total: result.collections.length,
      created,
      updated,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

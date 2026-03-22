import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/apiAuth";

export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth.authorized) return auth.response!;

    // Check if Shopify credentials are configured (OAuth or legacy)
    const storeUrl = process.env.SHOPIFY_STORE_URL;
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

    const isConfigured = !!storeUrl && ((!!clientId && !!clientSecret) || !!accessToken);

    // Get sync statistics
    const syncLogs = await prisma.syncLog.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    });

    const totalSynced = syncLogs.filter((log) => log.status === "SUCCESS").length;
    const failedSyncs = syncLogs.filter((log) => log.status === "FAILED").length;
    const lastSync = syncLogs[0]?.createdAt || null;

    return NextResponse.json({
      configured: isConfigured,
      storeUrl: storeUrl ? storeUrl.replace(/[^/]/g, (c, i) => i > 8 ? "*" : c) : null,
      stats: {
        totalSynced,
        failedSyncs,
        lastSync,
      },
    });
  } catch (error) {
    console.error("Error checking Shopify status:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Error checking Shopify status",
      },
      { status: 500 }
    );
  }
}

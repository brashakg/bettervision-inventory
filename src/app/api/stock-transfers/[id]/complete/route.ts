import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/apiAuth";
import { logActivity } from "@/lib/activityLog";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (!auth.authorized) return auth.response!;

    const { id } = await params;
    const transfer = await prisma.stockTransfer.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!transfer) {
      return NextResponse.json(
        { success: false, error: "Transfer not found" },
        { status: 404 }
      );
    }

    if (transfer.status !== "PENDING" && transfer.status !== "IN_TRANSIT") {
      return NextResponse.json(
        { success: false, error: `Cannot complete transfer with status: ${transfer.status}` },
        { status: 400 }
      );
    }

    for (const item of transfer.items) {
      await prisma.productLocation.updateMany({
        where: {
          productId: item.productId,
          locationId: transfer.fromLocationId,
        },
        data: { quantity: { decrement: item.quantity } },
      });

      await prisma.productLocation.upsert({
        where: {
          productId_locationId: {
            productId: item.productId,
            locationId: transfer.toLocationId,
          },
        },
        update: { quantity: { increment: item.quantity } },
        create: {
          productId: item.productId,
          locationId: transfer.toLocationId,
          quantity: item.quantity,
        },
      });
    }

    // Also update variant-level inventory if variantId is set
    for (const item of transfer.items) {
      if (item.variantId) {
        // Decrement from source
        await prisma.variantLocation.updateMany({
          where: { variantId: item.variantId, locationId: transfer.fromLocationId },
          data: { quantity: { decrement: item.quantity } },
        });
        // Increment at destination
        await prisma.variantLocation.upsert({
          where: {
            variantId_locationId: {
              variantId: item.variantId,
              locationId: transfer.toLocationId,
            },
          },
          update: { quantity: { increment: item.quantity } },
          create: {
            variantId: item.variantId,
            locationId: transfer.toLocationId,
            quantity: item.quantity,
          },
        });
      }
    }

    const updated = await prisma.stockTransfer.update({
      where: { id },
      data: { status: "COMPLETED", completedAt: new Date() },
      include: { items: true },
    });

    logActivity({
      userId: (auth.session?.user as any)?.id,
      userName: auth.session?.user?.name,
      userEmail: auth.session?.user?.email,
      action: "COMPLETE",
      entity: "STOCK_TRANSFER",
      entityId: id,
      details: `Completed transfer ${transfer.transferNumber}: ${transfer.items.length} items moved`,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

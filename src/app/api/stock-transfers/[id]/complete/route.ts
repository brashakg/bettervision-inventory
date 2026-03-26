import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/apiAuth";

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

    const updated = await prisma.stockTransfer.update({
      where: { id },
      data: { status: "COMPLETED", completedAt: new Date() },
      include: { items: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

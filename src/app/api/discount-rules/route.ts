import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/apiAuth";

export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth.authorized) return auth.response!;

    const rules = await prisma.discountRule.findMany({
      orderBy: { category: "asc" },
    });

    return NextResponse.json({ success: true, data: rules });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(["ADMIN"]);
    if (!auth.authorized) return auth.response!;

    const body = await request.json();
    const { category, discountPercentage } = body;

    if (!category || discountPercentage === undefined) {
      return NextResponse.json(
        { success: false, error: "category and discountPercentage are required" },
        { status: 400 }
      );
    }

    const rule = await prisma.discountRule.upsert({
      where: { category: category.toUpperCase() },
      update: { discountPercentage: parseFloat(discountPercentage) },
      create: {
        category: category.toUpperCase(),
        discountPercentage: parseFloat(discountPercentage),
      },
    });

    return NextResponse.json({ success: true, data: rule });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(["ADMIN"]);
    if (!auth.authorized) return auth.response!;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }

    await prisma.discountRule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

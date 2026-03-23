import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/apiAuth";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authorized) return auth.response!;

    // Fetch distinct values for each filter field
    const [brands, shapes, frameMaterials, frameTypes, genders, categories, statuses] = await Promise.all([
      prisma.product.findMany({
        where: { brand: { not: null } },
        distinct: ['brand'],
        select: { brand: true },
        orderBy: { brand: 'asc' },
      }),
      prisma.product.findMany({
        where: { shape: { not: null } },
        distinct: ['shape'],
        select: { shape: true },
        orderBy: { shape: 'asc' },
      }),
      prisma.product.findMany({
        where: { frameMaterial: { not: null } },
        distinct: ['frameMaterial'],
        select: { frameMaterial: true },
        orderBy: { frameMaterial: 'asc' },
      }),
      prisma.product.findMany({
        where: { frameType: { not: null } },
        distinct: ['frameType'],
        select: { frameType: true },
        orderBy: { frameType: 'asc' },
      }),
      prisma.product.findMany({
        where: { gender: { not: null } },
        distinct: ['gender'],
        select: { gender: true },
        orderBy: { gender: 'asc' },
      }),
      prisma.product.findMany({
        where: { category: { not: null } },
        distinct: ['category'],
        select: { category: true },
        orderBy: { category: 'asc' },
      }),
      prisma.product.findMany({
        where: { status: { not: null } },
        distinct: ['status'],
        select: { status: true },
        orderBy: { status: 'asc' },
      }),
    ]);

    // Filter out null/empty values and extract the actual values
    const filterOutEmpty = (items: Array<{ [key: string]: any }>, field: string) => {
      return items
        .map((item) => item[field])
        .filter((val) => val && val.trim() !== '');
    };

    return NextResponse.json(
      {
        success: true,
        brands: filterOutEmpty(brands, 'brand'),
        shapes: filterOutEmpty(shapes, 'shape'),
        frameMaterials: filterOutEmpty(frameMaterials, 'frameMaterial'),
        frameTypes: filterOutEmpty(frameTypes, 'frameType'),
        genders: filterOutEmpty(genders, 'gender'),
        categories: filterOutEmpty(categories, 'category'),
        statuses: filterOutEmpty(statuses, 'status'),
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

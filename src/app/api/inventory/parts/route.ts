export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// GET: Fetch all parts with filtering, sorting, pagination, and KPI stats
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const search = url.searchParams.get('search')?.trim() || '';
    const category = url.searchParams.get('category')?.trim() || '';
    const brand = url.searchParams.get('brand')?.trim() || '';
    const stockStatus = url.searchParams.get('status')?.trim() || ''; // IN_STOCK, LOW_STOCK, OUT_OF_STOCK, HIGH_DEMAND
    const highDemandOnly = url.searchParams.get('isHighDemand') === 'true';
    const lowStockOnly = url.searchParams.get('lowStockOnly') === 'true';
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { partName: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { compatibleModels: { has: search } },
        { location: { contains: search, mode: 'insensitive' } },
        { supplier: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (category && category !== 'ALL') {
      where.category = { equals: category, mode: 'insensitive' };
    }

    if (brand && brand !== 'ALL') {
      where.brand = { equals: brand, mode: 'insensitive' };
    }

    if (highDemandOnly) {
      where.isHighDemand = true;
    }

    if (stockStatus && stockStatus !== 'ALL') {
      if (stockStatus === 'HIGH_DEMAND') {
        where.isHighDemand = true;
      } else {
        where.status = stockStatus;
      }
    }

    const [allParts, totalCount] = await Promise.all([
      (prisma as any).sparePart.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      (prisma as any).sparePart.count({ where }),
    ]);

    // Calculate aggregated stats across all parts
    const allForStats = await (prisma as any).sparePart.findMany({
      select: {
        id: true,
        quantity: true,
        costPrice: true,
        sellingPrice: true,
        minStockLevel: true,
        status: true,
        isHighDemand: true,
        usedCount: true,
      },
    });

    let totalStockCount = 0;
    let totalStockValue = 0;
    let totalSellingValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let highDemandCount = 0;
    let totalUsedCount = 0;

    allForStats.forEach((p: any) => {
      const qty = p.quantity || 0;
      const cost = p.costPrice || 0;
      const sell = p.sellingPrice || 0;
      const minLevel = p.minStockLevel ?? 5;

      totalStockCount += qty;
      totalStockValue += qty * cost;
      totalSellingValue += qty * sell;
      totalUsedCount += p.usedCount || 0;

      if (qty <= 0) {
        outOfStockCount++;
      } else if (qty <= minLevel) {
        lowStockCount++;
      }

      if (p.isHighDemand) {
        highDemandCount++;
      }
    });

    const stats = {
      totalParts: allForStats.length,
      totalStockCount,
      totalStockValue: Math.round(totalStockValue),
      totalSellingValue: Math.round(totalSellingValue),
      lowStockCount,
      outOfStockCount,
      highDemandCount,
      totalUsedCount,
    };

    return NextResponse.json(
      {
        success: true,
        parts: allParts,
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit) || 1,
        stats,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[GET /api/inventory/parts error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch spare parts inventory' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// POST: Create a new spare part in inventory
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      partName,
      sku,
      category,
      brand,
      compatibleModels = [],
      qualityGrade,
      costPrice = 0,
      sellingPrice = 0,
      mrp = 0,
      quantity = 0,
      minStockLevel = 5,
      location,
      supplier,
      images = [],
      isHighDemand = false,
      notes,
    } = body;

    if (!partName || !category) {
      return NextResponse.json(
        { success: false, error: 'partName and category are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const qtyNum = parseInt(String(quantity), 10) || 0;
    const minNum = parseInt(String(minStockLevel), 10) || 5;

    let computedStatus = 'IN_STOCK';
    if (qtyNum <= 0) {
      computedStatus = 'OUT_OF_STOCK';
    } else if (qtyNum <= minNum) {
      computedStatus = 'LOW_STOCK';
    }

    const initialLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      date: new Date().toISOString(),
      type: 'INITIAL_ENTRY',
      quantity: qtyNum,
      previousQuantity: 0,
      newQuantity: qtyNum,
      reason: 'Initial part inventory setup',
      performedBy: 'Admin',
    };

    const newPart = await (prisma as any).sparePart.create({
      data: {
        partName: String(partName).trim(),
        sku: sku ? String(sku).trim().toUpperCase() : undefined,
        category: String(category).trim(),
        brand: brand ? String(brand).trim() : undefined,
        compatibleModels: Array.isArray(compatibleModels)
          ? compatibleModels.map((m: any) => String(m).trim()).filter(Boolean)
          : String(compatibleModels)
              .split(',')
              .map((m: string) => m.trim())
              .filter(Boolean),
        qualityGrade: qualityGrade ? String(qualityGrade).trim() : undefined,
        costPrice: parseFloat(String(costPrice)) || 0,
        sellingPrice: parseFloat(String(sellingPrice)) || 0,
        mrp: parseFloat(String(mrp)) || 0,
        quantity: qtyNum,
        minStockLevel: minNum,
        location: location ? String(location).trim() : undefined,
        supplier: supplier ? String(supplier).trim() : undefined,
        images: Array.isArray(images) ? images : images ? [images] : [],
        status: computedStatus,
        isHighDemand: Boolean(isHighDemand),
        usedCount: 0,
        usedIn: [],
        stockLogs: [initialLog],
        notes: notes ? String(notes).trim() : undefined,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Spare part created successfully in inventory',
        part: newPart,
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[POST /api/inventory/parts error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to create spare part' },
      { status: 500, headers: corsHeaders }
    );
  }
}

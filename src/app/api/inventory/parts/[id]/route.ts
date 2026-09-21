export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// GET: Single part with full details & logs
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Part ID required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const part = await (prisma as any).sparePart.findUnique({
      where: { id },
    });

    if (!part) {
      return NextResponse.json(
        { success: false, error: 'Spare part not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json({ success: true, part }, { headers: corsHeaders });
  } catch (error: any) {
    console.error('[GET /api/inventory/parts/[id] error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch part' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// PATCH: Update part details, pricing, images, compatibility
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await (prisma as any).sparePart.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Spare part not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const updateData: any = {};

    if (body.partName !== undefined) updateData.partName = String(body.partName).trim();
    if (body.sku !== undefined) updateData.sku = body.sku ? String(body.sku).trim().toUpperCase() : null;
    if (body.category !== undefined) updateData.category = String(body.category).trim();
    if (body.brand !== undefined) updateData.brand = body.brand ? String(body.brand).trim() : null;
    if (body.qualityGrade !== undefined) updateData.qualityGrade = body.qualityGrade ? String(body.qualityGrade).trim() : null;
    if (body.location !== undefined) updateData.location = body.location ? String(body.location).trim() : null;
    if (body.supplier !== undefined) updateData.supplier = body.supplier ? String(body.supplier).trim() : null;
    if (body.notes !== undefined) updateData.notes = body.notes ? String(body.notes).trim() : null;
    if (body.isHighDemand !== undefined) updateData.isHighDemand = Boolean(body.isHighDemand);

    if (body.costPrice !== undefined) updateData.costPrice = parseFloat(String(body.costPrice)) || 0;
    if (body.sellingPrice !== undefined) updateData.sellingPrice = parseFloat(String(body.sellingPrice)) || 0;
    if (body.mrp !== undefined) updateData.mrp = parseFloat(String(body.mrp)) || 0;
    if (body.minStockLevel !== undefined) updateData.minStockLevel = parseInt(String(body.minStockLevel), 10) || 5;

    if (body.compatibleModels !== undefined) {
      updateData.compatibleModels = Array.isArray(body.compatibleModels)
        ? body.compatibleModels.map((m: any) => String(m).trim()).filter(Boolean)
        : String(body.compatibleModels)
            .split(',')
            .map((m: string) => m.trim())
            .filter(Boolean);
    }

    if (body.images !== undefined) {
      updateData.images = Array.isArray(body.images) ? body.images : body.images ? [body.images] : [];
    }

    // Check quantity & recompute status
    const currentQty = body.quantity !== undefined ? parseInt(String(body.quantity), 10) : existing.quantity;
    const currentMin = updateData.minStockLevel !== undefined ? updateData.minStockLevel : existing.minStockLevel;

    if (body.quantity !== undefined) {
      updateData.quantity = currentQty;
    }

    if (currentQty <= 0) {
      updateData.status = 'OUT_OF_STOCK';
    } else if (currentQty <= currentMin) {
      updateData.status = 'LOW_STOCK';
    } else {
      updateData.status = 'IN_STOCK';
    }

    const updated = await (prisma as any).sparePart.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(
      { success: true, message: 'Spare part updated successfully', part: updated },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[PATCH /api/inventory/parts/[id] error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to update part' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// DELETE: Remove part from inventory
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await (prisma as any).sparePart.delete({
      where: { id },
    });

    return NextResponse.json(
      { success: true, message: 'Part deleted successfully from inventory' },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[DELETE /api/inventory/parts/[id] error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to delete part' },
      { status: 500, headers: corsHeaders }
    );
  }
}

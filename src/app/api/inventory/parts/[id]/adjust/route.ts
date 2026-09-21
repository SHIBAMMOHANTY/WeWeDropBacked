export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// POST: Stock Adjustment (Stock In, Stock Out, Used in Refurb/Repair Job)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const {
      type, // 'ADD' | 'REMOVE' | 'REFURB_USE' | 'SET'
      quantity,
      reason,
      usedForModel,
      orderRef,
      quoteRef,
      technician = 'Refurbish Team',
      notes,
    } = body;

    const part = await (prisma as any).sparePart.findUnique({
      where: { id },
    });

    if (!part) {
      return NextResponse.json(
        { success: false, error: 'Spare part not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const adjustQty = Math.abs(parseInt(String(quantity), 10) || 0);
    if (adjustQty === 0 && type !== 'SET') {
      return NextResponse.json(
        { success: false, error: 'Quantity must be greater than 0' },
        { status: 400, headers: corsHeaders }
      );
    }

    const prevQty = part.quantity || 0;
    let newQty = prevQty;
    let newUsedCount = part.usedCount || 0;
    const existingUsedIn = Array.isArray(part.usedIn) ? [...part.usedIn] : [];
    const existingLogs = Array.isArray(part.stockLogs) ? [...part.stockLogs] : [];

    if (type === 'ADD') {
      newQty = prevQty + adjustQty;
    } else if (type === 'REMOVE') {
      newQty = Math.max(0, prevQty - adjustQty);
    } else if (type === 'REFURB_USE') {
      newQty = Math.max(0, prevQty - adjustQty);
      newUsedCount += adjustQty;

      // Add to usedIn history tracker
      existingUsedIn.unshift({
        id: `use_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        date: new Date().toISOString(),
        deviceModel: usedForModel || 'General Device',
        orderRef: orderRef || quoteRef || 'N/A',
        technician: technician || 'Refurbish Team',
        quantity: adjustQty,
        notes: notes || reason || 'Installed in refurbishment unit',
      });
    } else if (type === 'SET') {
      newQty = Math.max(0, parseInt(String(quantity), 10) || 0);
    }

    // Recompute stock status
    let computedStatus = 'IN_STOCK';
    if (newQty <= 0) {
      computedStatus = 'OUT_OF_STOCK';
    } else if (newQty <= (part.minStockLevel ?? 5)) {
      computedStatus = 'LOW_STOCK';
    }

    // Log this transaction
    existingLogs.unshift({
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      date: new Date().toISOString(),
      type: type || 'ADJUST',
      quantity: adjustQty,
      previousQuantity: prevQty,
      newQuantity: newQty,
      reason: reason || (type === 'REFURB_USE' ? `Used for ${usedForModel || 'device refurbishment'}` : 'Stock Adjustment'),
      usedForModel: usedForModel || undefined,
      orderRef: orderRef || quoteRef || undefined,
      technician: technician || undefined,
      performedBy: technician || 'Admin',
    });

    const updated = await (prisma as any).sparePart.update({
      where: { id },
      data: {
        quantity: newQty,
        usedCount: newUsedCount,
        status: computedStatus,
        usedIn: existingUsedIn.slice(0, 100),
        stockLogs: existingLogs.slice(0, 100),
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: `Stock updated successfully. New quantity: ${newQty}`,
        part: updated,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[POST /api/inventory/parts/[id]/adjust error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to adjust stock' },
      { status: 500, headers: corsHeaders }
    );
  }
}

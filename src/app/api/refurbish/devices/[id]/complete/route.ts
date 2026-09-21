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

// POST: Save refurbishment photos, replaced parts, pricing calculation & assign to SELLING_TEAM
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const {
      repairedProblems = [],
      replacedParts = [], // [{ partId, partName, partPrice, sku, quantity }]
      photos8to10 = {},   // { front, back, top, bottom, left, right, inside1, inside2, seal1, seal2 }
      initialBuyingPrice = 0,
      partsTotalCost = 0,
      labourCost = 0,
      totalRefurbCost = 0,
      finalSellingPrice = 0,
      technicianName = 'Refurbish Team',
      qcChecklist = {},
      notes = '',
      refurbStatus = 'READY_FOR_SALE',
      assignToSellingTeam = true,
    } = body;

    const quote = await (prisma as any).quote.findUnique({
      where: { id },
    });

    if (!quote) {
      return NextResponse.json(
        { success: false, error: 'Quote intake record not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const deviceModel = quote.model || 'Smartphone';
    const quoteRef = quote.quoteNumber || id;

    // 1. Automatically deduct stock for any inventory parts used
    if (Array.isArray(replacedParts) && replacedParts.length > 0) {
      for (const part of replacedParts) {
        if (part.partId) {
          try {
            const dbPart = await (prisma as any).sparePart.findUnique({
              where: { id: part.partId },
            });

            if (dbPart) {
              const deductQty = Math.max(1, parseInt(String(part.quantity || 1), 10));
              const prevQty = dbPart.quantity || 0;
              const newQty = Math.max(0, prevQty - deductQty);
              const newUsedCount = (dbPart.usedCount || 0) + deductQty;

              const existingUsedIn = Array.isArray(dbPart.usedIn) ? [...dbPart.usedIn] : [];
              existingUsedIn.unshift({
                id: `use_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                date: new Date().toISOString(),
                deviceModel: deviceModel,
                orderRef: quoteRef,
                technician: technicianName,
                quantity: deductQty,
                notes: `Installed during refurbishment of ${deviceModel} (${quoteRef})`,
              });

              const existingLogs = Array.isArray(dbPart.stockLogs) ? [...dbPart.stockLogs] : [];
              existingLogs.unshift({
                id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                date: new Date().toISOString(),
                type: 'REFURB_USE',
                quantity: deductQty,
                previousQuantity: prevQty,
                newQuantity: newQty,
                reason: `Refurbishment use for ${deviceModel} (${quoteRef})`,
                usedForModel: deviceModel,
                orderRef: quoteRef,
                technician: technicianName,
                performedBy: technicianName,
              });

              let partStatus = 'IN_STOCK';
              if (newQty <= 0) partStatus = 'OUT_OF_STOCK';
              else if (newQty <= (dbPart.minStockLevel ?? 5)) partStatus = 'LOW_STOCK';

              await (prisma as any).sparePart.update({
                where: { id: part.partId },
                data: {
                  quantity: newQty,
                  usedCount: newUsedCount,
                  status: partStatus,
                  usedIn: existingUsedIn.slice(0, 100),
                  stockLogs: existingLogs.slice(0, 100),
                },
              });
            }
          } catch (partErr) {
            console.warn('[Refurb Part Stock Adjust Notice]:', partErr);
          }
        }
      }
    }

    // 2. Build complete Refurbishment Data payload
    const refurbPayload = {
      refurbStatus: refurbStatus,
      assignedTeam: assignToSellingTeam ? 'SELLING_TEAM' : 'REFURBISH_TEAM',
      repairedProblems,
      replacedParts,
      photos8to10,
      initialBuyingPrice: parseFloat(String(initialBuyingPrice)) || 0,
      partsTotalCost: parseFloat(String(partsTotalCost)) || 0,
      labourCost: parseFloat(String(labourCost)) || 0,
      totalRefurbCost: parseFloat(String(totalRefurbCost)) || 0,
      finalSellingPrice: parseFloat(String(finalSellingPrice)) || 0,
      technicianName,
      qcChecklist,
      notes,
      completedAt: new Date().toISOString(),
    };

    // 3. Update the Quote record in Database
    const updatedQuote = await (prisma as any).quote.update({
      where: { id },
      data: {
        refurbishData: refurbPayload,
        status: assignToSellingTeam ? 'ready_for_sale' : 'in_repair',
        finalPrice: parseFloat(String(finalSellingPrice)) || quote.finalPrice,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Phone refurbished successfully and assigned to Selling Team!',
        device: updatedQuote,
        refurbishData: refurbPayload,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[POST /api/refurbish/devices/[id]/complete error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to complete refurbishment' },
      { status: 500, headers: corsHeaders }
    );
  }
}

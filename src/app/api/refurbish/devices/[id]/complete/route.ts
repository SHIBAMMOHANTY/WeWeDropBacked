export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// POST / PUT: Save refurbishment photos, replaced parts, repair status, pricing & assign to selling team
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
      refurbStatus = 'READY_FOR_SALE', // 'IN_REPAIR' | 'READY_FOR_SALE' | 'PENDING_INSPECTION'
      assignToSellingTeam = (refurbStatus === 'READY_FOR_SALE'),
      sellerId = null,
      sellerName = null,
      sellingGroup = 'All Selling Team',
      assignType = 'INDIVIDUAL',
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
    const isUnderRepair = (refurbStatus === 'IN_REPAIR' || !assignToSellingTeam);

    // 1. Build existing refurbish data and calculate differential parts usage
    const existingRefurbData = quote.refurbishData || {};
    const prevPartsList = Array.isArray(existingRefurbData.replacedParts) ? existingRefurbData.replacedParts : [];

    // Map of partId -> quantity previously deducted for this device
    const prevPartsMap = new Map<string, number>();
    for (const p of prevPartsList) {
      if (p.partId) {
        prevPartsMap.set(p.partId, (prevPartsMap.get(p.partId) || 0) + (parseInt(String(p.quantity || 1), 10) || 1));
      }
    }

    // Map of partId -> new requested quantity for this device
    const newPartsMap = new Map<string, number>();
    if (Array.isArray(replacedParts)) {
      for (const p of replacedParts) {
        if (p.partId) {
          newPartsMap.set(p.partId, (newPartsMap.get(p.partId) || 0) + (parseInt(String(p.quantity || 1), 10) || 1));
        }
      }
    }

    // Process differential stock updates for each part involved
    const allPartIds = new Set([...prevPartsMap.keys(), ...newPartsMap.keys()]);

    for (const partId of allPartIds) {
      const prevQtyForDevice = prevPartsMap.get(partId) || 0;
      const newQtyForDevice = newPartsMap.get(partId) || 0;
      const netDelta = newQtyForDevice - prevQtyForDevice; // positive = more used, negative = uninstalled/returned

      if (netDelta === 0) {
        // Stock already adjusted accurately on a previous save; do not re-deduct!
        continue;
      }

      try {
        const dbPart = await (prisma as any).sparePart.findUnique({
          where: { id: partId },
        });

        if (dbPart) {
          const prevStock = dbPart.quantity || 0;
          // Deduct netDelta from current stock (if netDelta > 0, stock decreases; if netDelta < 0, stock increases)
          const newStock = Math.max(0, prevStock - netDelta);
          const newUsedCount = Math.max(0, (dbPart.usedCount || 0) + netDelta);

          const existingUsedIn = Array.isArray(dbPart.usedIn) ? [...dbPart.usedIn] : [];
          const existingLogs = Array.isArray(dbPart.stockLogs) ? [...dbPart.stockLogs] : [];

          if (netDelta > 0) {
            // New part units installed in this device
            existingUsedIn.unshift({
              id: `use_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              date: new Date().toISOString(),
              deviceModel: deviceModel,
              orderRef: quoteRef,
              technician: technicianName,
              quantity: netDelta,
              notes: `Installed in ${deviceModel} (#${quoteRef})`,
            });

            existingLogs.unshift({
              id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              date: new Date().toISOString(),
              type: 'REFURB_USE',
              quantity: netDelta,
              previousQuantity: prevStock,
              newQuantity: newStock,
              reason: `Installed in ${deviceModel} (#${quoteRef})`,
              usedForModel: deviceModel,
              orderRef: quoteRef,
              technician: technicianName,
              performedBy: technicianName,
            });
          } else {
            // Part was uninstalled or removed from this device -> Restock back to inventory
            const restockQty = Math.abs(netDelta);
            existingLogs.unshift({
              id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              date: new Date().toISOString(),
              type: 'RESTOCK_UNINSTALLED',
              quantity: restockQty,
              previousQuantity: prevStock,
              newQuantity: newStock,
              reason: `Uninstalled from ${deviceModel} (#${quoteRef}) and returned to inventory stock`,
              usedForModel: deviceModel,
              orderRef: quoteRef,
              technician: technicianName,
              performedBy: technicianName,
            });
          }

          let partStatus = 'IN_STOCK';
          if (newStock <= 0) partStatus = 'OUT_OF_STOCK';
          else if (newStock <= (dbPart.minStockLevel ?? 5)) partStatus = 'LOW_STOCK';

          await (prisma as any).sparePart.update({
            where: { id: partId },
            data: {
              quantity: newStock,
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
    const resolvedSellerName = sellerName || (assignType === 'GROUP' ? sellingGroup : 'Selling Team');

    let resolvedRefurbStatus = 'READY_FOR_SALE';
    let resolvedQuoteStatus = 'ready_for_sale';

    if (refurbStatus === 'SOLD_IN_MARKET' || refurbStatus === 'SOLD' || body.saleDetails || existingRefurbData.saleDetails) {
      resolvedRefurbStatus = 'SOLD_IN_MARKET';
      resolvedQuoteStatus = 'sold';
    } else if (refurbStatus === 'LISTED_ON_STORE' || body.isListedOnApp || existingRefurbData.isListedOnApp) {
      resolvedRefurbStatus = 'LISTED_ON_STORE';
      resolvedQuoteStatus = 'listed_on_app';
    } else if (isUnderRepair) {
      resolvedRefurbStatus = 'IN_REPAIR';
      resolvedQuoteStatus = 'in_repair';
    }

    const refurbPayload = {
      ...existingRefurbData,
      refurbStatus: resolvedRefurbStatus,
      assignedTeam: isUnderRepair ? 'REFURBISH_TEAM' : 'SELLING_TEAM',
      assignedSellerId: isUnderRepair ? null : (sellerId || existingRefurbData.assignedSellerId || null),
      assignedSellerName: isUnderRepair ? null : resolvedSellerName,
      assignedSellingGroup: isUnderRepair ? null : (sellingGroup || existingRefurbData.assignedSellingGroup || 'All Selling Team'),
      assignType: isUnderRepair ? null : assignType,
      assignedAt: isUnderRepair ? null : (existingRefurbData.assignedAt || new Date().toISOString()),
      repairedProblems: repairedProblems.length > 0 ? repairedProblems : (existingRefurbData.repairedProblems || []),
      replacedParts: replacedParts.length > 0 ? replacedParts : (existingRefurbData.replacedParts || []),
      photos8to10: Object.keys(photos8to10).length > 0 ? { ...(existingRefurbData.photos8to10 || {}), ...photos8to10 } : (existingRefurbData.photos8to10 || {}),
      initialBuyingPrice: parseFloat(String(initialBuyingPrice)) || existingRefurbData.initialBuyingPrice || 0,
      partsTotalCost: parseFloat(String(partsTotalCost)) || existingRefurbData.partsTotalCost || 0,
      labourCost: parseFloat(String(labourCost)) || existingRefurbData.labourCost || 0,
      totalRefurbCost: parseFloat(String(totalRefurbCost)) || existingRefurbData.totalRefurbCost || 0,
      finalSellingPrice: parseFloat(String(finalSellingPrice)) || existingRefurbData.finalSellingPrice || 0,
      technicianName: technicianName || existingRefurbData.technicianName || 'Refurbish Team',
      qcChecklist: Object.keys(qcChecklist).length > 0 ? qcChecklist : (existingRefurbData.qcChecklist || {}),
      notes: notes || existingRefurbData.notes || '',
      updatedAt: new Date().toISOString(),
      ...(isUnderRepair ? { inRepairSince: new Date().toISOString() } : { completedAt: new Date().toISOString() }),
    };

    // 3. Update the Quote record in Database
    const updatedQuote = await (prisma as any).quote.update({
      where: { id },
      data: {
        refurbishData: refurbPayload,
        status: resolvedQuoteStatus,
        ...(finalSellingPrice ? { finalPrice: parseFloat(String(finalSellingPrice)) } : {}),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: isUnderRepair
          ? 'Device marked as In Repair!'
          : `Phone refurbished successfully and assigned to ${resolvedSellerName}!`,
        device: updatedQuote,
        refurbishData: refurbPayload,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[POST /api/refurbish/devices/[id]/complete error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to update refurbishment status' },
      { status: 500, headers: corsHeaders }
    );
  }
}

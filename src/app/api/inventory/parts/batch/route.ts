export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-agent-key, *',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items : (Array.isArray(body) ? body : []);

    if (items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No items provided in batch' },
        { status: 400, headers: corsHeaders }
      );
    }

    const savedParts: any[] = [];

    for (const item of items) {
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
      } = item;

      if (!partName || !category) continue;

      const trimmedPartName = String(partName).trim();
      const trimmedCategory = String(category).trim();
      const trimmedSku = sku ? String(sku).trim().toUpperCase() : undefined;
      const trimmedBrand = brand ? String(brand).trim() : undefined;
      const trimmedQualityGrade = qualityGrade ? String(qualityGrade).trim() : undefined;

      let existingTarget: any = null;
      if (trimmedSku) {
        existingTarget = await (prisma as any).sparePart.findFirst({
          where: { sku: trimmedSku },
        });
      }

      if (!existingTarget) {
        existingTarget = await (prisma as any).sparePart.findFirst({
          where: {
            partName: { equals: trimmedPartName, mode: 'insensitive' },
            category: { equals: trimmedCategory, mode: 'insensitive' },
            ...(trimmedBrand ? { brand: { equals: trimmedBrand, mode: 'insensitive' } } : {}),
            ...(trimmedQualityGrade ? { qualityGrade: { equals: trimmedQualityGrade, mode: 'insensitive' } } : {}),
          },
        });
      }

      const qtyNum = parseInt(String(quantity), 10) || 0;
      const minNum = parseInt(String(minStockLevel), 10) || 5;

      if (existingTarget) {
        const prevQty = existingTarget.quantity || 0;
        const newQty = prevQty + qtyNum;

        let computedStatus = 'IN_STOCK';
        if (newQty <= 0) {
          computedStatus = 'OUT_OF_STOCK';
        } else if (newQty <= (minNum || existingTarget.minStockLevel || 5)) {
          computedStatus = 'LOW_STOCK';
        }

        const existingLogs = Array.isArray(existingTarget.stockLogs) ? existingTarget.stockLogs : [];
        const restockLog = {
          id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          date: new Date().toISOString(),
          type: 'STOCK_IN_ADD',
          quantity: qtyNum,
          previousQuantity: prevQty,
          newQuantity: newQty,
          reason: qtyNum > 0 ? `Batch intake (+${qtyNum} units)` : 'Batch details update',
          performedBy: location || 'Admin',
        };

        const incomingModels = Array.isArray(compatibleModels)
          ? compatibleModels.map((m: any) => String(m).trim()).filter(Boolean)
          : String(compatibleModels || '').split(',').map((m: string) => m.trim()).filter(Boolean);
        const currentModels = Array.isArray(existingTarget.compatibleModels) ? existingTarget.compatibleModels : [];
        const mergedModels = Array.from(new Set([...currentModels, ...incomingModels]));

        const incomingImages = Array.isArray(images) ? images : images ? [images] : [];
        const currentImages = Array.isArray(existingTarget.images) ? existingTarget.images : [];
        const mergedImages = Array.from(new Set([...currentImages, ...incomingImages]));

        const updatedPart = await (prisma as any).sparePart.update({
          where: { id: existingTarget.id },
          data: {
            quantity: newQty,
            status: computedStatus,
            minStockLevel: minNum || existingTarget.minStockLevel || 5,
            stockLogs: [restockLog, ...existingLogs],
            compatibleModels: mergedModels,
            images: mergedImages,
            ...(costPrice ? { costPrice: parseFloat(String(costPrice)) || existingTarget.costPrice } : {}),
            ...(sellingPrice ? { sellingPrice: parseFloat(String(sellingPrice)) || existingTarget.sellingPrice } : {}),
            ...(mrp ? { mrp: parseFloat(String(mrp)) || existingTarget.mrp } : {}),
            ...(location ? { location: String(location).trim() } : {}),
            ...(supplier ? { supplier: String(supplier).trim() } : {}),
            ...(notes ? { notes: String(notes).trim() } : {}),
          },
        });

        savedParts.push(updatedPart);
      } else {
        let computedStatus = 'IN_STOCK';
        if (qtyNum <= 0) computedStatus = 'OUT_OF_STOCK';
        else if (qtyNum <= minNum) computedStatus = 'LOW_STOCK';

        const initialLog = {
          id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          date: new Date().toISOString(),
          type: 'INITIAL_ENTRY',
          quantity: qtyNum,
          previousQuantity: 0,
          newQuantity: qtyNum,
          reason: 'Initial part inventory setup via batch',
          performedBy: location || 'Admin',
        };

        const newPart = await (prisma as any).sparePart.create({
          data: {
            partName: trimmedPartName,
            sku: trimmedSku,
            category: trimmedCategory,
            brand: trimmedBrand,
            compatibleModels: Array.isArray(compatibleModels)
              ? compatibleModels.map((m: any) => String(m).trim()).filter(Boolean)
              : String(compatibleModels || '').split(',').map((m: string) => m.trim()).filter(Boolean),
            qualityGrade: trimmedQualityGrade,
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

        savedParts.push(newPart);
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: `Successfully processed ${savedParts.length} parts in batch`,
        parts: savedParts,
        count: savedParts.length,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[POST /api/inventory/parts/batch error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to process batch parts' },
      { status: 500, headers: corsHeaders }
    );
  }
}

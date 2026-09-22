export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-role, x-user-role',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// POST: Refurbish team assigns one or multiple devices to selling team individually or by group
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      deviceIds = [],
      deviceId, // fallback single
      assignType = 'INDIVIDUAL', // 'INDIVIDUAL' or 'GROUP'
      sellerId,
      sellerName,
      sellingGroup = 'Main Selling Team',
      targetSellingPrice,
      notes = '',
    } = body;

    const idsToAssign = Array.isArray(deviceIds) && deviceIds.length > 0
      ? deviceIds
      : deviceId
      ? [deviceId]
      : [];

    if (idsToAssign.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one device ID is required for assignment' },
        { status: 400, headers: corsHeaders }
      );
    }

    const assignedAt = new Date().toISOString();
    const resolvedSellerName = sellerName || (assignType === 'GROUP' ? sellingGroup : 'Selling Team');

    // Update quotes in batch or individually
    const updatedDevices = [];
    for (const id of idsToAssign) {
      const quote = await (prisma as any).quote.findUnique({
        where: { id },
      });

      if (!quote) continue;

      const existingRefurbData = (quote.refurbishData as any) || {};

      const newRefurbData = {
        ...existingRefurbData,
        refurbStatus: 'READY_FOR_SALE',
        assignedTeam: 'SELLING_TEAM',
        assignType,
        assignedSellerId: sellerId || null,
        assignedSellerName: resolvedSellerName,
        assignedSellingGroup: sellingGroup || 'Main Selling Team',
        assignedAt,
        assignmentNotes: notes || existingRefurbData.assignmentNotes || '',
      };

      const updatePayload: any = {
        refurbishData: newRefurbData,
        status: 'ready_for_sale',
        updatedAt: new Date(),
      };

      if (targetSellingPrice !== undefined && !isNaN(Number(targetSellingPrice)) && Number(targetSellingPrice) > 0) {
        updatePayload.finalPrice = Number(targetSellingPrice);
      }

      const updated = await (prisma as any).quote.update({
        where: { id },
        data: updatePayload,
      });

      updatedDevices.push({
        id: updated.id,
        quoteNumber: updated.quoteNumber,
        model: updated.model,
        assignedSellerName: resolvedSellerName,
        assignedSellingGroup: sellingGroup,
      });
    }

    return NextResponse.json(
      {
        success: true,
        message: `Successfully assigned ${updatedDevices.length} device(s) to Selling Team (${resolvedSellerName})!`,
        count: updatedDevices.length,
        devices: updatedDevices,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[POST /api/refurbish/devices/assign error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to assign devices to Selling Team' },
      { status: 500, headers: corsHeaders }
    );
  }
}

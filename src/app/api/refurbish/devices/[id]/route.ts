export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-role',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// GET: Single device intake details + spare parts suggestions
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const roleHeader = req.headers.get('x-role') || '';
    const isRefurbRole = roleHeader.toUpperCase().includes('REFURBISH');

    const quote = await (prisma as any).quote.findUnique({
      where: { id },
    });

    if (!quote) {
      return NextResponse.json(
        { success: false, error: 'Quote intake record not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const conditionAnswers = quote.conditionAnswers || {};
    const breakdown = quote.breakdown || {};
    const subDevices = breakdown.devices || conditionAnswers.devices || [];
    const deviceModel = quote.model || (subDevices[0]?.model) || '';

    // Fetch compatible spare parts from parts inventory for quick picker
    let compatibleParts = [];
    try {
      compatibleParts = await (prisma as any).sparePart.findMany({
        where: {
          quantity: { gt: 0 },
          ...(deviceModel ? {
            OR: [
              { compatibleModels: { has: deviceModel } },
              { partName: { contains: deviceModel, mode: 'insensitive' } },
            ]
          } : {})
        },
        take: 30,
      });

      if (compatibleParts.length === 0) {
        compatibleParts = await (prisma as any).sparePart.findMany({
          where: { quantity: { gt: 0 } },
          take: 30,
        });
      }
    } catch (e) {
      // Non-blocking fallback
    }

    const deviceData: any = {
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      model: quote.model || subDevices[0]?.model || 'Smartphone',
      brand: quote.brand || 'Brand',
      storage: quote.storage || subDevices[0]?.storage || '',
      ram: subDevices[0]?.ram || '',
      imei: quote.imeiNumber || quote.imei || subDevices[0]?.imei || 'N/A',
      initialBuyingPrice: quote.finalPrice || quote.estimatedPrice || breakdown.totalAmount || 0,
      pickupDate: quote.pickupDate || quote.createdAt,
      defects: subDevices[0]?.defects || [],
      accessories: subDevices[0]?.accessories || { bill: false, box: false, charger: false },
      lockStatus: subDevices[0]?.lockStatus || 'Unlocked',
      photos6Sides: subDevices[0]?.photos6Sides || {},
      intakeImages: quote.images || [],
      refurbishData: quote.refurbishData || null,
      refurbStatus: quote.refurbishData?.refurbStatus || 'PENDING_INSPECTION',
      compatibleParts,
    };

    if (!isRefurbRole) {
      deviceData.customerName = quote.customerName;
      deviceData.contactNumber = quote.contactNumber;
      deviceData.customerAddress = quote.customerAddress;
    }

    return NextResponse.json({ success: true, device: deviceData }, { headers: corsHeaders });
  } catch (error: any) {
    console.error('[GET /api/refurbish/devices/[id] error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch device details' },
      { status: 500, headers: corsHeaders }
    );
  }
}

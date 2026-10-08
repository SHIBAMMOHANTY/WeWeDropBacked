export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
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

    const rawAccessories = subDevices[0]?.accessories || { bill: false, box: false, charger: false };
    const accessoryPhotos = {
      bill: subDevices[0]?.accessories?.billPhoto || subDevices[0]?.billPhoto || quote.billPhoto || quote.billImage || null,
      box: subDevices[0]?.accessories?.boxPhoto || subDevices[0]?.boxPhoto || quote.boxPhoto || quote.boxImage || null,
      charger: subDevices[0]?.accessories?.chargerPhoto || subDevices[0]?.chargerPhoto || quote.chargerPhoto || quote.chargerImage || null,
      ceirScreenshot: subDevices[0]?.ceirScreenshot || quote.ceirScreenshot || null,
    };

    const refurbData = quote.refurbishData || {};
    const photos6Sides = subDevices[0]?.photos6Sides || {};
    const photos8to10 = refurbData.photos8to10 || {};

    const rawDeviceImages = [
      ...(Array.isArray(quote.images) ? quote.images : (quote.images ? [quote.images] : [])),
      ...(quote.image ? [quote.image] : []),
      ...(quote.deviceImage ? [quote.deviceImage] : []),
      ...Object.values(photos8to10),
      ...Object.values(photos6Sides),
      ...Object.values(accessoryPhotos),
      ...(Array.isArray(refurbData.images) ? refurbData.images : (refurbData.images ? [refurbData.images] : [])),
    ].filter((img: any) => typeof img === 'string' && img.trim().length > 0);

    const uniqueImages = Array.from(new Set(rawDeviceImages));

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
      accessories: {
        bill: Boolean(rawAccessories.bill || accessoryPhotos.bill),
        box: Boolean(rawAccessories.box || accessoryPhotos.box),
        charger: Boolean(rawAccessories.charger || accessoryPhotos.charger),
        billPhoto: accessoryPhotos.bill,
        boxPhoto: accessoryPhotos.box,
        chargerPhoto: accessoryPhotos.charger,
      },
      accessoryPhotos,
      lockStatus: subDevices[0]?.lockStatus || 'Unlocked',
      photos6Sides,
      photos8to10,
      images: uniqueImages,
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

// DELETE: Delete device intake quote record
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);

    const existing = await (prisma as any).quote.findFirst({
      where: isObjectId
        ? { OR: [{ id }, { quoteNumber: id }] }
        : { quoteNumber: id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Device record not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    await (prisma as any).quote.delete({
      where: { id: existing.id },
    });

    return NextResponse.json(
      { success: true, message: 'Device deleted successfully' },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[DELETE /api/refurbish/devices/[id] error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to delete device' },
      { status: 500, headers: corsHeaders }
    );
  }
}


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// GET: Fetch ONLY devices that have been assigned to SELLING_TEAM by Refurbish Team
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const search = url.searchParams.get('search')?.trim() || '';
    const statusTab = url.searchParams.get('status')?.trim() || 'ALL'; // ALL, READY, LISTED, SOLD
    const sellerId = url.searchParams.get('sellerId')?.trim() || '';
    const channel = url.searchParams.get('channel')?.trim() || '';
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const skip = (page - 1) * limit;

    // Strict rule: ONLY devices assigned to SELLING_TEAM or with status ready_for_sale / listed_on_app / sold
    const where: any = {
      status: { in: ['ready_for_sale', 'listed_on_app', 'sold'] },
    };

    if (search) {
      where.AND = [
        {
          OR: [
            { model: { contains: search, mode: 'insensitive' } },
            { brand: { contains: search, mode: 'insensitive' } },
            { quoteNumber: { contains: search, mode: 'insensitive' } },
            { imeiNumber: { contains: search, mode: 'insensitive' } },
            { imei: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const allQuotes = await (prisma as any).quote.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });

    const formattedDevices = allQuotes.map((q: any) => {
      const breakdown = q.breakdown || {};
      const conditionAnswers = q.conditionAnswers || {};
      const subDevices = breakdown.devices || conditionAnswers.devices || [];
      const rd = q.refurbishData || {};

      const baseCost = Number(q.finalPrice || q.estimatedPrice || breakdown.totalAmount || 0);
      const partsCost = Number(rd.partsTotalCost || 0);
      const labourCost = Number(rd.labourCost || 300);
      const totalCost = baseCost + partsCost + labourCost;
      const sellingPrice = Number(rd.finalSellingPrice || q.finalPrice || (totalCost + 1500));

      let sellStatus = 'READY';
      if (q.status === 'sold' || rd.saleDetails?.soldAt) {
        sellStatus = 'SOLD';
      } else if (q.status === 'listed_on_app' || rd.isListedOnApp || q.listingId) {
        sellStatus = 'LISTED';
      } else {
        sellStatus = 'READY';
      }

      return {
        id: q.id,
        quoteId: q.id,
        quoteNumber: q.quoteNumber,
        listingId: q.listingId || rd.listingId || null,
        model: q.model || (subDevices[0]?.model) || 'Smartphone',
        brand: q.brand || 'Device',
        storage: q.storage || (subDevices[0]?.storage) || '128GB',
        ram: (subDevices[0]?.ram) || '6GB',
        imei: q.imeiNumber || q.imei || (subDevices[0]?.imei) || 'N/A',
        condition: q.condition || 'GOOD',
        baseCost,
        partsCost,
        labourCost,
        totalCost,
        sellingPrice,
        mrpPrice: Math.round(sellingPrice * 1.3),
        sellStatus,
        sellingChannel: rd.sellingChannel || (sellStatus === 'LISTED' ? 'APP' : 'RETAIL'),
        warranty: rd.warranty || '6 Months Warranty',
        assignedSellerId: rd.assignedSellerId || null,
        assignedSellerName: rd.assignedSellerName || (rd.assignedTeam === 'SELLING_TEAM' ? 'Selling Team' : 'General Pool'),
        assignedSellingGroup: rd.assignedSellingGroup || 'Main Selling Team',
        assignedAt: rd.assignedAt || q.updatedAt,
        refurbishData: rd,
        saleDetails: rd.saleDetails || null,
        images: (() => {
        const raw = [
          ...(Array.isArray(q.images) ? q.images : (q.images ? [q.images] : [])),
          ...(q.image ? [q.image] : []),
          ...(q.deviceImage ? [q.deviceImage] : []),
          ...(Array.isArray(q.conditionAnswers?.photos) ? q.conditionAnswers.photos : (q.conditionAnswers?.photos ? [q.conditionAnswers.photos] : [])),
          ...(Array.isArray(q.conditionAnswers?.images) ? q.conditionAnswers.images : (q.conditionAnswers?.images ? [q.conditionAnswers.images] : [])),
          ...(rd?.photos8to10 ? Object.values(rd.photos8to10).filter(Boolean) : []),
          ...(Array.isArray(rd?.images) ? rd.images : (rd?.images ? [rd.images] : [])),
        ].filter(Boolean);
        return Array.from(new Set(raw));
      })(),
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
      };
    });

    let filtered = formattedDevices;

    if (statusTab !== 'ALL') {
      filtered = filtered.filter((d: any) => d.sellStatus === statusTab);
    }

    if (sellerId && sellerId !== 'ALL') {
      filtered = filtered.filter((d: any) => d.assignedSellerId === sellerId);
    }

    if (channel && channel !== 'ALL') {
      filtered = filtered.filter((d: any) => d.sellingChannel === channel);
    }

    // Stats
    const totalValuation = formattedDevices.reduce((sum: number, d: any) => sum + (d.sellingPrice || 0), 0);
    const totalProfit = formattedDevices
      .filter((d: any) => d.sellStatus === 'SOLD')
      .reduce((sum: number, d: any) => sum + ((d.saleDetails?.soldPrice || d.sellingPrice) - d.totalCost), 0);

    const stats = {
      totalForSale: formattedDevices.length,
      readyToPublish: formattedDevices.filter((d: any) => d.sellStatus === 'READY').length,
      listedOnApp: formattedDevices.filter((d: any) => d.sellStatus === 'LISTED').length,
      soldInMarket: formattedDevices.filter((d: any) => d.sellStatus === 'SOLD').length,
      totalValuation: Math.round(totalValuation),
      totalProfit: Math.round(totalProfit),
    };

    const paginated = filtered.slice(skip, skip + limit);

    return NextResponse.json(
      {
        success: true,
        devices: paginated,
        total: filtered.length,
        stats,
        page,
        limit,
        totalPages: Math.ceil(filtered.length / limit) || 1,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[GET /api/selling/devices error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch selling devices' },
      { status: 500, headers: corsHeaders }
    );
  }
}

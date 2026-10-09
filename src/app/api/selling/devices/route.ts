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

// GET: Fetch devices ready for sale, listed on app, or sold (Sales History)
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const search = url.searchParams.get('search')?.trim() || '';
    const statusTab = url.searchParams.get('status')?.trim() || 'ALL'; // ALL, READY, LISTED, SOLD
    const sellerId = url.searchParams.get('sellerId')?.trim() || '';
    const channel = url.searchParams.get('channel')?.trim() || '';
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);
    const skip = (page - 1) * limit;

    const where: any = {
      OR: [
        { status: { in: ['ready_for_sale', 'READY_FOR_SALE', 'listed_on_app', 'LISTED_ON_APP', 'sold', 'SOLD', 'SOLD_IN_MARKET', 'LISTED_ON_STORE', 'completed', 'COMPLETED'] } },
        { refurbishData: { isSet: true } },
      ],
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

    const formattedDevices = allQuotes
      .map((q: any) => {
        const breakdown = q.breakdown || {};
        const conditionAnswers = q.conditionAnswers || {};
        const subDevices = breakdown.devices || conditionAnswers.devices || [];
        const rd = q.refurbishData || {};

        // Skip deleted or cancelled devices
        if (q.isDeleted || q.deletedAt || q.status === 'deleted' || q.status === 'cancelled') {
          return null;
        }

        // Skip devices that are explicitly in repair with no selling assignment or sale details
        if (
          (q.status === 'in_repair' || rd.refurbStatus === 'IN_REPAIR') &&
          !rd.saleDetails &&
          !rd.isListedOnApp &&
          q.status !== 'ready_for_sale' &&
          q.status !== 'listed_on_app' &&
          q.status !== 'sold'
        ) {
          return null;
        }

        const baseCost = Number(q.finalPrice || q.estimatedPrice || breakdown.totalAmount || 0);
        const partsCost = Number(rd.partsTotalCost || 0);
        const labourCost = Number(rd.labourCost || 300);
        const totalCost = baseCost + partsCost + labourCost;
        const sellingPrice = Number(rd.finalSellingPrice || q.finalPrice || (totalCost + 1500));

        const isSoldStatus = (
          q.status === 'sold' ||
          q.status === 'SOLD' ||
          q.status === 'SOLD_IN_MARKET' ||
          rd.refurbStatus === 'SOLD' ||
          rd.refurbStatus === 'SOLD_IN_MARKET' ||
          Boolean(rd.saleDetails?.soldAt)
        );

        const isListedStatus = (
          q.status === 'listed_on_app' ||
          q.status === 'LISTED_ON_STORE' ||
          q.status === 'LISTED' ||
          rd.refurbStatus === 'LISTED_ON_STORE' ||
          rd.isListedOnApp === true ||
          Boolean(q.listingId)
        );

        let sellStatus = 'READY';
        if (isSoldStatus) {
          sellStatus = 'SOLD';
        } else if (isListedStatus) {
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
          sellingChannel: rd.saleDetails?.saleChannel || rd.sellingChannel || (sellStatus === 'LISTED' ? 'APP' : 'RETAIL'),
          warranty: rd.warranty || '6 Months Warranty',
          assignedSellerId: rd.assignedSellerId || null,
          assignedSellerName: rd.assignedSellerName || (rd.assignedTeam === 'SELLING_TEAM' ? 'Selling Team' : 'General Pool'),
          assignedSellingGroup: rd.assignedSellingGroup || 'Main Selling Team',
          assignedAt: rd.assignedAt || q.updatedAt,
          refurbishData: rd,
          saleDetails: rd.saleDetails || null,
          soldAt: rd.saleDetails?.soldAt || (isSoldStatus ? q.updatedAt : null),
          soldPrice: rd.saleDetails?.soldPrice || sellingPrice,
          soldToName: rd.saleDetails?.soldToName || (isSoldStatus ? 'Customer / Buyer' : null),
          soldToPhone: rd.saleDetails?.soldToPhone || null,
          paymentMode: rd.saleDetails?.paymentMode || 'UPI',
          invoiceNumber: rd.saleDetails?.invoiceNumber || null,
          grossProfit: rd.saleDetails?.grossProfit || (sellingPrice - totalCost),
          images: (() => {
            const kycImages = new Set([
              q.idProofFront,
              q.idProofBack,
              conditionAnswers.idProofFront,
              conditionAnswers.idProofBack,
              subDevices[0]?.customer?.idFront,
              subDevices[0]?.customer?.idBack,
              subDevices[0]?.idProofFront,
              subDevices[0]?.idProofBack,
            ].filter(Boolean));

            const raw = [
              ...(Array.isArray(q.images) ? q.images : (q.images ? [q.images] : [])),
              ...(q.image ? [q.image] : []),
              ...(q.deviceImage ? [q.deviceImage] : []),
              ...(rd?.photos8to10 ? Object.values(rd.photos8to10) : []),
              ...(subDevices[0]?.photos6Sides ? Object.values(subDevices[0].photos6Sides) : []),
              ...(Array.isArray(rd?.images) ? rd.images : (rd?.images ? [rd.images] : [])),
            ].filter((img: any) => typeof img === 'string' && img.trim().length > 0 && !kycImages.has(img));

            return Array.from(new Set(raw));
          })(),
          createdAt: q.createdAt,
          updatedAt: q.updatedAt,
        };
      })
      .filter(Boolean);

    let filtered = formattedDevices;

    if (sellerId && sellerId !== 'ALL') {
      const sId = sellerId.trim();
      const sName = (url.searchParams.get('sellerName') || '').trim().toLowerCase();
      const sStaff = (url.searchParams.get('staffId') || '').trim();
      const sGroup = (url.searchParams.get('sellingGroup') || '').trim().toLowerCase();

      filtered = filtered.filter((d: any) => {
        const assignedId = d.assignedSellerId;
        const assignedName = (d.assignedSellerName || '').trim().toLowerCase();
        const assignedGroup = (d.assignedSellingGroup || '').trim().toLowerCase();

        // 1. Direct match on Seller ID or Staff ID
        if (assignedId && (assignedId === sId || (sStaff && assignedId === sStaff))) {
          return true;
        }

        // 2. Direct match on Seller Name
        if (
          assignedName &&
          assignedName !== 'selling team' &&
          assignedName !== 'general pool' &&
          assignedName !== 'all selling team'
        ) {
          return sName && (assignedName === sName || assignedName === sId.toLowerCase());
        }

        // 3. Match on Selling Group
        if (
          assignedGroup &&
          assignedGroup !== 'all selling team' &&
          assignedGroup !== 'main selling team'
        ) {
          return sGroup && assignedGroup === sGroup;
        }

        // 4. General unassigned pool
        return true;
      });
    }

    if (statusTab !== 'ALL') {
      filtered = filtered.filter((d: any) => d.sellStatus === statusTab);
    }

    if (channel && channel !== 'ALL') {
      filtered = filtered.filter((d: any) => d.sellingChannel === channel);
    }

    // Stats based on filtered assigned scope
    const totalValuation = filtered.reduce((sum: number, d: any) => sum + (d.sellingPrice || 0), 0);
    const totalProfit = filtered
      .filter((d: any) => d.sellStatus === 'SOLD')
      .reduce((sum: number, d: any) => sum + ((d.saleDetails?.soldPrice || d.sellingPrice) - d.totalCost), 0);

    const stats = {
      totalForSale: filtered.length,
      readyToPublish: filtered.filter((d: any) => d.sellStatus === 'READY').length,
      listedOnApp: filtered.filter((d: any) => d.sellStatus === 'LISTED').length,
      soldInMarket: filtered.filter((d: any) => d.sellStatus === 'SOLD').length,
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

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

// GET: Fetch received intake phones for Refurbishment Team
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const roleHeader = req.headers.get('x-role') || req.headers.get('x-user-role') || url.searchParams.get('role') || '';
    const isRefurbRole = roleHeader.toUpperCase().includes('REFURBISH');
    const search = url.searchParams.get('search')?.trim() || '';
    const statusFilter = url.searchParams.get('status')?.trim() || 'ALL'; // PENDING, IN_REPAIR, READY_FOR_SALE, ALL
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const skip = (page - 1) * limit;

    const where: any = {};

        // Filter ONLY devices whose pickup / payment / intake is completed
    where.OR = [
      { status: { in: ['pickup_successful', 'pickup_completed', 'payment_completed', 'paid', 'picked_up', 'in_repair', 'ready_for_sale', 'refurbishing', 'refurbished'] } },
      { diagnosisCompleted: true, status: { not: 'rejected' } }
    ];

    if (search) {
      where.OR = [
        { model: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { quoteNumber: { contains: search, mode: 'insensitive' } },
        { imeiNumber: { contains: search, mode: 'insensitive' } },
        { imei: { contains: search, mode: 'insensitive' } },
      ];
    }

    const allQuotes = await (prisma as any).quote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    const totalCount = await (prisma as any).quote.count({ where });

    // Format devices & apply privacy mask for Refurbish Team
    const formattedDevices = allQuotes.map((q: any) => {
      const conditionAnswers = q.conditionAnswers || {};
      const breakdown = q.breakdown || {};
      const refurbData = q.refurbishData || {};

      // Calculate initial buying price from quote
      const initialPrice = q.finalPrice || q.estimatedPrice || breakdown.totalAmount || 0;

      // Extract device breakdown if multi-device intake
      const subDevices = breakdown.devices || conditionAnswers.devices || [];

      // Determine refurb status
      const refurbStatus = refurbData.refurbStatus || (q.status === 'ready_for_sale' ? 'READY_FOR_SALE' : q.status === 'in_repair' ? 'IN_REPAIR' : 'PENDING_INSPECTION');

      const item: any = {
        id: q.id,
        quoteId: q.id,
        quoteNumber: q.quoteNumber,
        model: q.model || (subDevices[0]?.model) || 'Smartphone',
        brand: q.brand || 'Device',
        storage: q.storage || (subDevices[0]?.storage) || '',
        ram: (subDevices[0]?.ram) || '',
        imei: q.imeiNumber || q.imei || (subDevices[0]?.imei) || 'N/A',
        initialBuyingPrice: initialPrice,
        pickupDate: q.pickupDate || q.createdAt,
        createdAt: q.createdAt,
        intakeStatus: q.status,
        refurbStatus,
        refurbishData: q.refurbishData || null,
        assignedSellerId: refurbData.assignedSellerId || null,
        assignedSellerName: refurbData.assignedSellerName || (refurbData.assignedTeam === 'SELLING_TEAM' ? 'Selling Team' : null),
        assignedSellingGroup: refurbData.assignedSellingGroup || null,
        assignedAt: refurbData.assignedAt || null,
        defects: subDevices[0]?.defects || (q.screenCracked ? ['Screen Cracked'] : []) || [],
        accessories: subDevices[0]?.accessories || { bill: false, box: false, charger: false },
        lockStatus: subDevices[0]?.lockStatus || 'Unlocked',
        photos6Sides: subDevices[0]?.photos6Sides || {},
        images: q.images || [],
        totalDevices: breakdown.totalDevices || subDevices.length || 1,
        subDevices: subDevices,
      };

      // STRICT PRIVACY RULE: If caller is REFURBISH_TEAM, do NOT return customer contact details!
      if (!isRefurbRole) {
        item.customerName = q.customerName;
        item.contactNumber = q.contactNumber;
        item.customerAddress = q.customerAddress;
      }

      return item;
    });

    // Apply tab filter if needed
    let filteredList = formattedDevices;
    if (statusFilter !== 'ALL') {
      filteredList = formattedDevices.filter((d: any) => d.refurbStatus === statusFilter);
    }

    // Aggregated stats
    const stats = {
      totalReceived: formattedDevices.length,
      pendingInspection: formattedDevices.filter((d: any) => d.refurbStatus === 'PENDING_INSPECTION').length,
      inRepair: formattedDevices.filter((d: any) => d.refurbStatus === 'IN_REPAIR').length,
      readyForSale: formattedDevices.filter((d: any) => d.refurbStatus === 'READY_FOR_SALE').length,
    };

    return NextResponse.json(
      {
        success: true,
        devices: filteredList,
        total: totalCount,
        stats,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[GET /api/refurbish/devices error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch received phones' },
      { status: 500, headers: corsHeaders }
    );
  }
}

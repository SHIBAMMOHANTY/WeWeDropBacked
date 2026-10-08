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

// GET: Fetch received intake phones for Refurbishment Team (ONLY completed pickups)
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const roleHeader = req.headers.get('x-role') || req.headers.get('x-user-role') || url.searchParams.get('role') || '';
    const userId = req.headers.get('x-user-id') || url.searchParams.get('userId') || url.searchParams.get('memberId') || '';
    const assignedMemberFilter = url.searchParams.get('assignedMemberId')?.trim() || '';
    const isRefurbRole = roleHeader.toUpperCase().includes('REFURBISH');
    const search = url.searchParams.get('search')?.trim() || '';
    const statusFilter = url.searchParams.get('status')?.trim() || 'ALL'; // PENDING_INSPECTION, IN_REPAIR, READY_FOR_SALE, ALL
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const skip = (page - 1) * limit;

    // Strict rule: ONLY devices where physical pickup & payment is completed (support both uppercase and lowercase)
    const validStatuses = [
      'pickup_successful',
      'pickup_completed',
      'payment_completed',
      'paid',
      'picked_up',
      'in_repair',
      'repairing',
      'ready_for_sale',
      'refurbishing',
      'refurbished',
      'sold',
      'listed_on_app',
      'PICKUP_SUCCESSFUL',
      'PICKUP_COMPLETED',
      'PAYMENT_COMPLETED',
      'PAID',
      'PICKED_UP',
      'IN_REPAIR',
      'REPAIRING',
      'READY_FOR_SALE',
      'REFURBISHING',
      'REFURBISHED',
      'SOLD',
      'LISTED_ON_APP'
    ];

    const where: any = {
      status: {
        in: validStatuses,
      },
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

    // Format devices & apply privacy mask for Refurbish Team
    const formattedDevices = allQuotes.map((q: any) => {
      const conditionAnswers = q.conditionAnswers || {};
      const breakdown = q.breakdown || {};
      const refurbData = q.refurbishData || {};

      const subDevices = breakdown.devices || conditionAnswers.devices || [];
      const initialPrice = Number(
        refurbData.initialBuyingPrice ||
        subDevices[0]?.buyingPrice ||
        breakdown.totalAmount ||
        q.estimatedPrice ||
        q.finalPrice ||
        0
      );

      // Determine refurb status accurately (case-insensitive check)
      const statusUpper = String(q.status || '').toUpperCase();
      const refurbStatusUpper = String(refurbData.refurbStatus || '').toUpperCase();

      let refurbStatus = 'PENDING_INSPECTION';
      if (statusUpper === 'READY_FOR_SALE' || refurbStatusUpper === 'READY_FOR_SALE') {
        refurbStatus = 'READY_FOR_SALE';
      } else if (
        statusUpper === 'IN_REPAIR' ||
        statusUpper === 'REPAIRING' ||
        statusUpper === 'REFURBISHING' ||
        refurbStatusUpper === 'IN_REPAIR' ||
        refurbStatusUpper === 'REPAIRING'
      ) {
        refurbStatus = 'IN_REPAIR';
      } else if (refurbData.refurbStatus) {
        refurbStatus = refurbData.refurbStatus;
      }

      // Collect known KYC ID photos to exclude them from device catalog images
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

      const rawAccessories = subDevices[0]?.accessories || { bill: false, box: false, charger: false };
      const accessoryPhotos = {
        bill: subDevices[0]?.accessories?.billPhoto || subDevices[0]?.billPhoto || q.billPhoto || q.billImage || null,
        box: subDevices[0]?.accessories?.boxPhoto || subDevices[0]?.boxPhoto || q.boxPhoto || q.boxImage || null,
        charger: subDevices[0]?.accessories?.chargerPhoto || subDevices[0]?.chargerPhoto || q.chargerPhoto || q.chargerImage || null,
        ceirScreenshot: subDevices[0]?.ceirScreenshot || q.ceirScreenshot || null,
      };

      const rawDeviceImages = [
        ...(Array.isArray(q.images) ? q.images : (q.images ? [q.images] : [])),
        ...(q.image ? [q.image] : []),
        ...(q.deviceImage ? [q.deviceImage] : []),
        ...(refurbData?.photos8to10 ? Object.values(refurbData.photos8to10) : []),
        ...(subDevices[0]?.photos6Sides ? Object.values(subDevices[0].photos6Sides) : []),
        ...Object.values(accessoryPhotos),
        ...(Array.isArray(refurbData?.images) ? refurbData.images : (refurbData?.images ? [refurbData.images] : [])),
      ].filter((img: any) => typeof img === 'string' && img.trim().length > 0 && !kycImages.has(img));

      const uniqueImages = Array.from(new Set(rawDeviceImages));

      // Clean redundant flat customer fields from subDevices
      const cleanedSubDevices = subDevices.map((sd: any) => {
        if (!sd || typeof sd !== 'object') return sd;
        const { customerName, customerPhone, customerAddress, idProofType, idProofNumber, idProofFront, idProofBack, ...rest } = sd;
        return {
          ...rest,
          customer: sd.customer || {
            name: customerName,
            phone: customerPhone,
            address: customerAddress,
            idType: idProofType,
            idNumber: idProofNumber,
            idFront: idProofFront,
            idBack: idProofBack,
          },
        };
      });

      const item: any = {
        id: q.id,
        quoteId: q.id,
        quoteNumber: q.quoteNumber,
        model: q.model || (subDevices[0]?.model) || 'Smartphone',
        brand: q.brand || 'Device',
        storage: q.storage || (subDevices[0]?.storage) || '128GB',
        ram: (subDevices[0]?.ram) || '6GB',
        imei: q.imeiNumber || q.imei || (subDevices[0]?.imei) || 'N/A',
        initialBuyingPrice: initialPrice,
        pickupDate: q.pickupDate || q.createdAt,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
        intakeStatus: q.status,
        refurbStatus,
        refurbishData: q.refurbishData || null,
        // Refurbish technician assignment details
        assignedMemberId: refurbData.assignedMemberId || null,
        assignedMemberName: refurbData.assignedMemberName || null,
        assignedMemberPhone: refurbData.assignedMemberPhone || null,
        assignedMemberAt: refurbData.assignedMemberAt || null,
        // Selling team assignment details
        assignedSellerId: refurbData.assignedSellerId || null,
        assignedSellerName: refurbData.assignedSellerName || (refurbData.assignedTeam === 'SELLING_TEAM' ? 'Selling Team' : null),
        assignedSellingGroup: refurbData.assignedSellingGroup || null,
        assignedAt: refurbData.assignedAt || null,
        defects: subDevices[0]?.defects || (q.screenCracked ? ['Screen Cracked'] : []) || [],
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
        photos6Sides: subDevices[0]?.photos6Sides || {},
        photos8to10: refurbData?.photos8to10 || {},
        images: uniqueImages,
        totalDevices: breakdown.totalDevices || subDevices.length || 1,
        subDevices: cleanedSubDevices,
      };

      if (!isRefurbRole) {
        item.customerName = q.customerName;
        item.contactNumber = q.contactNumber;
        item.customerAddress = q.customerAddress;
      }

      return item;
    });

    // Filtering logic:
    // 1. If requester is a REFURBISH_TEAM member (technician), ONLY show devices assigned to their specific userId!
    let memberFilteredDevices = formattedDevices;
    if (isRefurbRole) {
      if (userId) {
        const uidStr = String(userId).trim();
        memberFilteredDevices = formattedDevices.filter((d: any) => {
          const mId = d.assignedMemberId ? String(d.assignedMemberId).trim() : '';
          const tId = d.refurbishData?.technicianId ? String(d.refurbishData.technicianId).trim() : '';
          return mId === uidStr || tId === uidStr;
        });
      } else {
        memberFilteredDevices = [];
      }
    } else if (assignedMemberFilter) {
      if (assignedMemberFilter === 'UNASSIGNED') {
        memberFilteredDevices = formattedDevices.filter((d: any) => !d.assignedMemberId);
      } else if (assignedMemberFilter !== 'ALL') {
        memberFilteredDevices = formattedDevices.filter((d: any) => d.assignedMemberId === assignedMemberFilter);
      }
    }

    // Calculate stats strictly on memberFilteredDevices (so if not assigned to this member, stats are 0!)
    const stats = {
      totalReceived: memberFilteredDevices.length,
      pendingInspection: memberFilteredDevices.filter((d: any) => d.refurbStatus === 'PENDING_INSPECTION').length,
      inRepair: memberFilteredDevices.filter((d: any) => d.refurbStatus === 'IN_REPAIR').length,
      readyForSale: memberFilteredDevices.filter((d: any) => d.refurbStatus === 'READY_FOR_SALE').length,
    };

    let filteredList = memberFilteredDevices;
    if (statusFilter !== 'ALL') {
      filteredList = filteredList.filter((d: any) => d.refurbStatus === statusFilter);
    }

    const paginated = filteredList.slice(skip, skip + limit);

    return NextResponse.json(
      {
        success: true,
        devices: paginated,
        total: filteredList.length,
        stats,
        page,
        limit,
        totalPages: Math.ceil(filteredList.length / limit) || 1,
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

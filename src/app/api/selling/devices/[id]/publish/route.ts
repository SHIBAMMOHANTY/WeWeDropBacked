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

// POST: Publish or Update a refurbished device to the public store catalog (No Duplicates)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const {
      sellingPrice,
      mrpPrice,
      warranty = '6 Months Warranty',
      sellingChannel = 'APP',
      description = '',
      specifications = [],
      photos = [],
      phoneName,
      phoneModel,
      phoneStorage,
      phoneRam,
      phoneColor,
      imeiNumber,
      checklist = {},
      accessories = [],
      gift,
      purchaseDate,
      billImage,
      financeKitAvailable = true,
      isUpdate = false,
    } = body;

    const quote = await (prisma as any).quote.findUnique({
      where: { id },
    });

    if (!quote) {
      return NextResponse.json({ success: false, error: 'Device record not found' }, { status: 404, headers: corsHeaders });
    }

    const rd = quote.refurbishData || {};
    const finalPriceVal = Number(sellingPrice) || Number(rd.finalSellingPrice) || Number(quote.finalPrice) || 9999;
    const mrpPriceVal = Number(mrpPrice) || Math.round(finalPriceVal * 1.3);

    // Collect device photos
    let deviceImages: string[] = [];
    if (Array.isArray(photos) && photos.length > 0) {
      deviceImages = photos.filter((p: any) => typeof p === 'string' && p.startsWith('http'));
    }
    if (deviceImages.length === 0 && Array.isArray(quote.images) && quote.images.length > 0) {
      deviceImages = quote.images.filter((p: any) => typeof p === 'string' && p.startsWith('http'));
    }
    if (deviceImages.length === 0 && rd.photos8to10) {
      deviceImages = Object.values(rd.photos8to10).filter((p: any) => typeof p === 'string' && p.startsWith('http')) as string[];
    }

    const targetImei = (imeiNumber || quote.imeiNumber || quote.imei || '').trim();

    // Check if an existing listing already exists for this quote or IMEI to prevent duplicate creation
    let existingListing: any = null;
    if (quote.listingId && typeof quote.listingId === 'string' && quote.listingId.length === 24) {
      existingListing = await prisma.oldPhoneListing.findUnique({ where: { id: quote.listingId } }).catch(() => null);
    }
    if (!existingListing && rd.listingId && typeof rd.listingId === 'string' && rd.listingId.length === 24) {
      existingListing = await prisma.oldPhoneListing.findUnique({ where: { id: rd.listingId } }).catch(() => null);
    }
    if (!existingListing && targetImei && targetImei.toUpperCase() !== 'N/A' && targetImei.length >= 8) {
      existingListing = await prisma.oldPhoneListing.findFirst({
        where: {
          imeiNumber: { equals: targetImei, mode: 'insensitive' },
          isSold: false,
        },
      });
    }

    // Resolve a valid userId for OldPhoneListing (requires valid 24-char ObjectId relation to User)
    let validUserId: string | null = null;
    if (quote.userId && typeof quote.userId === 'string' && quote.userId.length === 24) {
      const existingUser = await prisma.user.findUnique({ where: { id: quote.userId }, select: { id: true } });
      if (existingUser) validUserId = existingUser.id;
    }
    if (!validUserId) {
      const systemUser = await prisma.user.findFirst({
        where: { role: { in: ['SUPER_ADMIN', 'SELLING_TEAM', 'USER'] } },
        select: { id: true },
      });
      if (systemUser) validUserId = systemUser.id;
    }

    const listingPayloadData: any = {
      phoneName: phoneName || `${quote.brand || ''} ${quote.model || ''}`.trim() || 'Certified Smartphone',
      phoneModel: phoneModel || quote.model || 'Smartphone',
      phoneStorage: phoneStorage || quote.storage || '128GB',
      phoneRam: phoneRam || quote.ram || '6GB',
      phoneColor: phoneColor || quote.color || 'Standard',
      phonePrice: finalPriceVal,
      mrpPrice: mrpPriceVal,
      exactPrice: finalPriceVal,
      description: description || `Certified Refurbished ${quote.model || 'Smartphone'}. 100% Quality Tested with ${warranty}.`,
      imeiNumber: targetImei || undefined,
      phoneOn: checklist.phoneOn !== false,
      displayWorking: checklist.displayWorking !== false,
      displayGlassDamage: checklist.displayGlassDamage === true,
      bodyCondition: (checklist.bodyCondition as any) || 'GOOD',
      simSlotsWorking: checklist.simSlotsWorking !== false,
      volumeButtonsWorking: checklist.volumeButtonsWorking !== false,
      fingerprintWorking: checklist.fingerprintWorking !== false,
      cameraWorking: checklist.cameraWorking !== false,
      speakerWorking: checklist.speakerWorking !== false,
      mobileRepaired: checklist.mobileRepaired !== false,
      financeKitAvailable: financeKitAvailable !== false,
      accessories: Array.isArray(accessories) ? accessories : [],
      warranty: true,
      warrantyType: typeof warranty === 'string' ? warranty : '6 Months Warranty',
      specifications: Array.isArray(specifications) && specifications.length > 0 ? specifications : undefined,
      images: deviceImages,
      billImage: billImage || undefined,
      purchaseDate: purchaseDate || undefined,
      gift: gift || undefined,
      isActive: true,
      isSold: false,
    };

    let activeListing: any = null;

    if (existingListing) {
      // UPDATE existing listing (NO DUPLICATE)
      activeListing = await prisma.oldPhoneListing.update({
        where: { id: existingListing.id },
        data: {
          ...listingPayloadData,
          updatedAt: new Date(),
        },
      });
    } else if (validUserId) {
      // CREATE brand new listing if none exists
      const listingNumber = `WPWD-${Math.floor(1000 + Math.random() * 9000)}`;
      activeListing = await prisma.oldPhoneListing.create({
        data: {
          listingId: listingNumber,
          userId: validUserId,
          ...listingPayloadData,
        },
      });
    }

    // Update quote record with listing and store status
    const updatedRefurbData = {
      ...rd,
      isListedOnApp: true,
      listingId: activeListing ? activeListing.id : (quote.listingId || `listing_${Date.now()}`),
      listingNumber: activeListing ? activeListing.listingId : `WPWD-${Math.floor(1000 + Math.random() * 9000)}`,
      finalSellingPrice: finalPriceVal,
      sellingChannel,
      warranty: typeof warranty === 'string' ? warranty : '6 Months Warranty',
      specifications: specifications,
      checklist,
      publishedAt: new Date().toISOString(),
    };

    const updatedQuote = await (prisma as any).quote.update({
      where: { id },
      data: {
        status: 'listed_on_app',
        listingId: activeListing ? activeListing.id : (quote.listingId || undefined),
        refurbishData: updatedRefurbData,
        finalPrice: finalPriceVal,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: existingListing ? 'Listing updated successfully!' : `Device successfully published to ${sellingChannel === 'APP' ? 'WePick Buyer App' : 'Sales Network'}!`,
        listing: activeListing,
        device: updatedQuote,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[POST /api/selling/devices/[id]/publish error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to publish device' },
      { status: 500, headers: corsHeaders }
    );
  }
}

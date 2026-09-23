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

// POST: Publish a refurbished device to the public store catalog
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

    const listingNumber = `WPWD-${Math.floor(1000 + Math.random() * 9000)}`;

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

    let createdListing: any = null;
    if (validUserId) {
      try {
        createdListing = await prisma.oldPhoneListing.create({
          data: {
            listingId: listingNumber,
            userId: validUserId,
            phoneName: `${quote.brand || ''} ${quote.model || ''}`.trim() || 'Certified Smartphone',
            phoneModel: quote.model || 'Smartphone',
            phoneStorage: quote.storage || '128GB',
            phoneRam: quote.ram || '6GB',
            mobileRepaired: true,
            phoneColor: 'Standard',
            phonePrice: finalPriceVal,
            mrpPrice: mrpPriceVal,
            description: description || `Certified Refurbished ${quote.model || 'Smartphone'}. 100% Quality Tested with ${warranty}.`,
            imeiNumber: quote.imeiNumber || quote.imei || undefined,
            bodyCondition: 'GOOD',
            warranty: true,
            warrantyType: typeof warranty === 'string' ? warranty : '6 Months Warranty',
            specifications: Array.isArray(specifications) && specifications.length > 0 ? specifications : undefined,
            images: deviceImages,
            isActive: true,
            isSold: false,
          },
        });
      } catch (listErr: any) {
        console.warn('[OldPhoneListing Create Notice]:', listErr?.message || listErr);
      }
    }

    // Update quote record with listing and store status
    const updatedRefurbData = {
      ...rd,
      isListedOnApp: true,
      listingId: createdListing ? createdListing.id : (quote.listingId || `listing_${Date.now()}`),
      listingNumber: createdListing ? createdListing.listingId : listingNumber,
      finalSellingPrice: finalPriceVal,
      sellingChannel,
      warranty: typeof warranty === 'string' ? warranty : '6 Months Warranty',
      specifications: specifications,
      publishedAt: new Date().toISOString(),
    };

    const updatedQuote = await (prisma as any).quote.update({
      where: { id },
      data: {
        status: 'listed_on_app',
        listingId: createdListing ? createdListing.id : (quote.listingId || undefined),
        refurbishData: updatedRefurbData,
        finalPrice: finalPriceVal,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: `Device successfully published to ${sellingChannel === 'APP' ? 'WePick Buyer App' : 'Sales Network'}!`,
        listing: createdListing,
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

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

    // Create or link an OldPhoneListing so it appears immediately on mobile apps & web store
    const listingNumber = `WPWD-${Math.floor(1000 + Math.random() * 9000)}`;
    const deviceImages = Array.isArray(quote.images) && quote.images.length > 0 
      ? quote.images 
      : (rd.photos8to10 ? Object.values(rd.photos8to10).filter(Boolean) : []);

    const listing = await prisma.oldPhoneListing.create({
      data: {
        listingId: listingNumber,
        userId: quote.userId || 'admin_system',
        phoneName: `${quote.brand || ''} ${quote.model || ''}`.trim(),
        phoneModel: quote.model || 'Smartphone',
        phoneStorage: quote.storage || '128GB',
        phoneRam: quote.ram || '6GB',
        mobileRepaired: true,
        phoneColor: 'Standard',
        phonePrice: finalPriceVal,
        mrpPrice: mrpPriceVal,
        description: description || `Certified Refurbished ${quote.model}. 9-point QC passed with ${warranty}.`,
        imeiNumber: quote.imeiNumber || quote.imei || 'N/A',
        bodyCondition: (quote.condition?.toUpperCase() === 'EXCELLENT' ? 'EXCELLENT' : 'GOOD') as any,
        warranty: warranty,
        warrantyType: 'SELLER_WARRANTY',
        images: deviceImages as any,
        isActive: true,
        isSold: false,
      }
    });

    // Update quote record
    const updatedRefurbData = {
      ...rd,
      isListedOnApp: true,
      listingId: listing.id,
      listingNumber: listing.listingId,
      finalSellingPrice: finalPriceVal,
      sellingChannel,
      warranty,
      publishedAt: new Date().toISOString(),
    };

    await (prisma as any).quote.update({
      where: { id },
      data: {
        status: 'listed_on_app',
        listingId: listing.id,
        refurbishData: updatedRefurbData,
        finalPrice: finalPriceVal,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: `Device successfully published to ${sellingChannel === 'APP' ? 'WePick Buyer App' : 'Sales Network'}!`,
        listing,
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

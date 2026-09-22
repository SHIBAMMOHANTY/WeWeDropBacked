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

// POST: Record sale of a refurbished phone
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const {
      soldPrice,
      soldToName = 'Walk-in Retail Buyer',
      soldToPhone = '',
      saleChannel = 'RETAIL', // RETAIL, APP, B2B_DEALER
      paymentMode = 'UPI',
      invoiceNumber = '',
      sellerName = 'Selling Team',
      notes = '',
    } = body;

    const quote = await (prisma as any).quote.findUnique({
      where: { id },
    });

    if (!quote) {
      return NextResponse.json({ success: false, error: 'Device record not found' }, { status: 404, headers: corsHeaders });
    }

    const rd = quote.refurbishData || {};
    const baseCost = Number(quote.finalPrice || quote.estimatedPrice || 0);
    const partsCost = Number(rd.partsTotalCost || 0);
    const labourCost = Number(rd.labourCost || 300);
    const totalCost = baseCost + partsCost + labourCost;
    const finalSoldPrice = Number(soldPrice) || Number(rd.finalSellingPrice) || totalCost;
    const grossProfit = finalSoldPrice - totalCost;

    const saleDetails = {
      soldPrice: finalSoldPrice,
      soldToName,
      soldToPhone,
      saleChannel,
      paymentMode,
      invoiceNumber: invoiceNumber || `INV-${Date.now().toString().slice(-6)}`,
      sellerName,
      grossProfit,
      totalCost,
      soldAt: new Date().toISOString(),
      notes,
    };

    // If there is an active OldPhoneListing for this device, mark it sold
    if (quote.listingId || rd.listingId) {
      try {
        await prisma.oldPhoneListing.updateMany({
          where: {
            OR: [{ id: quote.listingId || rd.listingId }, { imeiNumber: quote.imeiNumber || quote.imei }],
          },
          data: { isSold: true, isActive: false },
        });
      } catch (lErr) {
        console.warn('Listing update notice:', lErr);
      }
    }

    const updated = await (prisma as any).quote.update({
      where: { id },
      data: {
        status: 'sold',
        refurbishData: {
          ...rd,
          saleDetails,
          refurbStatus: 'SOLD',
        },
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: `Device marked as SOLD for ₹${finalSoldPrice.toLocaleString('en-IN')} (Profit: ₹${grossProfit.toLocaleString('en-IN')})!`,
        saleDetails,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[POST /api/selling/devices/[id]/mark-sold error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to mark device as sold' },
      { status: 500, headers: corsHeaders }
    );
  }
}

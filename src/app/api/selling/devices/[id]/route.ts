export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// GET: Fetch a single selling device by ID
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const quote = await (prisma as any).quote.findUnique({
      where: { id },
    });

    if (!quote || quote.isDeleted || quote.status === 'deleted') {
      return NextResponse.json(
        { success: false, error: 'Device record not found or deleted' },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { success: true, device: quote },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[GET /api/selling/devices/[id] error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch device' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// DELETE: Unlist or remove device from selling portal
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const quote = await (prisma as any).quote.findUnique({
      where: { id },
    });

    if (!quote) {
      return NextResponse.json(
        { success: false, error: 'Device record not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const rd = quote.refurbishData || {};

    // If active listing exists, deactivate it
    if (quote.listingId || rd.listingId) {
      try {
        await prisma.oldPhoneListing.updateMany({
          where: {
            OR: [{ id: quote.listingId || rd.listingId }, { imeiNumber: quote.imeiNumber || quote.imei }],
          },
          data: { isActive: false },
        });
      } catch (_) {}
    }

    const updatedQuote = await (prisma as any).quote.update({
      where: { id },
      data: {
        status: 'ready_for_sale',
        refurbishData: {
          ...rd,
          isListedOnApp: false,
          refurbStatus: 'READY_FOR_SALE',
          unlistedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Device unlisted from store successfully',
        device: updatedQuote,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[DELETE /api/selling/devices/[id] error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to unlist device' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// POST: Upload / Add distinct Sales / Store listing photos (without touching intake or QC photos)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { photos = [], photoUrl } = body;

    const newPhotos = [
      ...(Array.isArray(photos) ? photos : []),
      ...(photoUrl ? [photoUrl] : []),
    ].filter((p: any) => typeof p === 'string' && (p.startsWith('http') || p.startsWith('data:')));

    if (newPhotos.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid photo URL provided' },
        { status: 400, headers: corsHeaders }
      );
    }

    const cleanId = String(id || '').replace(/^#/, '').trim();
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id) || /^[0-9a-fA-F]{24}$/.test(cleanId);

    const quote = await (prisma as any).quote.findFirst({
      where: {
        OR: [
          { quoteNumber: id },
          { quoteNumber: cleanId },
          ...(isObjectId ? [{ id }, { id: cleanId }] : []),
        ],
      },
    });

    if (!quote) {
      return NextResponse.json(
        { success: false, error: 'Device record not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const rd = quote.refurbishData || {};
    const existingSales = Array.isArray(rd.salesPhotos) ? rd.salesPhotos : [];
    const updatedSales = Array.from(new Set([...existingSales, ...newPhotos]));

    // Update quote record with salesPhotos stored distinctly in refurbishData
    const updatedRefurbData = {
      ...rd,
      salesPhotos: updatedSales,
      updatedAt: new Date().toISOString(),
    };

    await (prisma as any).quote.update({
      where: { id: quote.id },
      data: {
        refurbishData: updatedRefurbData,
        updatedAt: new Date(),
      },
    });

    // If an OldPhoneListing exists, update its images to include the new sales photos
    if (quote.listingId) {
      await (prisma as any).oldPhoneListing.updateMany({
        where: {
          OR: [{ id: quote.listingId }, { listingId: quote.listingId }],
        },
        data: {
          images: updatedSales,
          updatedAt: new Date(),
        },
      }).catch(() => null);
    }

    return NextResponse.json(
      {
        success: true,
        message: `Successfully added ${newPhotos.length} sales photo(s)`,
        salesPhotos: updatedSales,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[POST /api/selling/devices/[id]/photos error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to update sales photos' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// DELETE: Remove a sales photo by URL
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { photoUrl } = body;

    if (!photoUrl) {
      return NextResponse.json(
        { success: false, error: 'photoUrl is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const cleanId = String(id || '').replace(/^#/, '').trim();
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id) || /^[0-9a-fA-F]{24}$/.test(cleanId);

    const quote = await (prisma as any).quote.findFirst({
      where: {
        OR: [
          { quoteNumber: id },
          { quoteNumber: cleanId },
          ...(isObjectId ? [{ id }, { id: cleanId }] : []),
        ],
      },
    });

    if (!quote) {
      return NextResponse.json(
        { success: false, error: 'Device record not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const rd = quote.refurbishData || {};
    const existingSales = Array.isArray(rd.salesPhotos) ? rd.salesPhotos : [];
    const updatedSales = existingSales.filter((u: string) => u !== photoUrl);

    const updatedRefurbData = {
      ...rd,
      salesPhotos: updatedSales,
      updatedAt: new Date().toISOString(),
    };

    await (prisma as any).quote.update({
      where: { id: quote.id },
      data: {
        refurbishData: updatedRefurbData,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Sales photo removed',
        salesPhotos: updatedSales,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[DELETE /api/selling/devices/[id]/photos error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to remove sales photo' },
      { status: 500, headers: corsHeaders }
    );
  }
}

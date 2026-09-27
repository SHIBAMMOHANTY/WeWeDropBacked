import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-role',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Array of device IDs is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const objectIds = ids.filter((id) => typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id));
    const quoteNumbers = ids.filter((id) => typeof id === 'string' && !/^[0-9a-fA-F]{24}$/.test(id));

    const orConditions: any[] = [];
    if (objectIds.length > 0) {
      orConditions.push({ id: { in: objectIds } });
    }
    if (quoteNumbers.length > 0) {
      orConditions.push({ quoteNumber: { in: quoteNumbers } });
    }

    if (orConditions.length === 0) {
      return NextResponse.json(
        { success: true, message: 'No matching devices found', count: 0 },
        { headers: corsHeaders }
      );
    }

    const result = await (prisma as any).quote.deleteMany({
      where: {
        OR: orConditions,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: `Successfully deleted ${result.count} devices`,
        count: result.count,
      },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    console.error('Bulk Delete Refurbish Devices Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error while bulk deleting devices' },
      { status: 500, headers: corsHeaders }
    );
  }
}

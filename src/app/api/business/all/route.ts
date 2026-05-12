export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET() {
  try {
    const businesses = await prisma.business.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        dealerName: true,
        contactNumber: true,
        referralCode: true,
        gstName: true,
        gstNumber: true,
        gstAddress: true,
        gstCertificate: true,
        approved: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, businesses }, { headers: corsHeaders });
  } catch (error) {
    console.error("GET /api/business/all error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch businesses" }, { status: 500, headers: corsHeaders });
  }
}
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
    const payments = await prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        orderId: true,
        amount: true,
        status: true,
        paymentStatus: true,
        paymentDate: true,
        razorpayId: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, payments }, { headers: corsHeaders });
  } catch (error) {
    console.error("GET /api/payments/all error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch payments" }, { status: 500, headers: corsHeaders });
  }
}
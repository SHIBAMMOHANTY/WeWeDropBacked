export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const businesses = await prisma.business.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(businesses);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch businesses" }, { status: 500 });
  }
}
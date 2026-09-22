export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// GET: List available Selling Team members and active groups
export async function GET(req: NextRequest) {
  try {
    // Find users with SELLING_TEAM, DELIVERY_AGENT, ADMIN, or SUPER_ADMIN roles who can sell
    const sellers = await (prisma as any).user.findMany({
      where: {
        OR: [
          { role: 'SELLING_TEAM' },
          { role: 'SUPER_ADMIN' },
          { role: 'DELIVERY_AGENT' },
          { role: 'ADMIN' },
        ],
      },
      select: {
        id: true,
        username: true,
        phone: true,
        email: true,
        role: true,
      },
      orderBy: { username: 'asc' },
    });

    const groups = [
      { id: 'GROUP_ALL', name: 'All Available Selling Team (General Pool)', description: 'Shared queue for all active sellers' },
      { id: 'GROUP_RETAIL', name: 'Retail Store Sales Hub', description: 'Assigned for walk-in retail & shop sales' },
      { id: 'GROUP_APP', name: 'WePick App Online Catalog', description: 'Directly listed on buyer mobile app' },
      { id: 'GROUP_B2B', name: 'B2B Wholesale / Bulk Dealer Group', description: 'For bulk batch lots to verified dealers' },
    ];

    return NextResponse.json(
      {
        success: true,
        sellers: sellers.map((s: any) => ({
          id: s.id,
          name: s.username || s.phone || 'Selling Agent',
          phone: s.phone,
          role: s.role,
        })),
        groups,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[GET /api/refurbish/sellers error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch sellers' },
      { status: 500, headers: corsHeaders }
    );
  }
}

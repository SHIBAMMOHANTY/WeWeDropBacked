function generateSellerStaffId(role: string, id: string) {
  const suffix = id ? id.slice(-4).toUpperCase() : Math.floor(1000 + Math.random() * 9000).toString();
  const r = (role || '').toUpperCase();
  if (r.includes('SELLING')) return `WP-SLT-${suffix}`;
  if (r.includes('REFURBISH')) return `WP-RFB-${suffix}`;
  if (r.includes('DELIVERY')) return `WP-DLV-${suffix}`;
  return `WP-ADM-${suffix}`;
}

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
    // Valid Role enum: SUPER_ADMIN, USER, BUSINESS, DELIVERY_AGENT, REFURBISH_TEAM, SELLING_TEAM
    const sellers = await (prisma as any).user.findMany({
      where: {
        role: {
          in: ['SELLING_TEAM', 'SUPER_ADMIN', 'DELIVERY_AGENT'],
        },
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
        sellers: sellers.map((s: any) => {
          const staffId = generateSellerStaffId(s.role, s.id);
          return {
            id: s.id,
            staffId,
            name: `${s.username || s.phone} (${staffId})`,
            rawName: s.username || s.phone,
            phone: s.phone,
            role: s.role,
          };
        }),
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

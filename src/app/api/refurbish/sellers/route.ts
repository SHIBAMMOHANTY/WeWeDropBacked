function generateSellerStaffId(role: string, id: string) {
  const suffix = id ? id.slice(-4).toUpperCase() : Math.floor(1000 + Math.random() * 9000).toString();
  return `WP-SLT-${suffix}`;
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

// GET: List ONLY active Selling Team members and active selling groups
export async function GET(req: NextRequest) {
  try {
    // Strictly ONLY active users with role SELLING_TEAM
    const sellers = await (prisma as any).user.findMany({
      where: {
        role: 'SELLING_TEAM',
        isActive: { not: false },
      },
      select: {
        id: true,
        username: true,
        phone: true,
        email: true,
        role: true,
        isActive: true,
      },
      orderBy: { username: 'asc' },
    });

    const groups = [
      { id: 'GROUP_ALL', name: 'All Available Selling Team (General Pool)', description: 'Shared queue for all active sellers' },
      { id: 'GROUP_APP', name: 'WePick App Online Catalog', description: 'Directly listed on buyer mobile app' },
      { id: 'GROUP_RETAIL', name: 'Retail Store Sales Hub', description: 'Assigned for walk-in retail & shop sales' },
      { id: 'GROUP_B2B', name: 'B2B Wholesale / Bulk Dealer Group', description: 'For bulk batch lots to verified dealers' },
    ];

    const formattedSellers = sellers.map((s: any) => {
      const staffId = generateSellerStaffId(s.role, s.id);
      const displayName = s.username || (s.phone ? `Selling Exec (${s.phone.slice(-4)})` : 'Selling Team Exec');
      return {
        id: s.id,
        staffId,
        name: `${displayName} (${staffId})`,
        rawName: displayName,
        phone: s.phone,
        email: s.email,
        role: s.role,
        isActive: s.isActive !== false,
      };
    });

    return NextResponse.json(
      {
        success: true,
        sellers: formattedSellers,
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

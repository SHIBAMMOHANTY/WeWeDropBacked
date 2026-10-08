function generateRefurbStaffId(role: string, id: string) {
  const suffix = id ? id.slice(-4).toUpperCase() : Math.floor(1000 + Math.random() * 9000).toString();
  return `WP-RFB-${suffix}`;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-role',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// GET: List active Refurbish Team members (technicians)
export async function GET(req: NextRequest) {
  try {
    const members = await (prisma as any).user.findMany({
      where: {
        role: { in: ['REFURBISH_TEAM', 'REFURBISH'] },
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

    const formattedMembers = members.map((m: any) => {
      const staffId = generateRefurbStaffId(m.role, m.id);
      const displayName = m.username || (m.phone ? `Technician (${m.phone.slice(-4)})` : 'Refurbish Tech');
      return {
        id: m.id,
        staffId,
        name: `${displayName} (${staffId})`,
        rawName: displayName,
        phone: m.phone,
        email: m.email,
        role: m.role,
        isActive: m.isActive !== false,
      };
    });

    return NextResponse.json(
      {
        success: true,
        members: formattedMembers,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[GET /api/refurbish/members error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch refurbish members' },
      { status: 500, headers: corsHeaders }
    );
  }
}

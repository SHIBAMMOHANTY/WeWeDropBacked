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
    const allUsers = await (prisma as any).user.findMany({
      select: {
        id: true,
        username: true,
        phone: true,
        email: true,
        role: true,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const refurbMembers = allUsers.filter((u: any) => {
      const roleUpper = String(u.role || '').toUpperCase();
      const isActive = u.isActive !== false && (u as any).status !== 'DISABLED' && (u as any).status !== 'INACTIVE';
      return isActive && (roleUpper === 'REFURBISH_TEAM' || roleUpper.includes('REFURBISH'));
    });

    const formattedMembers = refurbMembers.map((m: any) => {
      const staffId = generateRefurbStaffId(m.role || 'REFURBISH_TEAM', m.id);
      const displayName = m.username || (m.phone ? `Technician (${m.phone.slice(-4)})` : 'Refurbish Tech');
      return {
        id: m.id,
        _id: m.id,
        staffId,
        name: `${displayName} (${staffId})`,
        rawName: displayName,
        username: displayName,
        phone: m.phone || '',
        email: m.email || '',
        role: m.role || 'REFURBISH_TEAM',
        isActive: true,
      };
    });

    return NextResponse.json(
      {
        success: true,
        members: formattedMembers,
        users: formattedMembers,
        count: formattedMembers.length,
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

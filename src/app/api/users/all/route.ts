function generateFormattedStaffId(role: string, id: string, existingStaffId?: string) {
  if (existingStaffId) return existingStaffId;
  const roleUpper = (role || '').toUpperCase();
  const suffix = id ? id.slice(-4).toUpperCase() : Math.floor(1000 + Math.random() * 9000).toString();
  if (roleUpper.includes('REFURBISH')) return `WP-RFB-${suffix}`;
  if (roleUpper.includes('SELLING')) return `WP-SLT-${suffix}`;
  if (roleUpper.includes('DELIVERY') || roleUpper.includes('AGENT')) return `WP-DLV-${suffix}`;
  if (roleUpper.includes('BUSINESS') || roleUpper.includes('DEALER')) return `WP-BIZ-${suffix}`;
  if (roleUpper.includes('ADMIN')) return `WP-ADM-${suffix}`;
  return `WP-USR-${suffix}`;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-role, x-user-type, x-filter-role',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const queryRole = url.searchParams.get('role') || url.searchParams.get('type') || url.searchParams.get('userType');
    const isBusinessQuery = url.searchParams.get('isBusiness') === 'true' || url.searchParams.get('business') === 'true';
    const headerRole = req.headers.get('x-role') || req.headers.get('x-user-type') || req.headers.get('x-filter-role');

    const rawRole = (queryRole || headerRole || (isBusinessQuery ? 'BUSINESS' : '')).trim().toUpperCase();

    const where: any = {};
    if (rawRole === 'BUSINESS' || rawRole === 'DEALER') {
      where.role = 'BUSINESS';
    } else if (rawRole === 'USER' || rawRole === 'CUSTOMER') {
      where.role = 'USER';
    } else if (rawRole === 'REFURBISH_TEAM' || rawRole === 'REFURBISH') {
      where.role = 'REFURBISH_TEAM';
    } else if (rawRole === 'SELLING_TEAM' || rawRole === 'SELLING') {
      where.role = 'SELLING_TEAM';
    } else if (rawRole === 'DELIVERY_AGENT' || rawRole === 'AGENT') {
      where.role = 'DELIVERY_AGENT';
    } else if (rawRole === 'STAFF' || rawRole === 'TEAM' || rawRole === 'AGENTS') {
      where.role = { in: ['DELIVERY_AGENT', 'REFURBISH_TEAM', 'SELLING_TEAM'] };
    } else if (rawRole === 'SUPER_ADMIN' || rawRole === 'ADMIN') {
      where.role = 'SUPER_ADMIN';
    } else if (rawRole && rawRole !== 'ALL') {
      where.role = rawRole as any;
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { orders: true },
    });
    console.log(`Fetched users count (filtered role: ${rawRole || 'ALL'}): ${users.length}`);

    const formattedUsers = users.map(({ password, avatar, ...user }) => ({
      ...user,
      staffId: generateFormattedStaffId(user.role, user.id, (user as any).staffId),
      customId: generateFormattedStaffId(user.role, user.id, (user as any).staffId),
      avatar: avatar ?? "",
    }));

    return NextResponse.json({
      success: true,
      filter: rawRole || 'ALL',
      total: users.length,
      users: formattedUsers,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('GET /api/users/all error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

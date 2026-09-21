export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildPagination } from '@/lib/api';

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
    } else if (rawRole === 'DELIVERY_AGENT' || rawRole === 'AGENT') {
      where.role = 'DELIVERY_AGENT';
    } else if (rawRole === 'SUPER_ADMIN' || rawRole === 'ADMIN') {
      where.role = 'SUPER_ADMIN';
    } else if (rawRole && rawRole !== 'ALL') {
      where.role = rawRole as any;
    }

    const { page, limit, skip } = buildPagination(req.url);

    const total = await prisma.user.count({ where });
    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { orders: true },
      skip,
      take: limit,
    });

    const formattedUsers = users.map(({ password, avatar, ...user }) => ({
      ...user,
      avatar: avatar ?? "",
    }));

    return NextResponse.json({
      success: true,
      filter: rawRole || 'ALL',
      users: formattedUsers,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('GET /api/users error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

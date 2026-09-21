export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildPagination } from '@/lib/api';
import bcrypt from 'bcryptjs';

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      phone,
      password,
      username,
      name,
      email,
      role = 'USER',
      isActive = true,
      address,
      city,
      state,
      pincode,
      serviceArea,
      gstName,
      gstNumber,
      gstAddress,
      aadharNumber,
      dlNumber,
    } = body;

    if (!phone) {
      return NextResponse.json(
        { success: false, error: 'Phone number is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const cleanPhone = String(phone).trim();
    const existing = await prisma.user.findUnique({ where: { phone: cleanPhone } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'A user with this phone number already exists' },
        { status: 400, headers: corsHeaders }
      );
    }

    let hashedPassword = null;
    if (password) {
      hashedPassword = await bcrypt.hash(String(password).trim(), 10);
    }

    const targetRole = ['SUPER_ADMIN', 'USER', 'BUSINESS', 'DELIVERY_AGENT', 'REFURBISH_TEAM', 'SELLING_TEAM'].includes(String(role).toUpperCase())
      ? (String(role).toUpperCase() as any)
      : 'USER';

    const newUser = await prisma.user.create({
      data: {
        phone: cleanPhone,
        password: hashedPassword,
        username: username || name || `User-${cleanPhone.slice(-4)}`,
        email: email || null,
        role: targetRole,
        isActive: Boolean(isActive),
        address: address || null,
        city: city || null,
        state: state || null,
        pincode: pincode || null,
        serviceArea: serviceArea || null,
        gstName: gstName || null,
        gstNumber: gstNumber || null,
        gstAddress: gstAddress || null,
        aadharNumber: aadharNumber || null,
        dlNumber: dlNumber || null,
      },
    });

    const { password: _, ...userData } = newUser;

    return NextResponse.json(
      {
        success: true,
        message: 'User created successfully',
        user: userData,
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('POST /api/users error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to create user' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { phone, username, password, confirmPassword, role, email, gstName, gstNumber, gstAddress, gstCertificate } = body;
    if (!phone || !username || !password || !confirmPassword) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: corsHeaders });
    }
    if (password !== confirmPassword) {
      return NextResponse.json({ error: 'Passwords do not match' }, { status: 400, headers: corsHeaders });
    }
    // Check uniqueness
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ phone }, { username }] },
    });
    if (existingUser) {
      return NextResponse.json({ error: 'Phone or username already exists' }, { status: 409, headers: corsHeaders });
    }
    // Hash password
    const hashed = await bcrypt.hash(password, 10);
    const normalizedRole = typeof role === 'string' ? role.trim().toUpperCase() : (role ? String(role).toUpperCase() : 'USER');
    const isActiveFlag = normalizedRole === 'BUSINESS' ? false : true;

    const user = await prisma.user.create({
      data: {
        phone,
        username,
        password: hashed,
        role: normalizedRole as Role,
        email: email || null,
        gstName: gstName || null,
        gstNumber: gstNumber || null,
        gstAddress: gstAddress || null,
        gstCertificate: gstCertificate || null,
        isActive: isActiveFlag,
      },
      select: {
        id: true,
        phone: true,
        username: true,
        password: true,
        role: true,
        email: true,
        membership: true,
        isActive: true,
        createdAt: true,
        gstName: true,
        gstNumber: true,
        gstAddress: true,
        gstCertificate: true,
      },
    });
    console.log('User created successfully:', user.id, user.username, user.createdAt, 'isActive=', user.isActive);
    const token = signToken({ id: user.id, role: user.role });
    // Don't return password
    const { password: _, ...userSafe } = user;
    return NextResponse.json({ user: userSafe, token }, { status: 201, headers: corsHeaders });
  } catch (error: any) {
    console.error('User registration error:', error);
    return NextResponse.json({ error: error.message || 'Failed to register' }, { status: 500, headers: corsHeaders });
  }
}

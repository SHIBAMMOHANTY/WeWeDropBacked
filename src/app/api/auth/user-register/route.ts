import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { phone, username, password, confirmPassword, role, email } = body;
    if (!phone || !username || !password || !confirmPassword) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (password !== confirmPassword) {
      return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 });
    }
    // Check uniqueness
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ phone }, { username }] },
    });
    if (existingUser) {
      return NextResponse.json({ error: 'Phone or username already exists' }, { status: 409 });
    }
    // Hash password
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        phone,
        username,
        password: hashed,
        role: role || 'USER',
        email: email || null,
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
      },
    });
    const token = signToken({ id: user.id, role: user.role });
    // Don't return password
    const { password: _, ...userSafe } = user;
    return NextResponse.json({ user: userSafe, token }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to register' }, { status: 500 });
  }
}

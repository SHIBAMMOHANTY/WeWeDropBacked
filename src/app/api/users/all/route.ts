import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: { url: string | URL; }) {
  try {
    // Parse pagination params
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const skip = (page - 1) * limit;

    // Get total count
    const total = await prisma.user.count();

    // Get paginated users
    const users = await prisma.user.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    // Format users (remove password)
    const formattedUsers = users.map(({ password, ...user }) => user);

    return NextResponse.json({
      success: true,
      users: formattedUsers,
      total,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

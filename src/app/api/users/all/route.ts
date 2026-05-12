export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  try {
    // Get all users without pagination
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: { orders: true },
    });
    console.log('Fetched users count:', users.length);

    // Get total count
    const total = users.length;

    // Format users (remove password) and ensure avatar is present
    const formattedUsers = users.map(({ password, avatar, ...user }) => ({
      ...user,
      avatar: avatar ?? "",
    }));

    // Create response with CORS headers
    return NextResponse.json({
      success: true,
      users: formattedUsers,
      total,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('GET /api/users/all error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
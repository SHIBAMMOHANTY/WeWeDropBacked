import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Referrer-Policy': 'no-referrer'
};


export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function PATCH(req: NextRequest) {
  try {
    const { email, phone, newPassword, type } = await req.json();
    if ((!email && !phone) || !newPassword || !type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: corsHeaders });
    }

    let entity, entityType, whereClause;
    if (type === 'user') {
      entity = prisma.user;
      entityType = 'User';
      whereClause = {
        OR: [
          email ? { email } : undefined,
          phone ? { phone } : undefined,
        ].filter(Boolean)
      };
    } else if (type === 'business') {
      entity = prisma.business;
      entityType = 'Business';
      whereClause = {
        OR: [
          email ? { email } : undefined,
          phone ? { contactNumber: phone } : undefined,
        ].filter(Boolean)
      };
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400, headers: corsHeaders });
    }

    let record = await entity.findFirst({ where: whereClause });
    // If not found in business table, check user table for BUSINESS role
    if (!record && type === 'business') {
      record = await prisma.user.findFirst({
        where: {
          OR: [
            email ? { email } : undefined,
            phone ? { phone } : undefined,
          ].filter(Boolean),
          role: 'BUSINESS',
        },
      });
      if (record) {
        entity = prisma.user;
        entityType = 'User';
      }
    }
    if (!record) {
      return NextResponse.json({ error: `${entityType} not found` }, { status: 404, headers: corsHeaders });
    }

    if (type === 'user' && !['USER', 'SUPER_ADMIN', 'BUSINESS'].includes(record.role)) {
      return NextResponse.json({ error: 'Not a user/business account' }, { status: 403, headers: corsHeaders });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await entity.update({
      where: { id: record.id },
      data: { password: hashedPassword }
    });

    return NextResponse.json({ success: true, message: 'Password reset successful' }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to reset password' }, { status: 500, headers: corsHeaders });
  }
}



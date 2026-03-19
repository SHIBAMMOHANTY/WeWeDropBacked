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

/**
 * POST /api/users/reset-password
 * Body: { email?: string, phone?: string, otp: string, newPassword: string }
 *
 * - User provides email or phone, OTP, and new password.
 * - Verifies OTP (implement your OTP logic here).
 * - Updates password if user found and OTP is valid.
 */
export async function POST(req: NextRequest) {
  try {
    const { email, phone, otp, newPassword } = await req.json();
    if ((!email && !phone) || !otp || !newPassword) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: corsHeaders });
    }

    // TODO: Replace with your OTP verification logic
    // Example: const isOtpValid = await verifyOtp({ email, phone, otp });
    const isOtpValid = true; // <-- Replace with real check
    if (!isOtpValid) {
      return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400, headers: corsHeaders });
    }

    // Find user by email or phone
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          email ? { email } : undefined,
          phone ? { phone } : undefined,
        ].filter(Boolean)
      }
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404, headers: corsHeaders });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });

    return NextResponse.json({ success: true, message: 'Password reset successful' }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to reset password' }, { status: 500, headers: corsHeaders });
  }
}

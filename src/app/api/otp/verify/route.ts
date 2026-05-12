import { verifyOTP } from '@/lib/otp';
import { NextResponse } from 'next/server';

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
    const { email, otp } = await req.json();
    if (!email || !otp) {
      return NextResponse.json({ error: 'Email and OTP required' }, { status: 400, headers: corsHeaders });
    }
    const valid = await verifyOTP(email, otp);
    if (valid) {
      return NextResponse.json({ success: true }, { status: 200, headers: corsHeaders });
    } else {
      return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400, headers: corsHeaders });
    }
  } catch (err: any) {
    console.error('OTP verify error:', err);
    return NextResponse.json({ error: 'Failed to verify OTP' }, { status: 500, headers: corsHeaders });
  }
}

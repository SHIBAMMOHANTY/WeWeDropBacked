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
    const body = await req.json();

    // Accept 'phone' (primary) or fallback to legacy 'email' field
    const phone: string = body.phone || body.email || '';
    const otp: string   = body.otp || '';

    if (!phone || !otp) {
      return NextResponse.json(
        { error: 'Phone number and OTP are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const valid = await verifyOTP(phone, otp);
    if (valid) {
      return NextResponse.json({ success: true }, { status: 200, headers: corsHeaders });
    } else {
      return NextResponse.json(
        { error: 'Invalid or expired OTP' },
        { status: 400, headers: corsHeaders }
      );
    }
  } catch (err: any) {
    console.error('[OTP Verify] Error:', err);
    return NextResponse.json(
      { error: 'Failed to verify OTP', details: err?.message || String(err) },
      { status: 500, headers: corsHeaders }
    );
  }
}

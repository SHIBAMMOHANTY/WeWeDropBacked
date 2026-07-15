import { sendOTP } from '@/lib/otp';
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

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Basic phone validation — must be 10 digits or 12 digits with country code
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 13) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400, headers: corsHeaders }
      );
    }

    await sendOTP(phone);
    return NextResponse.json({ success: true }, { status: 200, headers: corsHeaders });
  } catch (err: any) {
    console.error('[OTP Send] Error:', err);
    return NextResponse.json(
      { error: 'Failed to send OTP', details: err?.message || String(err) },
      { status: 500, headers: corsHeaders }
    );
  }
}

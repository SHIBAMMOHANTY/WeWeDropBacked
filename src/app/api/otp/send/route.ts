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
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400, headers: corsHeaders });
    }
    await sendOTP(email);
    return NextResponse.json({ success: true }, { status: 200, headers: corsHeaders });
  } catch (err: any) {
    console.error('OTP send error:', err);
    return NextResponse.json({ error: 'Failed to send OTP', details: err?.message || String(err) }, { status: 500, headers: corsHeaders });
  }
}

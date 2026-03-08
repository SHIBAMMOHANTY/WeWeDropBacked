import { sendOTP } from '../../../lib/otp';

export async function POST(req: Request) {
  const { email } = await req.json();
  if (!email) {
    return new Response(JSON.stringify({ error: 'Email required' }), { status: 400 });
  }
  try {
    await sendOTP(email);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to send OTP' }), { status: 500 });
  }
}


import { verifyOTP } from '@/lib/otp';

export async function POST(req: Request) {
  const { email, otp } = await req.json();
  if (!email || !otp) {
    return new Response(JSON.stringify({ error: 'Email and OTP required' }), { status: 400 });
  }
  const valid = verifyOTP(email, otp);
  if (valid) {
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } else {
    return new Response(JSON.stringify({ error: 'Invalid or expired OTP' }), { status: 400 });
  }
}

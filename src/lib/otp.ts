
import transporter from '../config/email.config';

// In-memory store for demo (replace with DB/Redis for production)
const otpStore: Record<string, { otp: string; expires: number }> = {};


export function generateOTP(length = 6): string {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}

export async function sendOTP(email: string) {
  const otp = generateOTP();
  otpStore[email] = {
    otp,
    expires: Date.now() + 5 * 60 * 1000, // 5 min expiry
  };
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: email,
    subject: 'Your OTP Code',
    text: `Your OTP code is: ${otp}`,
  };
  return transporter.sendMail(mailOptions);
}


export function verifyOTP(email: string, otp: string): boolean {
  const record = otpStore[email];
  if (!record) return false;
  if (record.expires < Date.now()) return false;
  if (record.otp !== otp) return false;
  delete otpStore[email];
  return true;
}

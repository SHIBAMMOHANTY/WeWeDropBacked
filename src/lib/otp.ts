

import transporter from '../config/email.config';
import { prisma } from './prisma';


export function generateOTP(length = 6): string {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}

// ...existing code...

export async function sendOTP(email: string) {
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry
  await prisma.oTP.create({
    data: {
      email,
      otp,
      expiresAt,
    },
  });
  const html = `
    <div style="font-family: Arial, sans-serif; background: #f7f7f7; padding: 32px;">
      <div style="max-width: 480px; margin: auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px #00000010; padding: 32px;">
        <h2 style="color: #2d7be0; text-align: center;">We Pick We Drop</h2>
        <p style="font-size: 16px; color: #333; text-align: center;">Your One-Time Password (OTP) for account verification:</p>
        <div style="font-size: 32px; font-weight: bold; color: #2d7be0; text-align: center; margin: 24px 0;">${otp}</div>
        <p style="font-size: 14px; color: #666; text-align: center;">This OTP is valid for 5 minutes. Please do not share it with anyone.</p>
        <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;">
        <p style="font-size: 12px; color: #aaa; text-align: center;">Thank you for using We Pick We Drop.<br>For support, contact us at <a href="mailto:support@wepickwedrop.com" style="color: #2d7be0;">support@wepickwedrop.com</a></p>
      </div>
    </div>
  `;
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: email,
    subject: 'We Pick We Drop - OTP Verification',
    text: `Your OTP code is: ${otp}`,
    html,
  };
  await transporter.sendMail(mailOptions);
}


export async function verifyOTP(email: string, otp: string): Promise<boolean> {
  // Clean up OTPs older than 6 minutes
  await prisma.oTP.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(Date.now() - 6 * 60 * 1000),
      },
    },
  });
  // Find OTP
  const record = await prisma.oTP.findFirst({
    where: {
      email,
      otp,
      expiresAt: {
        gt: new Date(),
      },
    },
  });
  if (!record) return false;
  // Delete OTP after verification
  await prisma.oTP.delete({ where: { id: record.id } });
  return true;
}

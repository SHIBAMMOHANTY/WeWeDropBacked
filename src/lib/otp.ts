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

/** Returns true if the value looks like an email address */
function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Send OTP via Email (nodemailer / SMTP) */
async function sendOTPByEmail(email: string, otp: string): Promise<void> {
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
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: email,
    subject: 'We Pick We Drop - OTP Verification',
    text: `Your OTP code is: ${otp}`,
    html,
  });
  console.log('[OTP] Email OTP sent to', email);
}

/**
 * Send OTP via MSG91 WhatsApp.
 */
async function sendOTPByWhatsApp(phone: string, otp: string): Promise<void> {
  // Strip '+' — MSG91 expects number WITHOUT '+' (e.g. 919876543210)
  const mobileNumber = phone.replace(/^\+/, '');

  const authKey   = process.env.MSG91_AUTH_KEY;
  const intNumber = process.env.MSG91_INTEGRATED_NUMBER; // WhatsApp Business number
  const template  = process.env.MSG91_TEMPLATE_NAME;      // Approved template name
  const namespace = process.env.MSG91_NAMESPACE;           // Template namespace
  const langCode  = process.env.MSG91_LANG_CODE || 'en';

  if (!authKey || !intNumber || !template || !namespace) {
    throw new Error('MSG91 configuration is missing.');
  }

  const payload = {
    integrated_number: intNumber,
    content_type: 'template',
    payload: {
      messaging_product: 'whatsapp',
      type: 'template',
      template: {
        name: template,
        language: { code: langCode, policy: 'deterministic' },
        namespace,
        to_and_components: [
          {
            to: [mobileNumber],
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: otp }],
              },
            ],
          },
        ],
      },
    },
  };

  const res = await fetch(
    'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/',
    {
      method: 'POST',
      headers: {
        authkey: authKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`MSG91 WhatsApp error: ${err}`);
  }

  console.log('[OTP] WhatsApp OTP sent to', mobileNumber);
}

/**
 * sendOTP — auto-detects email vs phone:
 *   - If `emailOrPhone` looks like an email → sends via SMTP (nodemailer)
 *   - If it looks like a phone number     → sends via MSG91 WhatsApp
 */
export async function sendOTP(emailOrPhone: string): Promise<void> {
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry

  // Store OTP in DB
  await prisma.oTP.create({
    data: { email: emailOrPhone, otp, expiresAt },
  });

  if (isEmail(emailOrPhone)) {
    await sendOTPByEmail(emailOrPhone, otp);
  } else {
    await sendOTPByWhatsApp(emailOrPhone, otp);
  }
}

/**
 * verifyOTP — works for both email and phone (both stored in 'email' field)
 */
export async function verifyOTP(emailOrPhone: string, otp: string): Promise<boolean> {
  // Clean up expired OTPs
  await prisma.oTP.deleteMany({
    where: {
      expiresAt: { lt: new Date(Date.now() - 6 * 60 * 1000) },
    },
  });

  // Find matching OTP record
  const record = await prisma.oTP.findFirst({
    where: {
      email: emailOrPhone,
      otp,
      expiresAt: { gt: new Date() },
    },
  });

  if (!record) return false;

  // Delete after successful verification (one-time use)
  await prisma.oTP.delete({ where: { id: record.id } });
  return true;
}

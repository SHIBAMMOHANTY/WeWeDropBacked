import transporter from '../config/email.config';
import { prisma } from './prisma';

// ── Helpers ──────────────────────────────────────────────────────────────────

export function generateOTP(length = 6): string {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}

/** Normalize phone → always stored as 12-digit string e.g. 919876543210 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

/** Returns true if the value looks like an email address */
function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// ── Email OTP ─────────────────────────────────────────────────────────────────

async function sendOTPByEmail(email: string, otp: string): Promise<void> {
  const html = `
    <div style="font-family: Arial, sans-serif; background: #f7f7f7; padding: 32px;">
      <div style="max-width: 480px; margin: auto; background: #fff; border-radius: 8px;
                  box-shadow: 0 2px 8px #00000010; padding: 32px;">
        <h2 style="color: #2d7be0; text-align: center;">We Pick We Drop</h2>
        <p style="font-size: 16px; color: #333; text-align: center;">
          Your One-Time Password (OTP) for account verification:
        </p>
        <div style="font-size: 32px; font-weight: bold; color: #2d7be0;
                    text-align: center; margin: 24px 0;">${otp}</div>
        <p style="font-size: 14px; color: #666; text-align: center;">
          This OTP is valid for 5 minutes. Do not share it with anyone.
        </p>
        <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;">
        <p style="font-size: 12px; color: #aaa; text-align: center;">
          Thank you for using We Pick We Drop.<br>
          Support: <a href="mailto:support@wepickwedrop.com" style="color: #2d7be0;">
            support@wepickwedrop.com
          </a>
        </p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: email,
    subject: 'We Pick We Drop — OTP Verification',
    text: `Your OTP code is: ${otp}. Valid for 5 minutes.`,
    html,
  });

  console.log('[OTP] Email OTP sent to', email);
}

// ── WhatsApp OTP (MSG91) ──────────────────────────────────────────────────────

async function sendOTPByWhatsApp(phone: string, otp: string): Promise<void> {
  const mobileNumber = normalizePhone(phone);

  const authKey   = process.env.MSG91_AUTH_KEY;
  const intNumber = process.env.MSG91_INTEGRATED_NUMBER || '919318411796';
  const template  = process.env.MSG91_TEMPLATE_NAME || 'wepickwedrop';
  const langCode  = process.env.MSG91_LANG_CODE || 'en';
  const namespace = process.env.MSG91_NAMESPACE || 'e67365fb_e80f_4118_a3da_6701091246fa';

  if (!authKey || authKey === 'your_msg91_authkey_here') {
    console.warn('[OTP] MSG91 auth key missing or placeholder in .env — skipping live SMS.');
    return;
  }

  const payload = {
    integrated_number: intNumber,
    content_type: 'template',
    payload: {
      messaging_product: 'whatsapp',
      type: 'template',
      template: {
        name: template,
        language: { code: langCode },
        namespace: namespace,
        to_and_components: [
          {
            to: [mobileNumber],
            components: {
              body_1: {
                type: 'text',
                value: otp,
              },
              button_1: {
                subtype: 'url',
                type: 'text',
                value: otp,
              },
            },
          },
        ],
      },
    },
  };

  console.log('[OTP] Sending WhatsApp OTP →', mobileNumber);

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

  const responseText = await res.text();
  console.log('[OTP] MSG91 status:', res.status, '| response:', responseText);

  let responseJson: any;
  try {
    responseJson = JSON.parse(responseText);
  } catch {
    if (!res.ok) {
      throw new Error(`MSG91 error: HTTP ${res.status} — ${responseText}`);
    }
    return; // non-JSON but 2xx → treat as success
  }

  if (
    !res.ok ||
    responseJson?.type === 'error' ||
    responseJson?.hasError === true ||
    responseJson?.status === 'fail'
  ) {
    throw new Error(
      `MSG91 WhatsApp OTP failed: ${responseJson?.message || responseJson?.error || responseText}`
    );
  }

  console.log('[OTP] WhatsApp OTP sent successfully to', mobileNumber);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * sendOTP(phone)
 *   - phone number  → sends via MSG91 WhatsApp
 *   - email address → sends via SMTP (fallback / admin use)
 *
 * The OTP record is stored using the normalized identifier so verifyOTP
 * can look it up with the same value.
 */
export async function sendOTP(phoneOrEmail: string): Promise<void> {
  const otp       = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // Use normalized phone as the key so send & verify always match
  const key = isEmail(phoneOrEmail)
    ? phoneOrEmail.trim().toLowerCase()
    : normalizePhone(phoneOrEmail);

  // Upsert: delete any existing unexpired OTP for this key, then create fresh
  await prisma.oTP.deleteMany({ where: { email: key } });
  await prisma.oTP.create({ data: { email: key, otp, expiresAt } });

  if (isEmail(phoneOrEmail)) {
    await sendOTPByEmail(key, otp);
  } else {
    await sendOTPByWhatsApp(phoneOrEmail, otp);
  }
}

/**
 * verifyOTP(phone, otp)
 *   Works for both phone numbers and email addresses.
 *   Returns true on success and deletes the record (one-time use).
 */
export async function verifyOTP(phoneOrEmail: string, otp: string): Promise<boolean> {
  const key = isEmail(phoneOrEmail)
    ? phoneOrEmail.trim().toLowerCase()
    : normalizePhone(phoneOrEmail);

  // Clean up stale expired records safely
  try {
    await prisma.oTP.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  } catch (e) {
    // Ignore stale deletion errors
  }

  const record = await prisma.oTP.findFirst({
    where: {
      email: key,
      otp,
      expiresAt: { gt: new Date() },
    },
  });

  if (!record) return false;

  // One-time use — delete safely without throwing record not found exception
  try {
    await prisma.oTP.deleteMany({ where: { id: record.id } });
  } catch (e) {
    // Ignore deletion errors
  }
  return true;
}

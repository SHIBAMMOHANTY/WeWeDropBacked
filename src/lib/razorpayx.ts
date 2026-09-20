import * as crypto from 'crypto';

/**
 * Configuration & credentials getter for RazorpayX Payouts
 */
export function getRazorpayXConfig() {
  const accountNumber = process.env.RAZORPAYX_ACCOUNT_NUMBER;
  const keyId = process.env.RAZORPAYX_KEY_ID || process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAYX_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET;
  const webhookSecret = process.env.RAZORPAYX_WEBHOOK_SECRET || keySecret;

  if (!keyId || !keySecret) {
    throw new Error('Razorpay API Key ID or Secret is missing in environment variables.');
  }

  return {
    accountNumber: accountNumber || '',
    keyId,
    keySecret,
    webhookSecret,
    authHeader: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
  };
}

export type RazorpayXContactInput = {
  name: string;
  email?: string;
  contact?: string;
  type?: 'customer' | 'vendor' | 'employee' | 'self';
  referenceId?: string;
  notes?: Record<string, string>;
};

export type RazorpayXFundAccountInput = 
  | {
      contactId: string;
      accountType: 'vpa';
      vpaAddress: string;
    }
  | {
      contactId: string;
      accountType: 'bank_account';
      name: string;
      ifsc: string;
      accountNumber: string;
    };

export type RazorpayXPayoutInput = {
  accountNumber?: string;
  fundAccountId: string;
  amountInPaise: number; // e.g. 800000 for ₹8000
  currency?: string;
  mode: 'UPI' | 'IMPS' | 'NEFT' | 'RTGS';
  purpose?: string;
  queueIfLowBalance?: boolean;
  referenceId: string;
  narration?: string;
  notes?: Record<string, string>;
  idempotencyKey: string;
};

/**
 * Helper to call Razorpay REST API
 */
async function razorpayXFetch(endpoint: string, options: RequestInit = {}) {
  const config = getRazorpayXConfig();
  const url = `https://api.razorpay.com/v1${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: config.authHeader,
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errorMsg = data?.error?.description || data?.error?.reason || data?.message || `RazorpayX API HTTP ${res.status}`;
    console.error('[RazorpayX API Error]', endpoint, data);
    throw new Error(errorMsg);
  }

  return data;
}

/**
 * 1. Create or retrieve Contact on RazorpayX
 */
export async function createRazorpayXContact(input: RazorpayXContactInput) {
  const payload: any = {
    name: input.name || 'Customer',
    email: input.email || `${Date.now()}@customer.com`,
    contact: input.contact ? input.contact.replace(/\D/g, '').slice(-10) : '9999999999',
    type: input.type || 'customer',
    reference_id: input.referenceId,
    notes: input.notes || {},
  };

  return razorpayXFetch('/contacts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * 2. Create Fund Account (UPI VPA or Bank Account)
 */
export async function createRazorpayXFundAccount(input: RazorpayXFundAccountInput) {
  let payload: any = {
    contact_id: input.contactId,
    account_type: input.accountType,
  };

  if (input.accountType === 'vpa') {
    payload.vpa = {
      address: input.vpaAddress.trim(),
    };
  } else {
    payload.bank_account = {
      name: input.name,
      ifsc: input.ifsc.trim().toUpperCase(),
      account_number: input.accountNumber.trim(),
    };
  }

  return razorpayXFetch('/fund_accounts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * 3. Initiate Payout on RazorpayX
 */
export async function initiateRazorpayXPayout(input: RazorpayXPayoutInput) {
  const config = getRazorpayXConfig();
  const accNum = input.accountNumber || config.accountNumber;

  if (!accNum) {
    throw new Error(
      'RazorpayX Account Number is not set. Please add RAZORPAYX_ACCOUNT_NUMBER to your .env configuration.'
    );
  }

  const payload = {
    account_number: accNum,
    fund_account_id: input.fundAccountId,
    amount: input.amountInPaise,
    currency: input.currency || 'INR',
    mode: input.mode,
    purpose: input.purpose || 'payout',
    queue_if_low_balance: input.queueIfLowBalance ?? true,
    reference_id: input.referenceId,
    narration: input.narration || 'Buyback Payout',
    notes: input.notes || {},
  };

  return razorpayXFetch('/payouts', {
    method: 'POST',
    headers: {
      'X-Payout-Idempotency': input.idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
}

/**
 * 4. Get Payout Details by ID
 */
export async function getRazorpayXPayout(payoutId: string) {
  return razorpayXFetch(`/payouts/${payoutId}`, {
    method: 'GET',
  });
}

/**
 * 5. Cancel Queued Payout
 */
export async function cancelRazorpayXPayout(payoutId: string) {
  return razorpayXFetch(`/payouts/${payoutId}/cancel`, {
    method: 'POST',
  });
}

/**
 * 6. Verify RazorpayX Webhook Signature
 */
export function verifyRazorpayXWebhookSignature(rawBody: string, signature: string, secret?: string): boolean {
  try {
    const webhookSecret = secret || getRazorpayXConfig().webhookSecret;
    if (!webhookSecret || !signature) return false;

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'utf-8'),
      Buffer.from(expectedSignature, 'utf-8')
    );
  } catch (err) {
    console.error('[RazorpayX Webhook Verification Error]', err);
    return false;
  }
}

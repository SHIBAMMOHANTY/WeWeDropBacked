import * as crypto from 'crypto';

function isValidPemKey(key?: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const clean = key.replace(/\\n/g, '\n').trim();
  return clean.includes('-----BEGIN PUBLIC KEY-----') && clean.includes('-----END PUBLIC KEY-----');
}



export interface CashfreePayoutConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  apiVersion: string;
  publicKey?: string;
}

export function getCashfreePayoutConfig(): CashfreePayoutConfig {
  const clientId = process.env.CASHFREE_PAYOUT_CLIENT_ID || process.env.CASHFREE_CLIENT_ID || process.env.CASHFREE_APP_ID;
  const clientSecret = process.env.CASHFREE_PAYOUT_CLIENT_SECRET || process.env.CASHFREE_CLIENT_SECRET || process.env.CASHFREE_SECRET_KEY;
  const env = (process.env.CASHFREE_PAYOUT_ENV || process.env.CASHFREE_ENV || 'SANDBOX').toUpperCase();
  const rawPublicKey = process.env.CASHFREE_PAYOUT_PUBLIC_KEY || process.env.CASHFREE_PUBLIC_KEY;

  if (!clientId || !clientSecret) {
    throw new Error('Cashfree Payout Client ID or Secret is missing in environment variables.');
  }

  const baseUrl = env === 'PRODUCTION'
    ? 'https://api.cashfree.com/payout'
    : 'https://sandbox.cashfree.com/payout';

  const publicKey = rawPublicKey ? rawPublicKey.replace(/\\n/g, '\n').trim() : undefined;

  return {
    clientId,
    clientSecret,
    baseUrl,
    apiVersion: '2024-01-01',
    publicKey,
  };
}

/**
 * Generate RSA OAEP SHA-1 encrypted signature for Cashfree 2FA (Dynamic IP / Serverless)
 */
export function generateCashfreeSignature(clientId: string, publicKeyPem: string): string | null {
  try {
    if (!isValidPemKey(publicKeyPem)) return null;
    const epochTimestamp = Math.floor(Date.now() / 1000);
    const dataToEncrypt = clientId + '.' + epochTimestamp;

    const encrypted = crypto.publicEncrypt(
      {
        key: publicKeyPem.replace(/\\n/g, '\n').trim(),
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha1',
      },
      Buffer.from(dataToEncrypt, 'utf8')
    );

    return encrypted.toString('base64');
  } catch (err) {
    console.warn('[Cashfree Signature Generation Warning]:', err);
    return null;
  }
}

export interface InitiatePayoutParams {
  transferId: string;
  amount: number;
  paymentMethod: 'UPI' | 'BANK_TRANSFER';
  recipientName: string;
  recipientPhone?: string;
  upiId?: string;
  accountNumber?: string;
  ifsc?: string;
  remarks?: string;
}

export interface CashfreeTransferResponse {
  transfer_id: string;
  cf_transfer_id?: string;
  status: 'RECEIVED' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'REVERSED' | 'REJECTED' | 'QUEUED' | string;
  status_code?: string;
  status_description?: string;
  transfer_amount?: number;
  transfer_mode?: string;
  transfer_utr?: string;
  message?: string;
}

/**
 * Execute Cashfree Payout V2 API requests
 */
async function cashfreeFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const config = getCashfreePayoutConfig();
  const url = `${config.baseUrl}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-client-id': config.clientId,
    'x-client-secret': config.clientSecret,
    'x-api-version': config.apiVersion,
    ...(options.headers as Record<string, string>),
  };

  if (config.publicKey && isValidPemKey(config.publicKey)) {
    try {
      const signature = generateCashfreeSignature(config.clientId, config.publicKey);
      if (signature) {
        headers['X-Cf-Signature'] = signature;
      }
    } catch (sigErr) {
      console.warn('[Cashfree Payout]: Signature failed, falling back to IP whitelist:', sigErr);
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data?.message || data?.error?.description || `Cashfree Payout API HTTP ${response.status}`;
    console.error('[Cashfree Payout API Error]', endpoint, data);
    const err = new Error(errorMsg);
    (err as any).statusCode = response.status;
    (err as any).responseBody = data;
    throw err;
  }

  return data;
}

/**
 * Initiate an instant payout to UPI VPA or Bank Account using Cashfree Payouts V2
 */
export async function initiateCashfreePayout(params: InitiatePayoutParams): Promise<CashfreeTransferResponse> {
  const phone = params.recipientPhone
    ? params.recipientPhone.replace(/\D/g, '').slice(-10)
    : '9999999999';

  const transferMode = params.paymentMethod === 'UPI' ? 'upi' : 'banktransfer';

  const instrumentDetails: Record<string, string> = {};
  if (params.paymentMethod === 'UPI') {
    if (!params.upiId) throw new Error('UPI ID (VPA) is required for UPI payout');
    instrumentDetails.vpa = params.upiId.trim();
  } else {
    if (!params.accountNumber || !params.ifsc) {
      throw new Error('Bank Account Number and IFSC are required for Bank Transfer');
    }
    instrumentDetails.bank_account_number = params.accountNumber.trim();
    instrumentDetails.bank_ifsc = params.ifsc.trim().toUpperCase();
  }

  const payload = {
    transfer_id: params.transferId,
    transfer_amount: Number(params.amount.toFixed(2)),
    transfer_currency: 'INR',
    transfer_mode: transferMode,
    beneficiary_details: {
      beneficiary_name: params.recipientName.trim(),
      beneficiary_instrument_details: instrumentDetails,
      beneficiary_contact_details: {
        beneficiary_phone: phone,
      },
    },
    transfer_remarks: params.remarks || 'Mobile Buyback Payout',
  };

  return cashfreeFetch('/transfers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Fetch status of a transfer by merchant transfer_id or cf_transfer_id
 */
export async function getCashfreePayoutStatus(transferId: string): Promise<CashfreeTransferResponse> {
  return cashfreeFetch(`/transfers?transfer_id=${encodeURIComponent(transferId)}`, {
    method: 'GET',
  });
}

/**
 * Verify Cashfree Webhook Signature (V2 - HMAC SHA-256 base64)
 */
export function verifyCashfreePayoutWebhookSignature(
  rawBody: string,
  signature: string,
  timestamp: string,
  secret?: string
): boolean {
  try {
    const webhookSecret = secret || getCashfreePayoutConfig().clientSecret;
    if (!signature || !timestamp || !webhookSecret) return false;

    const signatureData = `${timestamp}${rawBody}`;
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(signatureData)
      .digest('base64');

    const expectedBuffer = Buffer.from(expectedSignature, 'base64');
    const signatureBuffer = Buffer.from(signature, 'base64');

    if (expectedBuffer.length !== signatureBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  } catch (err) {
    console.error('[Cashfree Webhook Verification Error]:', err);
    return false;
  }
}


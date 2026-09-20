import { NextRequest } from 'next/server';
import { POST as handleWebhook } from '@/app/api/webhooks/razorpay/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return handleWebhook(req);
}

/**
 * GET /api/cashify/price
 *
 * Fetches real resale price from Cashify for a given device.
 * Works on Vercel — tries REST API first (free tier), then Puppeteer (Pro).
 *
 * Query params:
 *   brand     - e.g. "Apple"
 *   model     - e.g. "iPhone 13"
 *   storage   - e.g. "128GB"
 *   condition - "excellent" | "good" | "average"
 */

import { NextRequest } from 'next/server';
import { jsonResponse } from '@/lib/api';
import { getCashifyPrice } from '@/lib/cashify-scraper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel Pro: 60s; Hobby: 10s (API-only strategy will still work)

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const brand     = searchParams.get('brand')     || '';
  const model     = searchParams.get('model')     || '';
  const storage   = searchParams.get('storage')   || '';
  const condition = searchParams.get('condition') || 'good';

  if (!brand || !model || !storage) {
    return jsonResponse(
      { error: 'Missing required params: brand, model, storage' },
      400
    );
  }

  try {
    const result = await getCashifyPrice(brand, model, storage, condition);

    return jsonResponse({
      success: true,
      ...result,
      device: { brand, model, storage, condition },
    });
  } catch (err: any) {
    console.error('[/api/cashify/price] Error:', err);
    return jsonResponse({ error: 'Failed to fetch Cashify price', price: null }, 500);
  }
}

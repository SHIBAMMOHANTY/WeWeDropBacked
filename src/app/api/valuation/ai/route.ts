import { NextRequest } from 'next/server';
import { jsonResponse } from '@/lib/api';
import { calculateReCommerceValuation, ValuationEngineInput, normalizeRom } from '@/services/aiValuationEngine';
import { getCashifyPrice } from '@/lib/cashify-scraper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function POST(req: NextRequest) {
  try {
    const body: ValuationEngineInput = await req.json();

    if (!body.modelCode || !body.brand || !body.launchPrice || !body.launchDate) {
      return jsonResponse(
        {
          error: 'Missing required parameters. Expected modelCode, brand, launchPrice, launchDate, reportedRamBytes, reportedRomBytes.',
        },
        400
      );
    }

    // Fetch live market / DB base price if available
    let basePriceOverride = body.basePriceOverride;
    if (!basePriceOverride) {
      try {
        const cashifyRes = await getCashifyPrice(
          body.brand,
          body.friendlyModelName || body.modelCode,
          `${normalizeRom(body.reportedRomBytes)}GB`,
          'excellent'
        );
        if (cashifyRes.price && cashifyRes.price > 0) {
          basePriceOverride = cashifyRes.price;
        }
      } catch (e) {
        console.warn('Cashify price fetch warning:', e);
      }
    }

    const valuation = calculateReCommerceValuation({
      ...body,
      basePriceOverride,
    });
    return jsonResponse(valuation, 200);
  } catch (err: any) {
    console.error('[/api/valuation/ai] Error:', err);
    return jsonResponse({ error: err.message || 'Internal server error' }, 500);
  }
}

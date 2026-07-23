import { NextRequest } from 'next/server';
import { jsonResponse } from '@/lib/api';
import { calculateReCommerceValuation, ValuationEngineInput } from '@/services/aiValuationEngine';
import { getCashifyPrice } from '@/lib/cashify-scraper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const brand = searchParams.get('brand');
    const model = searchParams.get('model') || searchParams.get('q');
    const storage = searchParams.get('storage') ? parseInt(searchParams.get('storage')!) : 128;
    const ram = searchParams.get('ram') ? parseInt(searchParams.get('ram')!) : 8;

    if (!brand || !model) {
      return jsonResponse(
        { error: 'Missing required query parameters: brand and model (or q)' },
        400
      );
    }

    let basePriceOverride: number | undefined = undefined;
    try {
      const cashifyRes = await getCashifyPrice(brand, model, `${storage}GB`, 'good');
      if (cashifyRes.price && cashifyRes.price > 0) {
        basePriceOverride = cashifyRes.price;
      }
    } catch (e) {
      console.warn('Cashify price fetch warning:', e);
    }

    const valuation = calculateReCommerceValuation({
      modelCode: model,
      brand,
      launchPrice: basePriceOverride ? basePriceOverride * 2 : 25000,
      launchDate: '2023-01-15',
      reportedRamBytes: ram,
      reportedRomBytes: storage,
      friendlyModelName: model,
      basePriceOverride,
    });

    return jsonResponse(
      {
        success: true,
        device: {
          brand,
          model,
          ram: `${ram}GB`,
          storage: `${storage}GB`,
        },
        basePrice: valuation.valuationBreakdown?.basePrice || 0,
        basePriceFormatted: `₹${(valuation.valuationBreakdown?.basePrice ?? 0).toLocaleString('en-IN')}`,
        platformMatches: {
          cashify: basePriceOverride || valuation.valuationBreakdown?.basePrice || 0,
        },
        valuationBreakdown: valuation.valuationBreakdown,
      },
      200
    );
  } catch (err: any) {
    console.error('[/api/valuation/ai GET] Error:', err);
    return jsonResponse({ error: err.message || 'Internal server error' }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: ValuationEngineInput = await req.json();

    if (!body.modelCode || !body.brand) {
      return jsonResponse(
        {
          error: 'Missing required parameters: brand and modelCode are required.',
        },
        400
      );
    }

    let basePriceOverride = body.basePriceOverride;
    if (!basePriceOverride) {
      try {
        const cashifyRes = await getCashifyPrice(
          body.brand,
          body.friendlyModelName || body.modelCode,
          `${body.reportedRomBytes || 128}GB`,
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
      launchPrice: basePriceOverride ? basePriceOverride * 2 : 25000,
      launchDate: '2023-01-15',
      reportedRamBytes: 8,
      reportedRomBytes: 128,
      ...body,
      basePriceOverride,
    });

    const finalQuote = valuation.valuationBreakdown?.finalQuote ?? 0;
    const basePrice = valuation.valuationBreakdown?.basePrice ?? 0;

    return jsonResponse(
      {
        success: true,
        exactValuation: {
          finalQuote,
          formattedQuote: `₹${finalQuote.toLocaleString('en-IN')}`,
          basePrice,
        },
        platformComparisons: {
          cashifyBaseline: basePriceOverride || basePrice,
        },
        ...valuation,
      },
      200
    );
  } catch (err: any) {
    console.error('[/api/valuation/ai POST] Error:', err);
    return jsonResponse({ error: err.message || 'Internal server error' }, 500);
  }
}

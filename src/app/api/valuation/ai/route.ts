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

    // Dynamic market lookup
    const cashifyRes = await getCashifyPrice(brand, model, `${storage}GB`, 'good');
    const computedPrice = cashifyRes.price;

    const valuation = calculateReCommerceValuation({
      modelCode: model,
      brand,
      launchPrice: computedPrice ? computedPrice * 2 : 25000,
      launchDate: '2023-01-15',
      reportedRamBytes: ram,
      reportedRomBytes: storage,
      friendlyModelName: model,
      basePriceOverride: computedPrice || undefined,
    });

    const finalPrice = computedPrice || valuation.valuationBreakdown.finalCashQuote || 500;

    return jsonResponse(
      {
        success: true,
        device: {
          brand,
          model,
          ram: `${ram}GB`,
          storage: `${storage}GB`,
        },
        basePrice: finalPrice,
        basePriceFormatted: `₹${finalPrice.toLocaleString('en-IN')}`,
        platformMatches: {
          cashify: finalPrice,
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
          'good'
        );
        if (cashifyRes.price && cashifyRes.price > 0) {
          basePriceOverride = cashifyRes.price;
        }
      } catch (e) {
        console.warn('Cashify price fetch warning:', e);
      }
    }

    const valuation = calculateReCommerceValuation({
      launchPrice: body.launchPrice || (basePriceOverride ? basePriceOverride * 2 : 25000),
      launchDate: body.launchDate || '2023-01-15',
      reportedRamBytes: body.reportedRamBytes || 6,
      reportedRomBytes: body.reportedRomBytes || 128,
      ...body,
      basePriceOverride,
    });

    const finalPrice = basePriceOverride || valuation.valuationBreakdown.finalCashQuote || 500;

    return jsonResponse(
      {
        success: true,
        exactValuation: {
          finalQuote: finalPrice,
          formattedQuote: `₹${finalPrice.toLocaleString('en-IN')}`,
          basePrice: finalPrice,
        },
        platformComparisons: {
          cashifyBaseline: basePriceOverride || finalPrice,
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

import { NextRequest } from 'next/server';
import { jsonResponse } from '@/lib/api';
import { calculateReCommerceValuation, ValuationEngineInput } from '@/services/aiValuationEngine';
import { getCashifyPrice } from '@/lib/cashify-scraper';
import { PricingService } from '@/services/pricing.service';

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
    const storage = searchParams.get('storage') || '128GB';
    const storageGb = parseInt(storage) || 128;
    const ram = searchParams.get('ram') ? parseInt(searchParams.get('ram')!) : 8;

    if (!brand || !model) {
      return jsonResponse(
        { error: 'Missing required query parameters: brand and model (or q)' },
        400
      );
    }

    // 1. Fetch from live scraper / database pricing pipeline
    let resolvedBasePrice = 0;

    const cashifyRes = await getCashifyPrice(brand, model, storage.endsWith('GB') ? storage : `${storage}GB`, 'good');
    if (cashifyRes.price && cashifyRes.price > 0) {
      resolvedBasePrice = cashifyRes.price;
    } else {
      // Direct pipeline query through pricing.service
      const legacyCalc = await PricingService.calculateQuote({
        brand,
        model,
        storage: storage.endsWith('GB') ? storage : `${storage}GB`,
        condition: 'good',
      });
      if (legacyCalc.estimatedPrice && legacyCalc.estimatedPrice > 0) {
        resolvedBasePrice = legacyCalc.estimatedPrice;
      }
    }

    let realLaunchPrice = cashifyRes.launchPrice;
    if (!realLaunchPrice && resolvedBasePrice > 0) {
      realLaunchPrice = Math.round(resolvedBasePrice * 2);
    }

    const valuation = calculateReCommerceValuation({
      modelCode: model,
      brand,
      launchPrice: realLaunchPrice || 25000,
      launchDate: '2023-01-15',
      reportedRamBytes: ram,
      reportedRomBytes: storageGb,
      friendlyModelName: model,
      basePriceOverride: resolvedBasePrice > 0 ? resolvedBasePrice : undefined,
    });

    const finalPrice = resolvedBasePrice > 0 
      ? resolvedBasePrice 
      : (valuation.valuationBreakdown?.finalCashQuote || valuation.valuationBreakdown?.depreciatedBaseValue || 9500);

    return jsonResponse(
      {
        success: true,
        device: {
          brand,
          model,
          ram: `${ram}GB`,
          storage: `${storageGb}GB`,
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

    let resolvedBasePrice = body.basePriceOverride;
    let realLaunchPrice: number | undefined = undefined;

    if (!resolvedBasePrice) {
      try {
        const cashifyRes = await getCashifyPrice(
          body.brand,
          body.friendlyModelName || body.modelCode,
          `${body.reportedRomBytes || 128}GB`,
          'good'
        );
        if (cashifyRes.price && cashifyRes.price > 0) {
          resolvedBasePrice = cashifyRes.price;
          realLaunchPrice = cashifyRes.launchPrice;
        } else {
          const legacyCalc = await PricingService.calculateQuote({
            brand: body.brand,
            model: body.friendlyModelName || body.modelCode,
            storage: `${body.reportedRomBytes || 128}GB`,
            condition: 'good',
          });
          if (legacyCalc.estimatedPrice && legacyCalc.estimatedPrice > 0) {
            resolvedBasePrice = legacyCalc.estimatedPrice;
          }
        }
      } catch (e) {
        console.warn('Price resolution warning:', e);
      }
    }

    if (!realLaunchPrice && resolvedBasePrice) {
      realLaunchPrice = Math.round(resolvedBasePrice * 2);
    }

    const valuation = calculateReCommerceValuation({
      launchPrice: realLaunchPrice || 25000,
      launchDate: body.launchDate || '2023-01-15',
      reportedRamBytes: body.reportedRamBytes || 6,
      reportedRomBytes: body.reportedRomBytes || 128,
      ...body,
      basePriceOverride: resolvedBasePrice,
    });

    const finalPrice = resolvedBasePrice || valuation.valuationBreakdown?.finalCashQuote || 9500;

    return jsonResponse(
      {
        success: true,
        exactValuation: {
          finalQuote: finalPrice,
          formattedQuote: `₹${finalPrice.toLocaleString('en-IN')}`,
          basePrice: finalPrice,
        },
        platformComparisons: {
          cashifyBaseline: finalPrice,
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

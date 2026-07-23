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
    const defects = (searchParams.get('defects') || '')
      .split(',')
      .map((defect) => defect.trim())
      .filter(Boolean);

    if (!brand || !model) {
      return jsonResponse(
        { error: 'Missing required query parameters: brand and model (or q)' },
        400
      );
    }

    // 1. Fetch from live scraper / database pricing pipeline
    let resolvedBasePrice = 0;
    let realLaunchPrice: number | undefined;
    let priceSource = 'unresolved';

    const cashifyRes = await getCashifyPrice(brand, model, storage.endsWith('GB') ? storage : `${storage}GB`, 'good');
    if (cashifyRes.price && cashifyRes.price > 0) {
      resolvedBasePrice = cashifyRes.price;
      realLaunchPrice = cashifyRes.launchPrice;
      priceSource = cashifyRes.source;
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
        realLaunchPrice = legacyCalc.launchPrice;
        priceSource = legacyCalc.priceSource;
      }
    }

    const valuation = calculateReCommerceValuation({
      modelCode: model,
      brand,
      launchPrice: realLaunchPrice || resolvedBasePrice,
      // A market-base quote does not require a synthetic launch date. The
      // date only affects the fallback depreciation calculation.
      launchDate: new Date().toISOString().slice(0, 10),
      reportedRamBytes: ram,
      reportedRomBytes: storageGb,
      friendlyModelName: model,
      basePriceOverride: resolvedBasePrice > 0 ? resolvedBasePrice : undefined,
      defects,
    });

    const finalPrice = valuation.valuationBreakdown.finalCashQuote;

    return jsonResponse(
      {
        success: true,
        device: {
          brand,
          model,
          ram: `${ram}GB`,
          storage: `${storageGb}GB`,
        },
        basePrice: valuation.valuationBreakdown.depreciatedBaseValue,
        finalQuote: finalPrice,
        priceSource,
        basePriceFormatted: `₹${valuation.valuationBreakdown.depreciatedBaseValue.toLocaleString('en-IN')}`,
        platformMatches: {
          cashify: resolvedBasePrice || null,
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
            realLaunchPrice = legacyCalc.launchPrice;
          }
        }
      } catch (e) {
        console.warn('Price resolution warning:', e);
      }
    }

    const valuation = calculateReCommerceValuation({
      ...body,
      launchPrice: realLaunchPrice || resolvedBasePrice || 0,
      launchDate: body.launchDate || new Date().toISOString().slice(0, 10),
      reportedRamBytes: body.reportedRamBytes || 6,
      reportedRomBytes: body.reportedRomBytes || 128,
      basePriceOverride: resolvedBasePrice,
    });

    const finalPrice = valuation.valuationBreakdown.finalCashQuote;

    return jsonResponse(
      {
        success: true,
        exactValuation: {
          finalQuote: finalPrice,
          formattedQuote: `₹${finalPrice.toLocaleString('en-IN')}`,
          basePrice: valuation.valuationBreakdown.depreciatedBaseValue,
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

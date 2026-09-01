import { jsonResponse } from '@/lib/api';
import { getCashifyPrice } from '@/lib/cashify-scraper';
import {
  calculateReCommerceValuation,
  ValuationEngineInput,
} from '@/services/aiValuationEngine';
import { PricingService } from '@/services/pricing.service';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Normalize storage values.
 * Examples:
 *  "256GB" -> 256
 *  "256"   -> 256
 *  221.4   -> 256 (device-reported usable storage)
 */
function normalizeStorageGb(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 128;

  const parsed = parseFloat(String(value).replace(/[^0-9.]/g, ''));

  if (!Number.isFinite(parsed) || parsed <= 0) return 128;

  // Android reports usable storage, not advertised capacity.
  // 221.4 GB usable storage is normally a 256 GB device.
  if (parsed >= 200 && parsed <= 240) return 256;
  if (parsed >= 110 && parsed <= 130) return 128;
  if (parsed >= 50 && parsed <= 70) return 64;
  if (parsed >= 430 && parsed <= 520) return 512;

  return Math.round(parsed);
}

/**
 * Normalize RAM.
 * Android may report 7.2 GB on an 8 GB device.
 */
function normalizeRamGb(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 8;

  const parsed = parseFloat(String(value).replace(/[^0-9.]/g, ''));

  if (!Number.isFinite(parsed) || parsed <= 0) return 8;

  if (parsed >= 7 && parsed <= 7.9) return 8;
  if (parsed >= 11 && parsed <= 12.9) return 12;
  if (parsed >= 15 && parsed <= 16.9) return 16;

  return Math.round(parsed);
}

/**
 * Apply only actual condition/defect deductions.
 *
 * IMPORTANT:
 * Do not apply generic depreciation here when the base price
 * already comes from a current market/buyback source such as Cashify.
 */
function calculateConditionAdjustedPrice(
  marketPrice: number,
  defects: string[]
): number {
  if (!marketPrice || marketPrice <= 0) return 0;

  let price = marketPrice;

  const normalizedDefects = defects.map((d) =>
    d.toLowerCase().trim().replace(/\s+/g, '_')
  );

  const has = (...names: string[]) =>
    names.some((name) => normalizedDefects.includes(name));

  // Screen
  if (
    has(
      'screen_crack',
      'screen_broken',
      'display_crack',
      'display_broken'
    )
  ) {
    price *= 0.80;
  }

  // Display problems
  if (
    has(
      'display_issue',
      'display_problem',
      'touch_issue',
      'touch_not_working'
    )
  ) {
    price *= 0.70;
  }

  // Body damage
  if (
    has(
      'body_damage',
      'back_damage',
      'frame_damage',
      'major_scratches',
      'heavy_scratches'
    )
  ) {
    price *= 0.90;
  }

  // Battery
  if (
    has(
      'battery_issue',
      'battery_problem',
      'battery_drain'
    )
  ) {
    price *= 0.90;
  }

  // Camera
  if (
    has(
      'camera_issue',
      'camera_problem',
      'camera_not_working'
    )
  ) {
    price *= 0.85;
  }

  // Speaker / microphone
  if (
    has(
      'speaker_issue',
      'speaker_problem',
      'mic_issue',
      'microphone_issue'
    )
  ) {
    price *= 0.90;
  }

  // Charging
  if (
    has(
      'charging_issue',
      'charging_port_issue',
      'charger_port_issue'
    )
  ) {
    price *= 0.85;
  }

  // Fingerprint / biometric
  if (
    has(
      'fingerprint_issue',
      'fingerprint_not_working'
    )
  ) {
    price *= 0.90;
  }

  return Math.max(
    0,
    Math.round(price / 100) * 100
  );
}

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const brand = searchParams.get('brand');
    const model = searchParams.get('model') || searchParams.get('q');

    const storageParam = searchParams.get('storage') || '128GB';
    const ramParam = searchParams.get('ram') || '8';

    const storageGb = normalizeStorageGb(storageParam);
    const ramGb = normalizeRamGb(ramParam);

    const defects = (searchParams.get('defects') || '')
      .split(',')
      .map((defect) => defect.trim())
      .filter(Boolean);

    if (!brand || !model) {
      return jsonResponse(
        {
          error:
            'Missing required query parameters: brand and model (or q)',
        },
        400
      );
    }

    let resolvedBasePrice = 0;
    let realLaunchPrice: number | undefined;
    let priceSource = 'unresolved';

    const storageString = `${storageGb}GB`;

    /**
     * 1. Try live Cashify/current market price.
     */
    try {
      const cashifyRes = await getCashifyPrice(
        brand,
        model,
        storageString,
        'good'
      );

      if (cashifyRes.price && cashifyRes.price > 0) {
        resolvedBasePrice = cashifyRes.price;
        realLaunchPrice = cashifyRes.launchPrice;
        priceSource = cashifyRes.source || 'cashify';
      }
    } catch (error) {
      console.warn('Cashify price resolution failed:', error);
    }

    /**
     * 2. Fallback to PricingService.
     */
    if (resolvedBasePrice <= 0) {
      try {
        const legacyCalc = await PricingService.calculateQuote({
          brand,
          model,
          storage: storageString,
          condition: 'good',
        });

        if (
          legacyCalc.estimatedPrice &&
          legacyCalc.estimatedPrice > 0
        ) {
          resolvedBasePrice = legacyCalc.estimatedPrice;
          realLaunchPrice = legacyCalc.launchPrice;
          priceSource =
            legacyCalc.priceSource || 'pricing-service';
        }
      } catch (error) {
        console.warn(
          'PricingService price resolution failed:',
          error
        );
      }
    }

    /**
     * IMPORTANT:
     *
     * If we have a real current market price, do NOT send it through
     * generic depreciation again.
     *
     * Cashify/current-market price = already depreciated market value.
     */
    let finalPrice = 0;

    if (resolvedBasePrice > 0) {
      finalPrice = calculateConditionAdjustedPrice(
        resolvedBasePrice,
        defects
      );
    } else {
      /**
       * Only use the valuation engine when no market price is available.
       */
      const valuation = calculateReCommerceValuation({
        modelCode: model,
        brand,
        launchPrice: realLaunchPrice || 0,

        // Do not pretend the phone launched today.
        launchDate: undefined,

        reportedRamBytes: ramGb,
        reportedRomBytes: storageGb,

        friendlyModelName: model,

        defects,
      });

      finalPrice =
        valuation.valuationBreakdown.finalCashQuote;
    }

    const roundedFinalPrice =
      Math.round(finalPrice / 100) * 100;

    if (resolvedBasePrice <= 0 && (!realLaunchPrice || realLaunchPrice <= 0 || roundedFinalPrice <= 500)) {
      return jsonResponse(
        {
          success: false,
          error: 'Device not found',
          message: `Device valuation not found for ${brand} ${model}`,
        },
        404
      );
    }

    return jsonResponse(
      {
        success: true,

        device: {
          brand,
          model,

          // Correct advertised hardware configuration.
          ram: `${ramGb}GB`,
          storage: `${storageGb}GB`,
        },

        basePrice: resolvedBasePrice,

        finalQuote: roundedFinalPrice,

        priceSource,

        basePriceFormatted:
          resolvedBasePrice > 0
            ? `₹${resolvedBasePrice.toLocaleString('en-IN')}`
            : null,

        finalQuoteFormatted:
          `₹${roundedFinalPrice.toLocaleString('en-IN')}`,

        platformMatches: {
          cashify:
            priceSource !== 'failed' &&
              resolvedBasePrice > 0
              ? resolvedBasePrice
              : null,
        },

        valuationBreakdown: {
          marketPrice: resolvedBasePrice,
          defectAdjustment:
            resolvedBasePrice > 0
              ? resolvedBasePrice - roundedFinalPrice
              : 0,
          finalCashQuote: roundedFinalPrice,
        },
      },
      200
    );
  } catch (err: any) {
    console.error(
      '[/api/valuation/ai GET] Error:',
      err
    );

    return jsonResponse(
      {
        success: false,
        error: 'Device not found',
        message: err?.message || 'Device not found',
      },
      404
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: ValuationEngineInput = await req.json();

    if (!body.modelCode || !body.brand) {
      return jsonResponse(
        {
          error:
            'Missing required parameters: brand and modelCode are required.',
        },
        400
      );
    }

    /**
     * Normalize device configuration.
     */
    const ramGb = normalizeRamGb(
      body.reportedRamBytes
    );

    const storageGb = normalizeStorageGb(
      body.reportedRomBytes
    );

    let resolvedBasePrice =
      body.basePriceOverride || 0;

    let realLaunchPrice:
      | number
      | undefined = undefined;

    let priceSource = 'provided';

    /**
     * Get current market price if caller did not already provide one.
     */
    if (resolvedBasePrice <= 0) {
      try {
        const cashifyRes = await getCashifyPrice(
          body.brand,
          body.friendlyModelName || body.modelCode,
          `${storageGb}GB`,
          'good'
        );

        if (
          cashifyRes.price &&
          cashifyRes.price > 0
        ) {
          resolvedBasePrice = cashifyRes.price;
          realLaunchPrice =
            cashifyRes.launchPrice;
          priceSource =
            cashifyRes.source || 'cashify';
        }
      } catch (error) {
        console.warn(
          'Cashify POST lookup failed:',
          error
        );
      }
    }

    /**
     * PricingService fallback.
     */
    if (resolvedBasePrice <= 0) {
      try {
        const legacyCalc =
          await PricingService.calculateQuote({
            brand: body.brand,
            model:
              body.friendlyModelName ||
              body.modelCode,
            storage: `${storageGb}GB`,
            condition: 'good',
          });

        if (
          legacyCalc.estimatedPrice &&
          legacyCalc.estimatedPrice > 0
        ) {
          resolvedBasePrice =
            legacyCalc.estimatedPrice;

          realLaunchPrice =
            legacyCalc.launchPrice;

          priceSource =
            legacyCalc.priceSource ||
            'pricing-service';
        }
      } catch (error) {
        console.warn(
          'PricingService POST lookup failed:',
          error
        );
      }
    }

    let finalPrice = 0;

    /**
     * Current market price is the primary valuation.
     */
    if (resolvedBasePrice > 0) {
      finalPrice =
        calculateConditionAdjustedPrice(
          resolvedBasePrice,
          body.defects || []
        );
    } else {
      /**
       * Only fallback to AI valuation when market
       * pricing cannot be resolved.
       */
      const valuation =
        calculateReCommerceValuation({
          ...body,

          launchPrice:
            realLaunchPrice || 0,

          // Do not use today's date as launch date.
          launchDate:
            body.launchDate,

          reportedRamBytes: ramGb,

          reportedRomBytes: storageGb,

          basePriceOverride: undefined,
        });

      finalPrice =
        valuation.valuationBreakdown.finalCashQuote;
    }

    const roundedFinalPrice =
      Math.round(finalPrice / 100) * 100;

    if (resolvedBasePrice <= 0 && (!realLaunchPrice || realLaunchPrice <= 0 || roundedFinalPrice <= 500)) {
      return jsonResponse(
        {
          success: false,
          error: 'Device not found',
          message: `Device valuation not found for ${body.brand} ${body.friendlyModelName || body.modelCode}`,
        },
        404
      );
    }

    return jsonResponse(
      {
        success: true,

        exactValuation: {
          finalQuote: roundedFinalPrice,

          formattedQuote:
            `₹${roundedFinalPrice.toLocaleString(
              'en-IN'
            )}`,

          basePrice: resolvedBasePrice,

          marketPrice: resolvedBasePrice,

          priceSource,
        },

        device: {
          brand: body.brand,
          model:
            body.friendlyModelName ||
            body.modelCode,
          ram: `${ramGb}GB`,
          storage: `${storageGb}GB`,
        },

        platformComparisons: {
          cashifyBaseline:
            resolvedBasePrice > 0
              ? resolvedBasePrice
              : null,
        },

        valuationBreakdown: {
          marketPrice: resolvedBasePrice,

          defectAdjustment:
            resolvedBasePrice > 0
              ? resolvedBasePrice -
              roundedFinalPrice
              : 0,

          finalCashQuote:
            roundedFinalPrice,
        },
      },
      200
    );
  } catch (err: any) {
    console.error(
      '[/api/valuation/ai POST] Error:',
      err
    );

    return jsonResponse(
      {
        success: false,
        error: 'Device not found',
        message: err?.message || 'Device not found',
      },
      404
    );
  }
}
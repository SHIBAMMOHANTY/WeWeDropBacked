import { prisma } from '@/lib/prisma';

export interface QuoteCalculationRequest {
  brand: string;
  model: string;
  storage: string;
  condition: string;
  launchPrice?: number;
  modelSlug?: string;
  screenCracked?: boolean;
  batteryHealth?: number;
  cameraIssue?: boolean;
  fingerprintIssue?: boolean;
  faceIdIssue?: boolean;
  bodyDamage?: boolean;
  speakerIssue?: boolean;
  chargingPortIssue?: boolean;
  ram?: string;
  deviceAge?: string;
  screenIssue?: boolean;
  replacementScreen?: boolean;
  glassbroken?: boolean;
  heavyDiscoloration?: boolean;
  scratchOnScreen?: boolean;
  bodyHeavyScratch?: boolean;
  minorBodyScratch?: boolean;
  cameraGlassBroken?: boolean;
  simNotWorking?: boolean;
  frontCameraIssue?: boolean;
  backCameraIssue?: boolean;
  volumeButtonIssue?: boolean;
  wifiNotWorking?: boolean;
  silentButtonIssue?: boolean;
  powerButtonIssue?: boolean;
  audioReceiverIssue?: boolean;
  microphoneIssue?: boolean;
  bluetoothIssue?: boolean;
  vibrationIssue?: boolean;
  proximitySensorIssue?: boolean;
  hasChargerAndBox?: boolean;
  hasBill?: boolean;
  warrantyMonths?: number;
  [key: string]: any;
}

export interface QuoteCalculationResponse {
  success: boolean;
  estimatedPrice: number;
  launchPrice: number;
  priceSource: string;
  breakdown: {
    basePrice: number;
    deductions: Array<{ label: string; amount: number }>;
    bonuses: Array<{ label: string; amount: number }>;
    totalDeduction: number;
    totalBonus: number;
  };
  valuationBreakdown?: {
    finalQuote: number;
    basePrice: number;
    defectDeductionsTotal: number;
    appliedDeductions: Array<{ fault: string; penalty: number }>;
  };
  summary?: string;
}

function cleanModelName(model: string, brand: string): string {
  if (!model) return '';
  const regex = new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i');
  return model.replace(regex, '').trim();
}

function escapeMongoRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getCashifyPrice(...args: any[]): any {
  return null;
}

function detectRamFromRequest(...args: any[]): string {
  return args[0]?.ram || '8 GB';
}

async function fetchSpecsFromAPI(...args: any[]): Promise<any> {
  return null;
}

function getDepreciationRate(brand?: string, model?: string, ageYears: number = 1): number {
  const b = (brand || '').toLowerCase();
  const m = (model || '').toLowerCase();
  const isApple = b.includes('apple') || m.includes('iphone');
  if (ageYears <= 0) return isApple ? 0.85 : 0.75;
  if (ageYears === 1) return isApple ? 0.70 : 0.60;
  if (ageYears === 2) return isApple ? 0.58 : 0.45;
  if (ageYears === 3) return isApple ? 0.48 : 0.35;
  if (ageYears === 4) return isApple ? 0.38 : 0.28;
  return isApple ? 0.30 : 0.20;
}

function estimateDynamicMSRP(brand?: string, model?: string, storage?: string): number {
  const b = (brand || '').toLowerCase();
  const m = (model || '').toLowerCase();
  const s = (storage || '').toLowerCase();
  
  let baseMSRP = 25000;

  if (b.includes('apple') || m.includes('iphone')) {
    if (m.includes('pro max')) baseMSRP = 140000;
    else if (m.includes('pro')) baseMSRP = 120000;
    else if (m.includes('plus')) baseMSRP = 90000;
    else baseMSRP = 80000;
  } else if (b.includes('samsung')) {
    if (m.includes('fold')) baseMSRP = 150000;
    else if (m.includes('ultra')) baseMSRP = 125000;
    else if (m.includes('flip')) baseMSRP = 90000;
    else if (m.includes('s24') || m.includes('s23') || m.includes('s22')) baseMSRP = 75000;
    else baseMSRP = 30000;
  } else if (b.includes('oneplus')) {
    if (m.includes('open') || m.includes('12 pro') || m.includes('11 pro')) baseMSRP = 65000;
    else baseMSRP = 40000;
  } else if (b.includes('google') || b.includes('pixel')) {
    if (m.includes('pro')) baseMSRP = 90000;
    else baseMSRP = 55000;
  } else if (b.includes('xiaomi') || b.includes('mi')) {
    if (m.includes('ultra') || m.includes('14 pro') || m.includes('13 pro')) baseMSRP = 70000;
    else baseMSRP = 25000;
  }

  if (s.includes('512') || s.includes('1tb') || s.includes('1 tb')) {
    baseMSRP = Math.round(baseMSRP * 1.2);
  } else if (s.includes('256')) {
    baseMSRP = Math.round(baseMSRP * 1.1);
  }

  return baseMSRP;
}

function estimateDynamicYear(model?: string): number {
  const m = String(model || '');
  const match = m.match(/\b(202[0-6])\b/);
  if (match) return parseInt(match[1], 10);
  const numMatch = m.match(/\b(\d+)\b/);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    if (num === 17) return 2025;
    if (num === 16) return 2024;
    if (num === 15) return 2023;
    if (num === 14) return 2022;
    if (num === 13) return 2021;
  }
  return 2023;
}

function getiPhoneGeneration(...args: any[]): number {
  const model = String(args[0] || '');
  const match = model.match(/\b(\d+)\b/);
  return match ? parseInt(match[1]) : 13;
}

export class PricingService {
  static async calculateQuote(
    data: QuoteCalculationRequest
  ): Promise<QuoteCalculationResponse> {
    let basePriceExcellent = 0;
    let launchPrice = 0;
    let releaseYear = 2026;

    let priceSource:
      | 'database'
      | 'cashify'
      | 'api'
      | 'estimate' = 'estimate';

    const condition = data.condition
      .trim()
      .toLowerCase();

    if (
      !['excellent', 'good', 'average'].includes(
        condition
      )
    ) {
      throw new Error(
        `Invalid condition: '${data.condition}'`
      );
    }

    /*
     * IMPORTANT:
     *
     * Current market/Cashify price is already a resale price.
     * NEVER apply another generic 10% condition reduction
     * to it before defect deductions.
     */
    let hasConditionSpecificDatabasePrice = false;
    let isCurrentMarketPrice = false;

    const cleanedModel = cleanModelName(
      data.model,
      data.brand
    );

    const exactModel = escapeMongoRegex(
      data.model.trim()
    );

    const exactCleanedModel =
      escapeMongoRegex(cleanedModel);

    const exactBrandPrefixedModel =
      escapeMongoRegex(
        `${data.brand.trim()} ${cleanedModel}`
      );

    /*
     * ==========================================================
     * STEP 1 — EXACT DEVICE DATABASE LOOKUP
     * ==========================================================
     */

    const device =
      await prisma.deviceMaster.findFirst({
        where: {
          brand: {
            equals: data.brand.trim(),
            mode: 'insensitive',
          },

          OR: [
            {
              model: {
                equals: exactModel,
                mode: 'insensitive',
              },
            },
            {
              model: {
                equals: exactCleanedModel,
                mode: 'insensitive',
              },
            },
            {
              model: {
                equals: exactBrandPrefixedModel,
                mode: 'insensitive',
              },
            },
            {
              model: {
                contains: exactCleanedModel,
                mode: 'insensitive',
              },
            },
          ],

          storage: {
            equals: data.storage.trim(),
            mode: 'insensitive',
          },

          isActive: true,
        },
      });

    if (device) {
      /*
       * DeviceMaster contains an actual admin-managed
       * condition price, so this is already condition-specific.
       */
      basePriceExcellent =
        condition === 'excellent'
          ? device.basePriceExcellent
          : condition === 'good'
            ? device.basePriceGood
            : device.basePriceAverage;

      hasConditionSpecificDatabasePrice = true;

      launchPrice =
        data.launchPrice ||
        device.launchPrice;

      priceSource = 'database';

      if (device.launchDate) {
        const y = parseInt(
          device.launchDate.split('-')[0],
          10
        );

        releaseYear = isNaN(y)
          ? 2024
          : y;
      }

      console.log(
        `[PricingService] DeviceMaster match: ` +
        `${data.brand} ${data.model} ${data.storage} ` +
        `→ ₹${basePriceExcellent}`
      );
    }

    /*
     * ==========================================================
     * STEP 2 — CURRENT MARKET / CASHIFY
     * ==========================================================
     *
     * If database has no exact device price, use current
     * market pricing.
     */

    if (!basePriceExcellent) {
      try {
        const cashify: any =
          await Promise.race([
            getCashifyPrice(
              data.brand,
              data.model,
              data.storage,
              'good',
              {
                ram: detectRamFromRequest(data),
                modelId:
                  (data as any).modelId ||
                  undefined,
              }
            ),

            new Promise<null>(
              (resolve) =>
                setTimeout(
                  () => resolve(null),
                  12000
                )
            ),
          ]);

        if (
          cashify &&
          typeof cashify === 'object' &&
          cashify.price &&
          cashify.price > 0
        ) {
          basePriceExcellent =
            cashify.price;

          launchPrice =
            cashify.launchPrice || 0;

          /*
           * Both market and cashify represent an
           * already-current resale/buyback value.
           */
          if (
            cashify.source === 'market' ||
            cashify.source === 'cache'
          ) {
            priceSource = 'cashify';
            isCurrentMarketPrice = true;
          } else {
            priceSource = 'cashify';
          }

          console.log(
            `[PricingService] Market price used: ` +
            `${data.brand} ${data.model} ` +
            `${data.storage} → ` +
            `₹${cashify.price} ` +
            `(source: ${cashify.source})`
          );
        }
      } catch (e) {
        console.warn(
          '[PricingService] Cashify fetch failed:',
          e
        );
      }
    }

    /*
     * ==========================================================
     * STEP 3 — PHONE SPECS API
     * ==========================================================
     */

    if (!basePriceExcellent) {
      const apiSpecs =
        await fetchSpecsFromAPI(
          data.brand,
          data.model,
          data.modelSlug
        );

      if (
        apiSpecs?.launchPrice &&
        apiSpecs.launchPrice > 0
      ) {
        launchPrice =
          apiSpecs.launchPrice;

        releaseYear =
          apiSpecs.releaseYear || 2026;

        priceSource = 'api';
      } else if (
        data.launchPrice &&
        data.launchPrice > 0
      ) {
        launchPrice =
          data.launchPrice;

        priceSource = 'api';
      }

      if (launchPrice > 0) {
        const ageYears = Math.max(
          0,
          new Date().getFullYear() -
          releaseYear
        );

        const mult =
          getDepreciationRate(
            data.brand,
            data.model,
            ageYears
          );

        basePriceExcellent =
          Math.round(
            launchPrice * mult
          );

        console.log(
          `[PricingService] API estimate: ` +
          `launch ₹${launchPrice}, ` +
          `year ${releaseYear}, ` +
          `→ ₹${basePriceExcellent}`
        );
      }
    }

    /*
     * ==========================================================
     * STEP 4 — REQUEST BASE PRICE / DYNAMIC FALLBACK
     * ==========================================================
     */

    let hasRequestBasePrice = false;
    if (!basePriceExcellent && data.basePrice && data.basePrice > 0) {
      basePriceExcellent = data.basePrice;
      launchPrice = data.launchPrice || data.basePrice;
      priceSource = 'estimate';
      hasRequestBasePrice = true;
      console.log(
        `[PricingService] Request basePrice fallback: ` +
        `₹${basePriceExcellent}`
      );
    }

    if (!basePriceExcellent) {
      const estimatedMSRP =
        estimateDynamicMSRP(
          data.brand,
          data.model,
          data.storage
        );

      const estimatedYear =
        estimateDynamicYear(
          data.model
        );

      const currentYear =
        new Date().getFullYear();

      const estimatedAgeYears =
        Math.max(
          0,
          currentYear - estimatedYear
        );

      const clampedAge =
        Math.min(
          estimatedAgeYears,
          5
        );

      const mult =
        getDepreciationRate(
          data.brand,
          data.model,
          clampedAge
        );

      basePriceExcellent =
        Math.round(
          estimatedMSRP * mult
        );

      launchPrice =
        estimatedMSRP;

      priceSource = 'estimate';

      console.log(
        `[PricingService] Dynamic fallback: ` +
        `MSRP=${estimatedMSRP}, ` +
        `year=${estimatedYear}, ` +
        `mult=${mult}, ` +
        `price=${basePriceExcellent}`
      );
    }

    /*
     * ==========================================================
     * CONDITION PRICE
     * ==========================================================
     */

    let basePrice =
      basePriceExcellent;

    if (
      !hasConditionSpecificDatabasePrice &&
      !isCurrentMarketPrice &&
      !hasRequestBasePrice
    ) {
      if (condition === 'good') {
        basePrice =
          Math.round(
            basePriceExcellent * 0.9
          );
      } else if (
        condition === 'average'
      ) {
        basePrice =
          Math.round(
            basePriceExcellent * 0.78
          );
      }
    }

    console.log(
      `[PricingService] Base price: ` +
      `₹${basePrice} ` +
      `(source=${priceSource}, ` +
      `market=${isCurrentMarketPrice})`
    );

    /*
     * ==========================================================
     * EXISTING DEDUCTION / BONUS ENGINE
     * ==========================================================
     */

    const isApple =
      data.brand
        .toLowerCase()
        .includes('apple') ||
      data.model
        .toLowerCase()
        .includes('iphone');

    const iPhoneGen =
      isApple
        ? getiPhoneGeneration(
          data.model
        )
        : 0;

    const deductions: {
      label: string;
      amount: number;
    }[] = [];

    const bonuses: {
      label: string;
      amount: number;
    }[] = [];

    const deduct = (
      label: string,
      pct: number
    ) => {
      const amount =
        Math.round(
          basePrice * pct
        );

      if (amount > 0) {
        deductions.push({
          label,
          amount,
        });
      }
    };

    const bonus = (
      label: string,
      pct: number
    ) => {
      const amount =
        Math.round(
          basePrice * pct
        );

      if (amount > 0) {
        bonuses.push({
          label,
          amount,
        });
      }
    };

    /*
     * ==========================================================
     * CASHIFY CALIBRATED DEDUCTION & SCRAP FLOOR ENGINE
     * ==========================================================
     */

    const isCallsDead = Boolean(
      data.simNotWorking ||
      data.calls_failed ||
      data.canMakeCalls === false ||
      data.cellularIssue ||
      data.networkIssue
    );

    if (isCallsDead) {
      const scrapFloor = (isApple || basePrice > 20000) ? 1180 : 760;
      const deductionAmount = Math.max(0, basePrice - scrapFloor);

      return {
        success: true,
        estimatedPrice: scrapFloor,
        launchPrice,
        priceSource,
        breakdown: {
          basePrice,
          deductions: [{ label: 'Calls / Cellular Network Failed (Scrap Floor)', amount: deductionAmount }],
          bonuses: [],
          totalDeduction: deductionAmount,
          totalBonus: 0,
        },
      };
    }

    /*
     * SCREEN
     */

    if (data.touchScreenWorking === false || data.touchIssue) {
      deduct('Touch Screen Faulty', 0.515);
    } else if (data.replacementScreen || data.screenOriginal === false) {
      deduct('Replacement Screen (Non-Original)', isApple ? 0.3195 : 0.3225);
    } else if (data.glassbroken || data.screenCracked || data.screenGlassBroken) {
      deduct('Glass Broken / Cracked', isApple ? 0.2928 : 0.3761);
    } else if (data.heavyDiscoloration || data.screenIssue || data.deadSpots) {
      deduct('Heavy Discoloration / Dead Spot', 0.1264);
    } else if (data.scratchOnScreen) {
      deduct('Scratch on Screen', 0.0512);
    }

    /*
     * BODY
     */

    if (data.bodyDamage || data.dentBody) {
      deduct('Body Dents / Bent Frame', 0.25);
    } else if (data.bodyHeavyScratch || data.heavyScratchBody) {
      deduct('Heavy Body Scratches', 0.12);
    } else if (data.minorBodyScratch) {
      deduct('Minor Body Scratches', 0.0512);
    }

    if (data.cameraGlassBroken || data.cameraGlassCrack) {
      deduct('Camera Glass Broken', isApple ? 0.128 : 0.1264);
    }

    if (data.isPhoneRepaired || data.phoneRepaired) {
      deduct('Phone Previously Repaired', 0.08);
    }

    /*
     * CAMERAS
     */

    if (data.frontCameraIssue && data.backCameraIssue) {
      deduct('Front + Back Camera Not Working', 0.55);
    } else if (data.backCameraIssue || data.cameraIssue) {
      deduct('Back Camera Not Working', isApple ? 0.128 : 0.1264);
    } else if (data.frontCameraIssue) {
      deduct('Front Camera Not Working', isApple ? 0.128 : 0.1264);
    }

    /*
     * FUNCTIONAL
     */

    if (data.fingerprintIssue || data.faceIdIssue) {
      deduct('Biometrics / Face ID Faulty', 0.35);
    }

    if (data.wifiNotWorking || data.bluetoothIssue) {
      deduct('Wi-Fi / Bluetooth Not Working', 0.35);
    }

    if (data.speakerIssue || data.audioReceiverIssue || data.microphoneIssue || data.vibrationIssue) {
      deduct('Speaker / Mic / Earpiece Faulty', 0.25);
    }

    if (data.volumeButtonIssue || data.silentButtonIssue || data.powerButtonIssue) {
      deduct('Physical Buttons Faulty', 0.25);
    }

    if (data.chargingPortIssue) {
      deduct('Charging Port Faulty', 0.25);
    }

    if (data.proximitySensorIssue) {
      deduct('Proximity Sensor Not Working', 0.10);
    }

    /*
     * BATTERY
     */

    const batteryHealth = data.batteryHealth ?? 100;
    if (batteryHealth < 80) {
      deduct('Battery Health < 80%', 0.128);
    } else if (batteryHealth < 90) {
      deduct('Battery Health 80–90%', 0.05);
    }

    /*
     * ACCESSORIES & DOCUMENTATION
     */

    if (data.hasChargerAndBox === false || (data.hasBox === false && data.hasCharger === false)) {
      deduct('Missing Original Box & Charger', 0.10);
    } else if (data.hasBox === false) {
      deduct('Missing Original Box', 0.05);
    } else if (data.hasCharger === false) {
      deduct('Missing Original Charger', 0.05);
    }

    if (data.hasBill === false && !data.isUnderWarranty) {
      deduct('Missing Bill / Out of Warranty', 0.10);
    }

    // Age factor
    const ageStr = (data.deviceAge || '').toLowerCase();
    const ageMonths = data.deviceAgeMonths ?? 0;

    if (
      ageStr === '3-4y' ||
      ageStr === '2-3y' ||
      ageStr === '1-2y' ||
      ageStr === 'above11' ||
      ageStr === 'above-11' ||
      ageStr === 'above-11m' ||
      ageMonths > 24
    ) {
      deduct('Device Age > 11 Months', 0.05);
    } else if (
      ageStr === '6to11' ||
      ageStr === '6-11' ||
      (ageMonths > 11 && ageMonths <= 24)
    ) {
      deduct('Device Age 6-11 Months', 0.034);
    } else if (
      ageStr === '3to6' ||
      ageStr === '3-6' ||
      (ageMonths > 6 && ageMonths <= 11)
    ) {
      deduct('Device Age 3-6 Months', 0.02);
    }

    /*
     * ==========================================================
     * FINAL
     * ==========================================================
     */

    const totalDeduction = deductions.reduce(
      (sum, item) => sum + item.amount,
      0
    );

    const totalBonus = bonuses.reduce(
      (sum, item) => sum + item.amount,
      0
    );

    let minFloor = 1160;
    if (isApple) {
      minFloor = Math.max(1600, Math.round(basePrice * 0.0734));
    } else if (basePrice < 8000) {
      minFloor = 750;
    } else if (basePrice <= 25000) {
      minFloor = 1160;
    } else {
      minFloor = Math.max(1600, Math.round(basePrice * 0.0554));
    }

    const rawEstimated = Math.max(minFloor, Math.round((basePrice - totalDeduction + totalBonus) / 10) * 10);
    const estimatedPrice = Math.min(basePrice, rawEstimated);

    console.log(
      `[PricingService] FINAL: ` +
      `${data.brand} ${data.model} ` +
      `${data.storage} → ₹${estimatedPrice}`
    );

    return {
      success: true,
      estimatedPrice,
      launchPrice,
      priceSource,
      breakdown: {
        basePrice,
        deductions,
        bonuses,
        totalDeduction,
        totalBonus,
      },
      valuationBreakdown: {
        finalQuote: estimatedPrice,
        basePrice,
        defectDeductionsTotal: totalDeduction,
        appliedDeductions: deductions.map(d => ({ fault: d.label, penalty: d.amount })),
      },
      summary: `Estimated buyback value for ${data.brand} ${data.model} (${data.storage}) is ₹${estimatedPrice.toLocaleString('en-IN')}.`,
    };
  }
}
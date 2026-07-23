import { prisma } from '@/lib/prisma';
import { getCashifyPrice, getDepreciationRate } from '@/lib/cashify-scraper';

// ─────────────────────────────────────────────────────────────
// REQUEST / RESPONSE TYPES
// ─────────────────────────────────────────────────────────────

export interface QuoteCalculationRequest {
  brand: string;
  model: string;
  storage: string;
  condition: 'excellent' | 'good' | 'average' | string;

  // Screen
  screenIssue?: boolean;           // #1  - 75%
  replacementScreen?: boolean;     // #2  - 55%  (non-original screen)
  glassbroken?: boolean;           // #4  - 60%
  heavyDiscoloration?: boolean;    // #6  - 70%
  scratchOnScreen?: boolean;       // #9  - 40%

  // Body
  bodyHeavyScratch?: boolean;      // #5  - 25%
  bodyDamage?: boolean;            // #7  - 30%
  minorBodyScratch?: boolean;      // #8  - 25%  (1-2 dents/scratches)

  // SIM
  simNotWorking?: boolean;         // #3  - flat ₹1200 (iPhone 13+), ₹800 (below)

  // Warranty (these add bonus, not deductions — % of base)
  warrantyMonths?: number;         // #10 - <3m=5%, 3-6m=7.5%, 6-11m=10%

  // Accessories (bonus)
  hasChargerAndBox?: boolean;      // #11 - +5%
  hasBill?: boolean;               // #12 - +5%

  // Cameras
  frontCameraIssue?: boolean;      // #13 - 35%
  backCameraIssue?: boolean;       // #14 - 40%; both=55%

  // Functional
  fingerprintIssue?: boolean;      // #15 - 25%
  volumeButtonIssue?: boolean;     // #16 - 30%
  wifiNotWorking?: boolean;        // #17 - 60%
  speakerIssue?: boolean;          // #18 - 30%
  silentButtonIssue?: boolean;     // #19 - 30%
  faceIdIssue?: boolean;           // #20 - 45%
  powerButtonIssue?: boolean;      // #21 - 30%
  chargingPortIssue?: boolean;     // #22 - 30%
  audioReceiverIssue?: boolean;    // #23 - 30%
  cameraGlassBroken?: boolean;     // #24 - 30%
  microphoneIssue?: boolean;       // #25 - 30%
  bluetoothIssue?: boolean;        // #26 - 55%
  vibrationIssue?: boolean;        // #27 - 30%
  proximitySensorIssue?: boolean;  // #28 - 30%

  // Battery
  batteryHealth?: number;          // #29/<80%=35%, #30/80-90%=30%

  // Legacy fields (kept for backward compat)
  screenCracked?: boolean;
  cameraIssue?: boolean;
  batteryDeductionOverride?: number;

  modelSlug?: string;
  launchPrice?: number;
}

export interface QuoteCalculationResponse {
  success: boolean;
  estimatedPrice: number;
  launchPrice?: number;
  priceSource: 'database' | 'cashify' | 'api' | 'estimate';
  breakdown: {
    basePrice: number;
    deductions: { label: string; amount: number }[];
    bonuses: { label: string; amount: number }[];
    totalDeduction: number;
    totalBonus: number;
  };
}

// ─────────────────────────────────────────────────────────────
// HELPER: detect iPhone generation from model string
// ─────────────────────────────────────────────────────────────
function getiPhoneGeneration(model: string): number {
  const m = model.toLowerCase();
  if (m.includes('iphone 17') || m.includes('iphone17')) return 17;
  if (m.includes('iphone 16') || m.includes('iphone16')) return 16;
  if (m.includes('iphone 15') || m.includes('iphone15')) return 15;
  if (m.includes('iphone 14') || m.includes('iphone14')) return 14;
  if (m.includes('iphone 13') || m.includes('iphone13')) return 13;
  if (m.includes('iphone 12') || m.includes('iphone12')) return 12;
  if (m.includes('iphone 11') || m.includes('iphone11')) return 11;
  if (m.includes('iphone xs') || m.includes('iphone xr') || m.includes('iphone x')) return 10;
  if (m.includes('iphone se')) return 8;
  if (m.includes('iphone 8')) return 8;
  if (m.includes('iphone 7')) return 7;
  if (m.includes('iphone 6')) return 6;
  return 0;
}

// ─────────────────────────────────────────────────────────────
// HELPER: Dynamic MSRP estimator for completely unknown devices
// ─────────────────────────────────────────────────────────────
function estimateDynamicMSRP(brand: string, modelName: string, storageStr: string = '128GB'): number {
  const brandLower = brand.toLowerCase();
  const modelLower = modelName.toLowerCase();
  let baseMsrp = 15000;

  if (brandLower.includes('apple') || modelLower.includes('iphone')) {
    baseMsrp = 75000;
    if (modelLower.includes('pro max')) baseMsrp *= 1.8;
    else if (modelLower.includes('pro')) baseMsrp *= 1.5;
    else if (modelLower.includes('plus')) baseMsrp *= 1.2;
  } else if (brandLower.includes('samsung')) {
    if (modelLower.includes('ultra') || modelLower.includes('fold')) baseMsrp = 120000;
    else if (modelLower.includes('flip')) baseMsrp = 85000;
    else if (modelLower.match(/\bs\d+\b/)) baseMsrp = 70000;
    else if (modelLower.match(/\ba\d+\b/)) baseMsrp = 25000;
    else baseMsrp = 15000;
  } else if (brandLower.includes('oneplus')) {
    if (modelLower.includes('nord') || modelLower.includes('ce')) baseMsrp = 25000;
    else if (modelLower.includes('r')) baseMsrp = 40000;
    else baseMsrp = 55000;
  } else if (brandLower.includes('google') || modelLower.includes('pixel')) {
    if (modelLower.includes('pro')) baseMsrp = 80000;
    else if (modelLower.includes('a')) baseMsrp = 40000;
    else baseMsrp = 60000;
  } else {
    // Realme, Xiaomi, Vivo, Oppo, Poco generic mid-range tiers
    if (modelLower.includes('pro plus') || modelLower.includes('pro+') || modelLower.includes('ultra')) {
      baseMsrp = 25000;
    } else if (modelLower.includes('pro') || modelLower.includes('gt')) {
      baseMsrp = 18000;
    } else {
      baseMsrp = 12000;
    }
  }

  // Apply Storage Multiplier
  const storageGb = parseInt(storageStr) || 128;
  if (storageGb >= 1024) baseMsrp *= 1.45;
  else if (storageGb >= 512) baseMsrp *= 1.25;
  else if (storageGb >= 256) baseMsrp *= 1.12;

  return Math.round(baseMsrp);
}

function estimateDynamicYear(modelName: string): number {
  const m = modelName.toLowerCase();
  const currentYear = new Date().getFullYear();
  if (m.includes('17') || m.includes('25') || m.includes('s25') || m.includes('15 pro')) return currentYear;
  if (m.includes('16') || m.includes('24') || m.includes('s24') || m.includes('14 pro')) return currentYear - 1;
  if (m.includes('15') || m.includes('23') || m.includes('s23') || m.includes('13 pro') || m.includes('13')) return currentYear - 2;
  if (m.includes('14') || m.includes('22') || m.includes('s22') || m.includes('12')) return currentYear - 3;
  if (m.includes('10 pro')) return currentYear - 3; // Realme 10 series was late 2022 / early 2023
  if (m.includes('11 pro')) return currentYear - 2;
  return currentYear - 3; // safe fallback for most traded-in models
}

function cleanModelName(model: string, brand: string): string {
  let m = model.trim();
  m = m.replace(/\s*\([^)]*\)/g, '').trim();
  const brandLower = brand.toLowerCase().trim();
  if (m.toLowerCase().startsWith(brandLower)) {
    m = m.substring(brandLower.length).trim();
  }
  return m;
}

// ─────────────────────────────────────────────────────────────
// HELPER: Fetch launch price from phone-specs-api
// ─────────────────────────────────────────────────────────────
async function fetchSpecsFromAPI(brandName: string, modelName: string, modelSlug?: string): Promise<{ launchPrice?: number; releaseYear?: number } | null> {
  try {
    let slug = modelSlug;
    const cleanedModelName = modelName
      .replace(/\(\d+GB\)/gi, '')
      .replace(/\b\d+GB\b/gi, '')
      .replace(/\(\s*\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!slug) {
      const brandsRes = await fetch('https://phone-specs-api.vercel.app/brands');
      if (!brandsRes.ok) return null;
      const brandsJson = await brandsRes.json();
      if (!brandsJson.status || !brandsJson.data) return null;
      const brandList = brandsJson.data as Array<{ brand_name: string; brand_slug: string }>;
      const matchedBrand = brandList.find(b => b.brand_name.toLowerCase().trim() === brandName.toLowerCase().trim());
      if (!matchedBrand) return null;
      const modelsRes = await fetch(`https://phone-specs-api.vercel.app/brands/${matchedBrand.brand_slug}`);
      if (!modelsRes.ok) return null;
      const modelsJson = await modelsRes.json();
      if (!modelsJson.status || !modelsJson.data?.phones) return null;
      const modelList = modelsJson.data.phones as Array<{ phone_name: string; slug: string }>;
      let matchedModel = modelList.find(m => m.phone_name.toLowerCase().trim() === cleanedModelName.toLowerCase());
      if (!matchedModel) {
        matchedModel = modelList.find(m =>
          m.phone_name.toLowerCase().includes(cleanedModelName.toLowerCase()) ||
          cleanedModelName.toLowerCase().includes(m.phone_name.toLowerCase())
        );
      }
      if (!matchedModel) return null;
      slug = matchedModel.slug;
    }

    const detailsRes = await fetch(`https://phone-specs-api.vercel.app/${slug}`);
    if (!detailsRes.ok) return null;
    const detailsJson = await detailsRes.json();
    if (!detailsJson.status || !detailsJson.data) return null;

    const data = detailsJson.data;
    let priceStr = '';
    let year = 2026;
    if (data.release_date) {
      const match = data.release_date.match(/\b(20\d{2})\b/);
      if (match) year = parseInt(match[1], 10);
    }
    if (data.specifications) {
      for (const group of data.specifications) {
        for (const spec of group.specs) {
          if (spec.key.toLowerCase() === 'price' && spec.val?.length > 0) {
            priceStr = spec.val[0];
          }
        }
      }
    }
    let parsedLaunchPrice = 0;
    if (priceStr) {
      const parseNum = (s: string) => parseFloat(s.replace(/[^\d.]/g, '')) || 0;
      const parts = priceStr.split('/');
      for (const p of parts) {
        if (p.includes('₹') || p.toLowerCase().includes('inr') || p.includes('Rs.')) { parsedLaunchPrice = parseNum(p); break; }
        if (p.includes('$') && !p.includes('C$')) { parsedLaunchPrice = parseNum(p) * 83.5; }
        if (p.includes('€')) parsedLaunchPrice = parsedLaunchPrice || parseNum(p) * 90;
        if (p.includes('£')) parsedLaunchPrice = parsedLaunchPrice || parseNum(p) * 106;
      }
      if (!parsedLaunchPrice) parsedLaunchPrice = parseNum(parts[0]) * 83.5;
    }
    return { launchPrice: parsedLaunchPrice > 0 ? Math.round(parsedLaunchPrice) : undefined, releaseYear: year };
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────
// MAIN PRICING SERVICE
// ─────────────────────────────────────────────────────────────
export class PricingService {
  static async calculateQuote(data: QuoteCalculationRequest): Promise<QuoteCalculationResponse> {
    let basePriceExcellent = 0;
    let launchPrice = 0;
    let releaseYear = 2026;
    let priceSource: 'database' | 'cashify' | 'api' | 'estimate' = 'estimate';
    const condition = data.condition.trim().toLowerCase();
    if (!['excellent', 'good', 'average'].includes(condition)) {
      throw new Error(`Invalid condition: '${data.condition}'`);
    }
    let hasConditionSpecificDatabasePrice = false;
    const cleanedModel = cleanModelName(data.model, data.brand);

    // ── Step 1: DeviceMaster DB lookup ────────────────────────
    const device = await prisma.deviceMaster.findFirst({
      where: {
        brand: { equals: data.brand.trim(), mode: 'insensitive' },
        OR: [
          { model: { equals: data.model.trim(), mode: 'insensitive' } },
          { model: { equals: cleanedModel, mode: 'insensitive' } },
          { model: { contains: cleanedModel, mode: 'insensitive' } },
        ],
        storage: { equals: data.storage.trim(), mode: 'insensitive' },
        isActive: true,
      },
    });

    if (device) {
      // DeviceMaster is the source of truth for admin-managed condition
      // prices. Do not recalculate a good/average price from excellent here,
      // otherwise edits to basePriceGood/basePriceAverage are ignored.
      basePriceExcellent = condition === 'excellent'
        ? device.basePriceExcellent
        : condition === 'good'
          ? device.basePriceGood
          : device.basePriceAverage;
      hasConditionSpecificDatabasePrice = true;
      launchPrice = data.launchPrice || device.launchPrice;
      priceSource = 'database';
      if (device.launchDate) {
        const y = parseInt(device.launchDate.split('-')[0], 10);
        releaseYear = isNaN(y) ? 2024 : y;
      }
    } else {
      // ── Step 2: Cashify live price (Vercel-compatible) ───────
      try {
        const cashify = await Promise.race([
          getCashifyPrice(data.brand, data.model, data.storage, data.condition),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000)),
        ]);
        if (cashify && typeof cashify === 'object' && cashify.price && cashify.price > 0) {
          basePriceExcellent = cashify.price;
          priceSource = 'cashify';
          console.log(`[PricingService] Cashify price used: ₹${cashify.price} (source: ${cashify.source})`);
        }
      } catch (e) {
        console.warn('[PricingService] Cashify fetch failed, falling back:', e);
      }

      // ── Step 3: phone-specs-api (launch price → estimate) ────
      if (!basePriceExcellent) {
        const apiSpecs = await fetchSpecsFromAPI(data.brand, data.model, data.modelSlug);
        if (apiSpecs?.launchPrice && apiSpecs.launchPrice > 0) {
          launchPrice = apiSpecs.launchPrice;
          releaseYear = apiSpecs.releaseYear || 2026;
          priceSource = 'api';
        } else if (data.launchPrice && data.launchPrice > 0) {
          launchPrice = data.launchPrice;
          priceSource = 'api';
        }

        if (launchPrice > 0) {
          const ageYears = Math.max(0, 2026 - releaseYear);
          const brandLower = data.brand.toLowerCase();
          const mult = getDepreciationRate(data.brand, data.model, ageYears);
          basePriceExcellent = Math.round(launchPrice * mult);
        } else {
          // ── Step 4: Dynamic MSRP Estimator Fallback ───────────
          const estimatedMSRP = estimateDynamicMSRP(data.brand, data.model, data.storage);
          const estimatedYear = estimateDynamicYear(data.model);
          const estimatedAgeYears = Math.max(0, 2026 - estimatedYear);
          const clampedAge = Math.min(estimatedAgeYears, 5);
          const mult = getDepreciationRate(data.brand, data.model, clampedAge);
          
          basePriceExcellent = Math.round(estimatedMSRP * mult);
          launchPrice = estimatedMSRP;
          priceSource = 'estimate';
          console.log(`[PricingService] Fallback values: MSRP=${estimatedMSRP}, Year=${estimatedYear}, Age=${clampedAge}, Mult=${mult}, Excellent=${basePriceExcellent}`);
        }
      }
    }

    // Base price by condition
    let basePrice = basePriceExcellent;
    if (!hasConditionSpecificDatabasePrice) {
      if (condition === 'good') basePrice = Math.round(basePriceExcellent * 0.9);
      else if (condition === 'average') basePrice = Math.round(basePriceExcellent * 0.78);
    }

    console.log(`[PricingService] Final basePrice for condition '${condition}': ${basePrice}`);

    const isApple = data.brand.toLowerCase().includes('apple') || data.model.toLowerCase().includes('iphone');
    const iPhoneGen = isApple ? getiPhoneGeneration(data.model) : 0;

    const deductions: { label: string; amount: number }[] = [];
    const bonuses: { label: string; amount: number }[] = [];

    const deduct = (label: string, pct: number) => {
      const amount = Math.round(basePrice * pct);
      if (amount > 0) deductions.push({ label, amount });
    };
    const bonus = (label: string, pct: number) => {
      const amount = Math.round(basePrice * pct);
      if (amount > 0) bonuses.push({ label, amount });
    };

    // ── SCREEN ISSUES ──────────────────────────────────────────
    // #1 Screen issue (dead / touch not working) — 75%
    if (data.screenIssue || data.screenCracked) deduct('Screen Issue', 0.75);

    // #2 Replacement / non-original screen — 55%
    else if (data.replacementScreen) deduct('Replacement Screen (Non-Original)', 0.55);

    // #4 Glass broken (cracked glass only, touch works) — 60%
    else if (data.glassbroken) deduct('Glass Broken', 0.60);

    // #6 Heavy dot/spot/line/discoloration — 70%
    else if (data.heavyDiscoloration) deduct('Heavy Discoloration / Dead Spot', 0.70);

    // #9 Scratch on screen — 40%
    else if (data.scratchOnScreen) deduct('Scratch on Screen', 0.40);

    // ── BODY ISSUES ────────────────────────────────────────────
    // #5 Heavy body scratch/dent — 25%
    if (data.bodyHeavyScratch) deduct('Heavy Body Scratch / Dent', 0.25);
    // #7 Body damage — 30%
    else if (data.bodyDamage) deduct('Body Damage', 0.30);
    // #8 1-2 minor dents/scratches — 25%
    else if (data.minorBodyScratch) deduct('Minor Body Scratch (1-2)', 0.25);

    // #24 Camera glass broken — 30%
    if (data.cameraGlassBroken) deduct('Camera Glass Broken', 0.30);

    // ── SIM ISSUE (#3) ─────────────────────────────────────────
    if (data.simNotWorking) {
      const simFlat = iPhoneGen >= 13 ? 1200 : 800;
      deductions.push({ label: 'SIM Not Working', amount: simFlat });
    }

    // ── CAMERAS (#13, #14) ─────────────────────────────────────
    if (data.frontCameraIssue && data.backCameraIssue) {
      // Both cameras not working — 55%
      deduct('Front + Back Camera Not Working', 0.55);
    } else if (data.backCameraIssue || data.cameraIssue) {
      // Back camera — 40%
      deduct('Back Camera Not Working', 0.40);
    } else if (data.frontCameraIssue) {
      // Front camera — 35%
      deduct('Front Camera Not Working', 0.35);
    }

    // ── FINGERPRINT (#15) ──────────────────────────────────────
    if (data.fingerprintIssue) deduct('Fingerprint Not Working', 0.25);

    // ── FACE ID (#20) — Apple only ─────────────────────────────
    if (data.faceIdIssue && isApple) deduct('Face ID Not Working', 0.45);

    // ── FUNCTIONAL ISSUES ──────────────────────────────────────
    if (data.volumeButtonIssue)    deduct('Volume Button Not Working', 0.30);
    if (data.wifiNotWorking)       deduct('Wi-Fi Not Working', 0.60);
    if (data.speakerIssue)         deduct('Speaker Not Working', 0.30);
    if (data.silentButtonIssue)    deduct('Silent / Mute Button Not Working', 0.30);
    if (data.powerButtonIssue)     deduct('Power Button Not Working', 0.30);
    if (data.chargingPortIssue)    deduct('Charging Port Not Working', 0.30);
    if (data.audioReceiverIssue)   deduct('Audio Receiver (Earpiece) Not Working', 0.30);
    if (data.microphoneIssue)      deduct('Microphone Not Working', 0.30);
    if (data.bluetoothIssue)       deduct('Bluetooth Not Working', 0.55);
    if (data.vibrationIssue)       deduct('Vibration Not Working', 0.30);
    if (data.proximitySensorIssue) deduct('Proximity Sensor Not Working', 0.30);

    // ── BATTERY (#29, #30) ─────────────────────────────────────
    const batteryHealth = data.batteryHealth ?? 100;
    if (batteryHealth < 80) {
      deduct('Battery Health < 80%', 0.35);
    } else if (batteryHealth < 90) {
      deduct('Battery Health 80–90%', 0.30);
    }

    // ── ACCESSORIES / BONUSES (#11, #12) ──────────────────────
    if (data.hasChargerAndBox) bonus('Original Charger & Box', 0.05);
    if (data.hasBill)          bonus('Original Bill', 0.05);

    // ── WARRANTY BONUS (#10) ──────────────────────────────────
    const wm = data.warrantyMonths ?? 0;
    if (wm > 0 && wm < 3)        bonus('Warranty < 3 Months Remaining', 0.05);
    else if (wm >= 3 && wm < 6)  bonus('Warranty 3–6 Months', 0.075);
    else if (wm >= 6 && wm < 12) bonus('Warranty 6–11 Months', 0.10);

    // ── COMPUTE FINAL PRICE ────────────────────────────────────
    const totalDeduction = deductions.reduce((s, d) => s + d.amount, 0);
    const totalBonus     = bonuses.reduce((s, b) => s + b.amount, 0);

    const minFloorPrice = Math.max(Math.round((launchPrice * 0.08) / 100) * 100, 500);
    let estimatedPrice = Math.max(minFloorPrice, basePrice - totalDeduction + totalBonus);
    estimatedPrice = Math.round(estimatedPrice / 100) * 100;

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
    };
  }
}

/**
 * Resale Price Estimator — Vercel Compatible
 * --------------------------------------------
 * Data sources (in priority order):
 *   1. Cache (in-memory, 24h TTL)
 *   2. DeviceMaster DB price (already fetched by pricing.service)
 *   3. Brand + model + age based depreciation model
 */

// ─────────────────────────────────────────────────────────────
// IN-MEMORY CACHE
// ─────────────────────────────────────────────────────────────
const priceCache = new Map<string, { price: number; ts: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function makeCacheKey(brand: string, model: string, storage: string, condition: string) {
  return `${brand}:${model}:${storage}:${condition}`.toLowerCase().replace(/\s+/g, '_');
}
function fromCache(key: string): number | null {
  const e = priceCache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL_MS) { priceCache.delete(key); return null; }
  return e.price;
}
function toCache(key: string, price: number) {
  priceCache.set(key, { price, ts: Date.now() });
}

// ─────────────────────────────────────────────────────────────
// LAUNCH PRICE & EXACT MARKET PRICE DATABASE
// ─────────────────────────────────────────────────────────────
interface DeviceEntry { launchPrice: number; year: number }

const DEVICE_LAUNCH_PRICES: Record<string, DeviceEntry> = {
  // Apple
  'apple:iphone 16 pro max:256gb': { launchPrice: 159900, year: 2024 },
  'apple:iphone 16 pro:128gb':     { launchPrice: 119900, year: 2024 },
  'apple:iphone 15 pro max:256gb': { launchPrice: 159900, year: 2023 },
  'apple:iphone 15:128gb':         { launchPrice: 79900,  year: 2023 },
  'apple:iphone 14:128gb':         { launchPrice: 79900,  year: 2022 },
  'apple:iphone 13:128gb':         { launchPrice: 69900,  year: 2021 },
  'apple:iphone 12:128gb':         { launchPrice: 69900,  year: 2020 },
  'apple:iphone 11:64gb':          { launchPrice: 68300,  year: 2019 },

  // Realme
  'realme:13 pro+ 5g:256gb':        { launchPrice: 32999, year: 2024 },
  'realme:13 pro+ 5g:512gb':        { launchPrice: 36999, year: 2024 },
  'realme:12 pro+ 5g:256gb':        { launchPrice: 29999, year: 2024 },
  'realme:11 pro+ 5g:256gb':        { launchPrice: 27999, year: 2023 },
  'realme:10 pro+ 5g:128gb':        { launchPrice: 24999, year: 2023 },
  'realme:10 pro+ 5g:256gb':        { launchPrice: 27999, year: 2023 },
  'realme:10 pro 5g:128gb':         { launchPrice: 18999, year: 2022 },

  // Samsung
  'samsung:galaxy s24 ultra:256gb':  { launchPrice: 129999, year: 2024 },
  'samsung:galaxy s23 ultra:256gb':  { launchPrice: 124999, year: 2023 },
  'samsung:galaxy s23:128gb':        { launchPrice: 74999,  year: 2023 },
  'samsung:galaxy a55:128gb':        { launchPrice: 29999,  year: 2024 },
};

// ─────────────────────────────────────────────────────────────
// DEPRECIATION RATES (calibrated against Cashify/OLX real data)
// ─────────────────────────────────────────────────────────────
interface DepreciationTable { [ageYears: number]: number }

const DEPRECIATION: Record<string, DepreciationTable> = {
  apple: { 0: 0.85, 1: 0.72, 2: 0.60, 3: 0.50, 4: 0.40, 5: 0.30 },
  samsung_flagship: { 0: 0.80, 1: 0.68, 2: 0.55, 3: 0.44, 4: 0.35, 5: 0.25 },
  samsung_mid: { 0: 0.75, 1: 0.60, 2: 0.50, 3: 0.40, 4: 0.30, 5: 0.20 },
  realme: { 0: 0.78, 1: 0.62, 2: 0.50, 3: 0.40, 4: 0.35, 5: 0.25 },
  oneplus: { 0: 0.78, 1: 0.64, 2: 0.52, 3: 0.42, 4: 0.32, 5: 0.22 },
  google: { 0: 0.75, 1: 0.60, 2: 0.48, 3: 0.38, 4: 0.28, 5: 0.18 },
  xiaomi: { 0: 0.72, 1: 0.58, 2: 0.46, 3: 0.36, 4: 0.26, 5: 0.16 },
  poco: { 0: 0.72, 1: 0.58, 2: 0.46, 3: 0.36, 4: 0.26, 5: 0.16 },
  default: { 0: 0.70, 1: 0.55, 2: 0.44, 3: 0.34, 4: 0.24, 5: 0.15 },
};

function getDepreciationRate(brand: string, model: string, ageYears: number): number {
  const b = brand.toLowerCase();
  const m = model.toLowerCase();
  const clampedAge = Math.min(ageYears, 5);

  let table: DepreciationTable;
  if (b.includes('apple') || m.includes('iphone')) {
    table = DEPRECIATION.apple;
  } else if (b.includes('samsung')) {
    const isFlag = m.includes('s24') || m.includes('s23') || m.includes('s22') || m.includes('ultra') || m.includes('fold') || m.includes('flip');
    table = isFlag ? DEPRECIATION.samsung_flagship : DEPRECIATION.samsung_mid;
  } else if (b.includes('realme') || m.includes('realme')) {
    table = DEPRECIATION.realme;
  } else if (b.includes('oneplus') || m.includes('oneplus')) {
    table = DEPRECIATION.oneplus;
  } else if (b.includes('google') || m.includes('pixel')) {
    table = DEPRECIATION.google;
  } else if (b.includes('xiaomi') || m.includes('xiaomi')) {
    table = DEPRECIATION.xiaomi;
  } else if (b.includes('poco') || m.includes('poco')) {
    table = DEPRECIATION.poco;
  } else {
    table = DEPRECIATION.default;
  }

  const floor = Math.floor(clampedAge);
  const ceil = Math.ceil(clampedAge);
  if (floor === ceil) return table[floor] ?? table[5];
  const rFloor = table[floor] ?? table[5];
  const rCeil = table[ceil] ?? table[5];
  return rFloor + (rCeil - rFloor) * (clampedAge - floor);
}

const CONDITION_MULT: Record<string, number> = {
  excellent: 1.00,
  good: 0.88,
  average: 0.72,
  poor: 0.50,
};

function lookupDeviceEntry(brand: string, model: string, storage: string): DeviceEntry | null {
  const cleanModelStr = model.toLowerCase().replace(/\+/g, ' plus').replace(/\s+/g, ' ').trim();
  const key = `${brand}:${cleanModelStr}:${storage}`.toLowerCase().trim();
  
  // Exact lookup
  if (DEVICE_LAUNCH_PRICES[key]) return DEVICE_LAUNCH_PRICES[key];

  // Precise model key matching
  for (const [k, v] of Object.entries(DEVICE_LAUNCH_PRICES)) {
    const [kBrand, kModel, kStorage] = k.split(':');
    const cleanKModel = kModel.toLowerCase().replace(/\+/g, ' plus').replace(/\s+/g, ' ').trim();
    if (
      brand.toLowerCase().trim() === kBrand &&
      cleanModelStr === cleanKModel &&
      storage.toLowerCase().trim() === kStorage
    ) {
      return v;
    }
  }
  return null;
}

function estimateFromLaunchPrice(
  brand: string,
  model: string,
  storage: string,
  condition: string,
  entry: DeviceEntry
): number {
  const launchDate = new Date(`${entry.year}-01-01`);
  const now = new Date();
  const ageYears = Math.max(0, (now.getFullYear() - launchDate.getFullYear()) + (now.getMonth() - launchDate.getMonth()) / 12);
  const depRate = getDepreciationRate(brand, model, ageYears);
  const condMult = CONDITION_MULT[condition.toLowerCase()] ?? CONDITION_MULT.good;
  const rawPrice = entry.launchPrice * depRate * condMult;
  return Math.max(500, Math.round(rawPrice / 100) * 100);
}

export interface CashifyPriceResult {
  price: number | null;
  source: 'cache' | 'db_lookup' | 'estimated' | 'failed';
  cached: boolean;
}

export async function getCashifyPrice(
  brand: string,
  model: string,
  storage: string,
  condition: string,
  hint?: { launchPrice?: number; launchYear?: number }
): Promise<CashifyPriceResult> {
  const key = makeCacheKey(brand, model, storage, condition);

  const cached = fromCache(key);
  if (cached !== null) {
    return { price: cached, source: 'cache', cached: true };
  }

  const entry = lookupDeviceEntry(brand, model, storage);
  if (entry) {
    const price = estimateFromLaunchPrice(brand, model, storage, condition, entry);
    toCache(key, price);
    return { price, source: 'db_lookup', cached: false };
  }

  // Dynamic automatic calculation for any device missing from launch catalog
  const estimatedLaunchPrice = hint?.launchPrice && hint.launchPrice > 0 
    ? hint.launchPrice 
    : calculateDynamicLaunchPrice(brand, model, storage);

  const estimatedYear = hint?.launchYear ?? estimateLaunchYear(model);
  const price = estimateFromLaunchPrice(brand, model, storage, condition, { launchPrice: estimatedLaunchPrice, year: estimatedYear });
  toCache(key, price);
  return { price, source: 'estimated', cached: false };
}

function calculateDynamicLaunchPrice(brand: string, model: string, storage: string): number {
  const b = brand.toLowerCase();
  const m = model.toLowerCase();
  let baseMsrp = 25000;

  if (b.includes('apple') || m.includes('iphone')) {
    if (m.includes('16')) baseMsrp = 79900;
    else if (m.includes('15')) baseMsrp = 69900;
    else if (m.includes('14')) baseMsrp = 59900;
    else if (m.includes('13')) baseMsrp = 49900;
    else baseMsrp = 39900;
    if (m.includes('pro max')) baseMsrp *= 1.5;
    else if (m.includes('pro')) baseMsrp *= 1.3;
  } else if (b.includes('samsung')) {
    if (m.includes('ultra')) baseMsrp = 124999;
    else if (m.includes('fold')) baseMsrp = 154999;
    else if (m.includes('flip')) baseMsrp = 89999;
    else if (m.includes('s24') || m.includes('s23')) baseMsrp = 74999;
    else baseMsrp = 24999;
  } else if (b.includes('oneplus')) {
    baseMsrp = m.includes('pro') || m.includes('12') || m.includes('13') ? 64999 : 34999;
  } else if (b.includes('realme') || b.includes('xiaomi') || b.includes('vivo') || b.includes('oppo') || b.includes('poco')) {
    if (m.includes('pro+') || m.includes('ultra') || m.includes('gt')) baseMsrp = 32999;
    else if (m.includes('pro')) baseMsrp = 22999;
    else baseMsrp = 14999;
  }

  // Storage multiplier
  const storageGb = parseInt(storage) || 128;
  if (storageGb >= 512) baseMsrp *= 1.25;
  else if (storageGb >= 256) baseMsrp *= 1.12;

  return Math.round(baseMsrp);
}

function estimateLaunchYear(model: string): number {
  const m = model.toLowerCase();
  const currentYear = new Date().getFullYear();
  if (m.includes('16') || m.includes('24') || m.includes('s24') || m.includes('14 pro')) return currentYear;
  if (m.includes('15') || m.includes('23') || m.includes('s23') || m.includes('13 pro') || m.includes('10 pro')) return currentYear - 1;
  if (m.includes('14') || m.includes('22') || m.includes('s22')) return currentYear - 2;
  return currentYear - 2;
}
}

export { priceCache };

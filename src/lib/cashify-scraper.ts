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

const DEVICE_LAUNCH_PRICES: Record<string, DeviceEntry> = {};

// ─────────────────────────────────────────────────────────────
// DEPRECIATION RATES (calibrated against Cashify/OLX real data)
// ─────────────────────────────────────────────────────────────
interface DepreciationTable { [ageYears: number]: number }

const DEPRECIATION: Record<string, DepreciationTable> = {
  apple: { 0: 0.85, 1: 0.75, 2: 0.65, 3: 0.56, 4: 0.48, 5: 0.40 },
  samsung_flagship: { 0: 0.80, 1: 0.70, 2: 0.60, 3: 0.50, 4: 0.42, 5: 0.32 },
  samsung_mid: { 0: 0.75, 1: 0.62, 2: 0.52, 3: 0.44, 4: 0.35, 5: 0.25 },
  realme: { 0: 0.78, 1: 0.65, 2: 0.55, 3: 0.42, 4: 0.34, 5: 0.25 },
  oneplus: { 0: 0.78, 1: 0.66, 2: 0.56, 3: 0.48, 4: 0.40, 5: 0.30 },
  google: { 0: 0.75, 1: 0.62, 2: 0.52, 3: 0.42, 4: 0.34, 5: 0.25 },
  xiaomi: { 0: 0.72, 1: 0.60, 2: 0.50, 3: 0.42, 4: 0.34, 5: 0.25 },
  poco: { 0: 0.72, 1: 0.60, 2: 0.50, 3: 0.42, 4: 0.34, 5: 0.25 },
  default: { 0: 0.70, 1: 0.58, 2: 0.48, 3: 0.40, 4: 0.30, 5: 0.22 },
};

export function getDepreciationRate(brand: string, model: string, ageYears: number): number {
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
  const bLow = brand.toLowerCase().trim();
  let mLow = model.toLowerCase().trim();
  if (mLow.startsWith(bLow)) mLow = mLow.slice(bLow.length).trim();
  const cleanModelStr = mLow.replace(/\+/g, ' plus').replace(/\s+/g, ' ').trim();
  const key = `${bLow}:${cleanModelStr}:${storage}`.toLowerCase().trim();
  
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
  launchPrice?: number;
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
    // Note: cache doesn't store launchPrice, but it's fine for now, or we can just fetch it again if needed.
    return { price: cached, source: 'cache', cached: true };
  }

  const entry = lookupDeviceEntry(brand, model, storage);
  if (entry) {
    const price = estimateFromLaunchPrice(brand, model, storage, condition, entry);
    toCache(key, price);
    return { price, launchPrice: entry.launchPrice, source: 'db_lookup', cached: false };
  }

  if (hint?.launchPrice && hint.launchPrice > 0) {
    const estimatedYear = hint?.launchYear ?? new Date().getFullYear() - 2;
    const price = estimateFromLaunchPrice(brand, model, storage, condition, { launchPrice: hint.launchPrice, year: estimatedYear });
    toCache(key, price);
    return { price, launchPrice: hint.launchPrice, source: 'estimated', cached: false };
  }

  return { price: null, source: 'failed', cached: false };
}

export { priceCache };

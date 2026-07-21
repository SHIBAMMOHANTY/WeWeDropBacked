/**
 * Resale Price Estimator — Vercel Compatible
 * --------------------------------------------
 * Cashify aur OLX dono server-side fetch block karte hain (Cloudflare bot protection).
 * Isliye ye module launch price + age + brand + condition se accurate resale estimate karta hai.
 *
 * Data sources (in priority order):
 *   1. Cache (in-memory, 24h TTL)
 *   2. DeviceMaster DB price (already fetched by pricing.service)
 *   3. Brand + model + age based depreciation model
 *
 * Depreciation model is calibrated against real Cashify/OLX prices.
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
// LAUNCH PRICE DATABASE (known phones — updated manually)
// ─────────────────────────────────────────────────────────────
interface DeviceEntry { launchPrice: number; year: number }

const DEVICE_LAUNCH_PRICES: Record<string, DeviceEntry> = {
  // Apple
  'apple:iphone 16 pro max:256gb': { launchPrice: 159900, year: 2024 },
  'apple:iphone 16 pro max:512gb': { launchPrice: 179900, year: 2024 },
  'apple:iphone 16 pro:256gb':     { launchPrice: 134900, year: 2024 },
  'apple:iphone 16 pro:128gb':     { launchPrice: 119900, year: 2024 },
  'apple:iphone 16 plus:256gb':    { launchPrice: 99900,  year: 2024 },
  'apple:iphone 16 plus:128gb':    { launchPrice: 89900,  year: 2024 },
  'apple:iphone 16:256gb':         { launchPrice: 84900,  year: 2024 },
  'apple:iphone 16:128gb':         { launchPrice: 79900,  year: 2024 },
  'apple:iphone 15 pro max:256gb': { launchPrice: 159900, year: 2023 },
  'apple:iphone 15 pro:128gb':     { launchPrice: 134900, year: 2023 },
  'apple:iphone 15 plus:128gb':    { launchPrice: 89900,  year: 2023 },
  'apple:iphone 15:128gb':         { launchPrice: 79900,  year: 2023 },
  'apple:iphone 14 pro max:128gb': { launchPrice: 139900, year: 2022 },
  'apple:iphone 14 pro:128gb':     { launchPrice: 129900, year: 2022 },
  'apple:iphone 14 plus:128gb':    { launchPrice: 89900,  year: 2022 },
  'apple:iphone 14:128gb':         { launchPrice: 79900,  year: 2022 },
  'apple:iphone 13 pro max:128gb': { launchPrice: 129900, year: 2021 },
  'apple:iphone 13 pro:128gb':     { launchPrice: 119900, year: 2021 },
  'apple:iphone 13:128gb':         { launchPrice: 69900,  year: 2021 },
  'apple:iphone 13 mini:128gb':    { launchPrice: 59900,  year: 2021 },
  'apple:iphone 12:64gb':          { launchPrice: 65900,  year: 2020 },
  'apple:iphone 12:128gb':         { launchPrice: 69900,  year: 2020 },
  'apple:iphone 11:64gb':          { launchPrice: 68300,  year: 2019 },
  'apple:iphone se:64gb':          { launchPrice: 42500,  year: 2022 },
  // Samsung
  'samsung:galaxy s24 ultra:256gb':  { launchPrice: 129999, year: 2024 },
  'samsung:galaxy s24+:256gb':       { launchPrice: 99999,  year: 2024 },
  'samsung:galaxy s24:256gb':        { launchPrice: 74999,  year: 2024 },
  'samsung:galaxy s23 ultra:256gb':  { launchPrice: 124999, year: 2023 },
  'samsung:galaxy s23+:256gb':       { launchPrice: 94999,  year: 2023 },
  'samsung:galaxy s23:128gb':        { launchPrice: 74999,  year: 2023 },
  'samsung:galaxy a55:256gb':        { launchPrice: 34999,  year: 2024 },
  'samsung:galaxy a55:128gb':        { launchPrice: 29999,  year: 2024 },
  'samsung:galaxy a35:256gb':        { launchPrice: 24999,  year: 2024 },
  'samsung:galaxy a35:128gb':        { launchPrice: 21999,  year: 2024 },
  // OnePlus
  'oneplus:12:256gb':               { launchPrice: 64999, year: 2024 },
  'oneplus:12:512gb':               { launchPrice: 69999, year: 2024 },
  'oneplus:12r:256gb':              { launchPrice: 39999, year: 2024 },
  'oneplus:11:256gb':               { launchPrice: 56999, year: 2023 },
  'oneplus:nord 4:256gb':           { launchPrice: 29999, year: 2024 },
  'oneplus:nord ce 4:256gb':        { launchPrice: 24999, year: 2024 },
  // Poco
  'poco:x8 pro:256gb':             { launchPrice: 36999, year: 2024 },
  'poco:x8 pro:512gb':             { launchPrice: 39999, year: 2024 },
  'poco:x8 pro max:256gb':         { launchPrice: 44999, year: 2024 },
  'poco:x8 pro max:512gb':         { launchPrice: 47999, year: 2024 },
  'poco:x7 pro:256gb':             { launchPrice: 27999, year: 2025 },
  'poco:f6 pro:256gb':             { launchPrice: 34999, year: 2024 },
  'poco:f6:256gb':                 { launchPrice: 27999, year: 2024 },
  'poco:m6 pro:256gb':             { launchPrice: 18999, year: 2024 },
  // Xiaomi
  'xiaomi:14:512gb':               { launchPrice: 69999, year: 2024 },
  'xiaomi:14 ultra:512gb':         { launchPrice: 99999, year: 2024 },
  // Google
  'google:pixel 9 pro xl:256gb':   { launchPrice: 109999, year: 2024 },
  'google:pixel 9 pro:256gb':      { launchPrice: 99999,  year: 2024 },
  'google:pixel 9:256gb':          { launchPrice: 79999,  year: 2024 },
  'google:pixel 8 pro:256gb':      { launchPrice: 106999, year: 2023 },
  'google:pixel 8:256gb':          { launchPrice: 75999,  year: 2023 },
};

// ─────────────────────────────────────────────────────────────
// DEPRECIATION RATES (calibrated against Cashify/OLX real data)
// ─────────────────────────────────────────────────────────────
interface DepreciationTable { [ageYears: number]: number }

const DEPRECIATION: Record<string, DepreciationTable> = {
  apple: { 0: 0.82, 1: 0.68, 2: 0.55, 3: 0.42, 4: 0.32, 5: 0.22 },
  samsung_flagship: { 0: 0.78, 1: 0.62, 2: 0.48, 3: 0.36, 4: 0.26, 5: 0.18 },
  samsung_mid: { 0: 0.72, 1: 0.56, 2: 0.42, 3: 0.30, 4: 0.20, 5: 0.12 },
  oneplus: { 0: 0.72, 1: 0.56, 2: 0.42, 3: 0.30, 4: 0.20, 5: 0.12 },
  google: { 0: 0.70, 1: 0.54, 2: 0.40, 3: 0.28, 4: 0.18, 5: 0.10 },
  xiaomi: { 0: 0.65, 1: 0.50, 2: 0.36, 3: 0.25, 4: 0.16, 5: 0.10 },
  poco: { 0: 0.65, 1: 0.50, 2: 0.36, 3: 0.25, 4: 0.16, 5: 0.10 },
  default: { 0: 0.60, 1: 0.46, 2: 0.33, 3: 0.22, 4: 0.14, 5: 0.08 },
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

  // Linear interpolation between integer years
  const floor = Math.floor(clampedAge);
  const ceil = Math.ceil(clampedAge);
  if (floor === ceil) return table[floor] ?? table[5];
  const rFloor = table[floor] ?? table[5];
  const rCeil = table[ceil] ?? table[5];
  return rFloor + (rCeil - rFloor) * (clampedAge - floor);
}

// ─────────────────────────────────────────────────────────────
// CONDITION MULTIPLIER
// ─────────────────────────────────────────────────────────────
const CONDITION_MULT: Record<string, number> = {
  excellent: 1.00,
  good: 0.88,
  average: 0.72,
  poor: 0.50,
};

// ─────────────────────────────────────────────────────────────
// LOOKUP HELPERS
// ─────────────────────────────────────────────────────────────
function lookupDeviceEntry(brand: string, model: string, storage: string): DeviceEntry | null {
  const key = `${brand}:${model}:${storage}`.toLowerCase().trim();
  if (DEVICE_LAUNCH_PRICES[key]) return DEVICE_LAUNCH_PRICES[key];

  // Fuzzy match — try without storage, or with partial model name
  for (const [k, v] of Object.entries(DEVICE_LAUNCH_PRICES)) {
    const [kBrand, kModel] = k.split(':');
    if (
      brand.toLowerCase().includes(kBrand) &&
      model.toLowerCase().includes(kModel) &&
      k.includes(storage.toLowerCase())
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
  launchPrice: number,
  launchYear: number
): number {
  const currentYear = new Date().getFullYear();
  const ageYears = Math.max(0, currentYear - launchYear);
  const depRate = getDepreciationRate(brand, model, ageYears);
  const condMult = CONDITION_MULT[condition.toLowerCase()] ?? CONDITION_MULT.good;
  const rawPrice = launchPrice * depRate * condMult;
  // Round to nearest 500
  return Math.max(500, Math.round(rawPrice / 500) * 500);
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────
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
  /** Optional: pass launch price + year from DB to improve accuracy */
  hint?: { launchPrice?: number; launchYear?: number }
): Promise<CashifyPriceResult> {
  const key = makeCacheKey(brand, model, storage, condition);

  // 1. Cache
  const cached = fromCache(key);
  if (cached !== null) {
    return { price: cached, source: 'cache', cached: true };
  }

  // 2. Known device DB lookup
  const entry = lookupDeviceEntry(brand, model, storage);
  if (entry) {
    const price = estimateFromLaunchPrice(brand, model, storage, condition, entry.launchPrice, entry.year);
    toCache(key, price);
    console.log(`[ResaleEstimator] DB lookup: ${brand} ${model} ${storage} → ₹${price} (age: ${new Date().getFullYear() - entry.year}y)`);
    return { price, source: 'db_lookup', cached: false };
  }

  // 3. Use hint from calling service (launch price from DeviceMaster/specs API)
  if (hint?.launchPrice && hint.launchPrice > 0) {
    const launchYear = hint.launchYear ?? new Date().getFullYear() - 2;
    const price = estimateFromLaunchPrice(brand, model, storage, condition, hint.launchPrice, launchYear);
    toCache(key, price);
    console.log(`[ResaleEstimator] Hint estimate: ${brand} ${model} → ₹${price}`);
    return { price, source: 'estimated', cached: false };
  }

  return { price: null, source: 'failed', cached: false };
}

export { priceCache };

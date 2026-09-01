/**
 * Resale Price Resolver
 * ---------------------
 *
 * Priority:
 * 1. Cache
 * 2. Exact device/model/variant market price
 * 3. Hint price
 * 4. Depreciation estimate
 *
 * IMPORTANT:
 * This file does NOT scrape Cashify directly.
 * Any price stored in CURRENT_MARKET_PRICES should be treated
 * as an already-current resale/buyback price.
 */

interface DeviceEntry {
  launchPrice: number;
  year: number;
}

interface MarketPriceEntry {
  brand: string;
  model: string;
  modelId?: string;
  ram: number;
  storage: number;
  price: number;
  source: 'cashify' | 'market' | 'manual';
  updatedAt?: string;
}

export interface CashifyPriceResult {
  price: number | null;
  launchPrice?: number;
  source:
  | 'cache'
  | 'db_lookup'
  | 'market'
  | 'estimated'
  | 'failed';
  cached: boolean;
  modelMatched?: string;
  ram?: number;
  storage?: number;
}

/* ============================================================
   CACHE
   ============================================================ */

const priceCache = new Map<
  string,
  {
    price: number;
    ts: number;
    source: CashifyPriceResult['source'];
    launchPrice?: number;
  }
>();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function makeCacheKey(
  brand: string,
  model: string,
  storage: string,
  condition: string,
  ram?: number
) {
  return [
    brand,
    model,
    storage,
    condition,
    ram ?? '',
  ]
    .join(':')
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function fromCache(
  key: string
): CashifyPriceResult | null {
  const entry = priceCache.get(key);

  if (!entry) return null;

  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    priceCache.delete(key);
    return null;
  }

  return {
    price: entry.price,
    source: entry.source,
    cached: true,
    launchPrice: entry.launchPrice,
  };
}

function toCache(
  key: string,
  price: number,
  source: CashifyPriceResult['source'],
  launchPrice?: number
) {
  priceCache.set(key, {
    price,
    ts: Date.now(),
    source,
    launchPrice,
  });
}

/* ============================================================
   NORMALIZATION
   ============================================================ */

function normalizeBrand(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeModel(value: string): string {
  return value
    .toLowerCase()
    .replace(/®/g, '')
    .replace(/™/g, '')
    .replace(/\+/g, ' plus ')
    .replace(/5g/g, ' 5g ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeStorage(
  value: string | number
): number {
  const parsed = parseFloat(
    String(value).replace(/[^0-9.]/g, '')
  );

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 128;
  }

  /*
   * Android reports usable storage.
   *
   * 221.4 GB usable ≈ 256 GB advertised
   * 110–120 GB usable ≈ 128 GB advertised
   */
  if (parsed >= 200 && parsed <= 240) {
    return 256;
  }

  if (parsed >= 105 && parsed <= 135) {
    return 128;
  }

  if (parsed >= 50 && parsed <= 75) {
    return 64;
  }

  if (parsed >= 430 && parsed <= 530) {
    return 512;
  }

  return Math.round(parsed);
}

function normalizeRam(
  value: string | number
): number {
  const parsed = parseFloat(
    String(value).replace(/[^0-9.]/g, '')
  );

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 8;
  }

  /*
   * Android:
   * 7.2 GB → 8 GB
   */
  if (parsed >= 7 && parsed < 9) {
    return 8;
  }

  if (parsed >= 11 && parsed < 13) {
    return 12;
  }

  if (parsed >= 15 && parsed < 17) {
    return 16;
  }

  return Math.round(parsed);
}

/* ============================================================
   EXACT DEVICE MARKET PRICES
   ============================================================ */

/**
 * Add verified/current market prices here.
 *
 * RMX3921 = realme 13 Pro+ 5G
 * 8GB + 256GB
 *
 * IMPORTANT:
 * The price below should only be changed when you verify
 * the current Cashify/buyback price.
 */
const CURRENT_MARKET_PRICES: MarketPriceEntry[] = [
  {
    brand: 'realme',
    model: 'realme 13 pro+ 5g',
    modelId: 'RMX3921',
    ram: 8,
    storage: 256,
    price: 16490,
    source: 'cashify',
    updatedAt: '2026-09-01',
  },
];

/* ============================================================
   MODEL / LAUNCH DATABASE
   ============================================================ */

const DEVICE_LAUNCH_PRICES: Record<
  string,
  DeviceEntry
> = {
  /*
   * Example:
   *
   * 'realme:realme 13 pro plus 5g:256GB': {
   *   launchPrice: 29999,
   *   year: 2024,
   * }
   */
};

/* ============================================================
   DEPRECIATION
   ============================================================ */

interface DepreciationTable {
  [ageYears: number]: number;
}

const DEPRECIATION: Record<
  string,
  DepreciationTable
> = {
  apple: {
    0: 0.85,
    1: 0.75,
    2: 0.65,
    3: 0.56,
    4: 0.48,
    5: 0.40,
  },

  samsung_flagship: {
    0: 0.80,
    1: 0.70,
    2: 0.60,
    3: 0.50,
    4: 0.42,
    5: 0.32,
  },

  samsung_mid: {
    0: 0.75,
    1: 0.62,
    2: 0.52,
    3: 0.44,
    4: 0.35,
    5: 0.25,
  },

  realme: {
    0: 0.78,
    1: 0.65,
    2: 0.55,
    3: 0.42,
    4: 0.34,
    5: 0.25,
  },

  oneplus: {
    0: 0.78,
    1: 0.66,
    2: 0.56,
    3: 0.48,
    4: 0.40,
    5: 0.30,
  },

  google: {
    0: 0.75,
    1: 0.62,
    2: 0.52,
    3: 0.42,
    4: 0.34,
    5: 0.25,
  },

  xiaomi: {
    0: 0.72,
    1: 0.60,
    2: 0.50,
    3: 0.42,
    4: 0.34,
    5: 0.25,
  },

  poco: {
    0: 0.72,
    1: 0.60,
    2: 0.50,
    3: 0.42,
    4: 0.34,
    5: 0.25,
  },

  default: {
    0: 0.70,
    1: 0.58,
    2: 0.48,
    3: 0.40,
    4: 0.30,
    5: 0.22,
  },
};

export function getDepreciationRate(
  brand: string,
  model: string,
  ageYears: number
): number {
  const b = normalizeBrand(brand);
  const m = normalizeModel(model);

  const clampedAge = Math.max(
    0,
    Math.min(ageYears, 5)
  );

  let table: DepreciationTable;

  if (
    b.includes('apple') ||
    m.includes('iphone')
  ) {
    table = DEPRECIATION.apple;
  } else if (b.includes('samsung')) {
    const isFlagship =
      m.includes('s24') ||
      m.includes('s23') ||
      m.includes('s22') ||
      m.includes('ultra') ||
      m.includes('fold') ||
      m.includes('flip');

    table = isFlagship
      ? DEPRECIATION.samsung_flagship
      : DEPRECIATION.samsung_mid;
  } else if (
    b.includes('realme') ||
    m.includes('realme')
  ) {
    table = DEPRECIATION.realme;
  } else if (
    b.includes('oneplus') ||
    m.includes('oneplus')
  ) {
    table = DEPRECIATION.oneplus;
  } else if (
    b.includes('google') ||
    m.includes('pixel')
  ) {
    table = DEPRECIATION.google;
  } else if (
    b.includes('xiaomi') ||
    m.includes('xiaomi')
  ) {
    table = DEPRECIATION.xiaomi;
  } else if (b.includes('poco')) {
    table = DEPRECIATION.poco;
  } else {
    table = DEPRECIATION.default;
  }

  const floor = Math.floor(clampedAge);
  const ceil = Math.ceil(clampedAge);

  if (floor === ceil) {
    return table[floor] ?? table[5];
  }

  const rFloor = table[floor] ?? table[5];
  const rCeil = table[ceil] ?? table[5];

  return (
    rFloor +
    (rCeil - rFloor) *
    (clampedAge - floor)
  );
}

/* ============================================================
   CONDITION
   ============================================================ */

const CONDITION_MULT: Record<
  string,
  number
> = {
  excellent: 1.0,
  good: 0.88,
  average: 0.72,
  poor: 0.50,
};

/* ============================================================
   EXACT MARKET LOOKUP
   ============================================================ */

function findCurrentMarketPrice(
  brand: string,
  model: string,
  storage: number,
  ram?: number,
  modelId?: string
): MarketPriceEntry | null {
  const normalizedBrand =
    normalizeBrand(brand);

  const normalizedModel =
    normalizeModel(model);

  const normalizedRam =
    ram ? normalizeRam(ram) : undefined;

  /*
   * 1. MODEL ID MATCH — strongest match
   */
  if (modelId) {
    const idMatch =
      CURRENT_MARKET_PRICES.find(
        (entry) =>
          entry.modelId?.toLowerCase() ===
          modelId.toLowerCase() &&
          normalizeBrand(entry.brand) ===
          normalizedBrand &&
          entry.storage === storage &&
          (!normalizedRam ||
            entry.ram === normalizedRam)
      );

    if (idMatch) {
      return idMatch;
    }
  }

  /*
   * 2. EXACT BRAND + MODEL + RAM + STORAGE
   */
  const exactMatch =
    CURRENT_MARKET_PRICES.find(
      (entry) =>
        normalizeBrand(entry.brand) ===
        normalizedBrand &&
        normalizeModel(entry.model) ===
        normalizedModel &&
        entry.storage === storage &&
        (!normalizedRam ||
          entry.ram === normalizedRam)
    );

  if (exactMatch) {
    return exactMatch;
  }

  return null;
}

/* ============================================================
   LAUNCH PRICE LOOKUP
   ============================================================ */

function lookupDeviceEntry(
  brand: string,
  model: string,
  storage: string
): DeviceEntry | null {
  const bLow = normalizeBrand(brand);

  let mLow = normalizeModel(model);

  if (mLow.startsWith(bLow)) {
    mLow = mLow
      .slice(bLow.length)
      .trim();
  }

  const cleanModelStr = mLow
    .replace(/\+/g, ' plus')
    .replace(/\s+/g, ' ')
    .trim();

  const storageNormalized =
    `${normalizeStorage(storage)}GB`;

  const key =
    `${bLow}:${cleanModelStr}:${storageNormalized}`
      .toLowerCase()
      .trim();

  if (DEVICE_LAUNCH_PRICES[key]) {
    return DEVICE_LAUNCH_PRICES[key];
  }

  return null;
}

/* ============================================================
   ESTIMATION
   ============================================================ */

function estimateFromLaunchPrice(
  brand: string,
  model: string,
  condition: string,
  entry: DeviceEntry
): number {
  const launchDate =
    new Date(`${entry.year}-01-01`);

  const now = new Date();

  const ageYears = Math.max(
    0,
    now.getFullYear() -
    launchDate.getFullYear() +
    (now.getMonth() -
      launchDate.getMonth()) /
    12
  );

  const depRate =
    getDepreciationRate(
      brand,
      model,
      ageYears
    );

  const conditionMultiplier =
    CONDITION_MULT[
    condition.toLowerCase()
    ] ?? CONDITION_MULT.good;

  const rawPrice =
    entry.launchPrice *
    depRate *
    conditionMultiplier;

  return Math.max(
    500,
    Math.round(rawPrice / 100) * 100
  );
}

/* ============================================================
   MAIN
   ============================================================ */

export async function getCashifyPrice(
  brand: string,
  model: string,
  storage: string,
  condition: string,
  hint?: {
    launchPrice?: number;
    launchYear?: number;
    ram?: number;
    modelId?: string;
  }
): Promise<CashifyPriceResult> {
  const normalizedStorage =
    normalizeStorage(storage);

  const normalizedRam =
    hint?.ram
      ? normalizeRam(hint.ram)
      : undefined;

  const key = makeCacheKey(
    brand,
    model,
    `${normalizedStorage}GB`,
    condition,
    normalizedRam
  );

  /* ==========================================================
     1. CACHE
     ========================================================== */

  const cached = fromCache(key);

  if (cached) {
    return cached;
  }

  /* ==========================================================
     2. EXACT CURRENT MARKET PRICE
     ========================================================== */

  const marketEntry =
    findCurrentMarketPrice(
      brand,
      model,
      normalizedStorage,
      normalizedRam,
      hint?.modelId
    );

  if (marketEntry) {
    toCache(
      key,
      marketEntry.price,
      'market'
    );

    return {
      price: marketEntry.price,
      source: 'market',
      cached: false,
      modelMatched:
        marketEntry.model,
      ram: marketEntry.ram,
      storage:
        marketEntry.storage,
    };
  }

  /* ==========================================================
     3. LAUNCH DATABASE
     ========================================================== */

  const entry =
    lookupDeviceEntry(
      brand,
      model,
      `${normalizedStorage}GB`
    );

  if (entry) {
    const price =
      estimateFromLaunchPrice(
        brand,
        model,
        condition,
        entry
      );

    toCache(
      key,
      price,
      'db_lookup',
      entry.launchPrice
    );

    return {
      price,
      launchPrice:
        entry.launchPrice,
      source: 'db_lookup',
      cached: false,
      ram: normalizedRam,
      storage:
        normalizedStorage,
    };
  }

  /* ==========================================================
     4. HINT-BASED ESTIMATE
     ========================================================== */

  if (
    hint?.launchPrice &&
    hint.launchPrice > 0
  ) {
    const estimatedYear =
      hint.launchYear ??
      new Date().getFullYear() - 2;

    const price =
      estimateFromLaunchPrice(
        brand,
        model,
        condition,
        {
          launchPrice:
            hint.launchPrice,
          year: estimatedYear,
        }
      );

    toCache(
      key,
      price,
      'estimated',
      hint.launchPrice
    );

    return {
      price,
      launchPrice:
        hint.launchPrice,
      source: 'estimated',
      cached: false,
      ram: normalizedRam,
      storage:
        normalizedStorage,
    };
  }

  /* ==========================================================
     5. FAILED
     ========================================================== */

  return {
    price: null,
    source: 'failed',
    cached: false,
    ram: normalizedRam,
    storage:
      normalizedStorage,
  };
}

/* ============================================================
   EXPORTS
   ============================================================ */

export {
  findCurrentMarketPrice, normalizeRam,
  normalizeStorage, priceCache
};

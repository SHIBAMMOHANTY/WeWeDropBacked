/**
 * ReCommerce Valuation Engine Service
 * Implements the valuation rules, specification normalization, depreciation matrix,
 * fault deduction schedule, scrap floor, and structured JSON output.
 */

export interface ValuationEngineInput {
  modelCode: string;
  reportedRamBytes: number;
  reportedRomBytes: number;
  launchPrice: number;
  launchDate: string; // YYYY-MM-DD
  brand: string;
  defects?: string[];
  friendlyModelName?: string;
  basePriceOverride?: number; // Direct Cashify / InstaCash market base price
}

export interface AppliedDeduction {
  fault: string;
  penalty: number;
}

export interface ValuationEngineOutput {
  deviceInfo: {
    brand: string;
    modelName: string;
    variant: string;
    modelCode: string;
    ageInMonths: number;
  };
  valuationBreakdown: {
    originalMsrp: number;
    depreciatedBaseValue: number;
    totalDeductions: number;
    appliedDeductions: AppliedDeduction[];
    finalCashQuote: number;
    currency: string;
  };
  summary: string;
}

const PENALTY_SCHEDULE: Record<string, number> = {
  SCREEN_CRACKED: 2500,
  DISPLAY_BURNT_DEAD_PIXELS: 1800,
  BODY_DENTS_SCRATCHES: 1000,
  CAMERA_FAULT: 1500,
  BATTERY_HEALTH_LOW: 800,
  NO_BOX_OR_ORIGINAL_BILL: 500,
  NO_BOX_BILL: 500, // Alias support
};

/**
 * Rounds bytes to nearest standard RAM tier in GB
 */
function normalizeRam(bytes: number): number {
  const gb = bytes / (1024 * 1024 * 1024);
  const tiers = [4, 6, 8, 12, 16, 24, 32];
  return tiers.reduce((prev, curr) => (Math.abs(curr - gb) < Math.abs(prev - gb) ? curr : prev));
}

/**
 * Rounds bytes to standard ROM storage size in GB
 */
export function normalizeRom(bytes: number): number {
  const gb = bytes / (1024 * 1024 * 1024);
  const tiers = [32, 64, 128, 256, 512, 1024];
  return tiers.reduce((prev, curr) => (Math.abs(curr - gb) < Math.abs(prev - gb) ? curr : prev));
}

/**
 * Calculates device age in months relative to a given reference date
 */
function calculateAgeInMonths(launchDateStr: string, referenceDate: Date = new Date()): number {
  const launch = new Date(launchDateStr);
  if (isNaN(launch.getTime())) return 12; // Default fallback: 1 year

  const yearDiff = referenceDate.getFullYear() - launch.getFullYear();
  const monthDiff = referenceDate.getMonth() - launch.getMonth();
  const totalMonths = yearDiff * 12 + monthDiff;

  return Math.max(0, totalMonths);
}

export function calculateReCommerceValuation(input: ValuationEngineInput): ValuationEngineOutput {
  const {
    modelCode,
    reportedRamBytes,
    reportedRomBytes,
    launchPrice,
    launchDate,
    brand,
    defects = [],
    friendlyModelName,
  } = input;

  // 1. Specification Normalization
  const ramGb = normalizeRam(reportedRamBytes);
  const romGb = normalizeRom(reportedRomBytes);
  const romStr = romGb >= 1024 ? `${romGb / 1024}TB` : `${romGb}GB`;
  const variant = `${ramGb}GB / ${romStr}`;

  // 2. Base Value Calculation (Prioritize direct Cashify / InstaCash market price lookup if provided)
  const ageInMonths = calculateAgeInMonths(launchDate);
  const isApple = brand.toLowerCase().includes('apple') || friendlyModelName?.toLowerCase().includes('iphone');

  let depreciatedBaseValue: number;
  if (input.basePriceOverride && input.basePriceOverride > 0) {
    depreciatedBaseValue = input.basePriceOverride;
  } else {
    // Calibrated fallback depreciation rate:
    const monthlyRate = isApple ? 0.012 : 0.015;
    const maxCap = isApple ? 0.45 : 0.50;

    const rawDepreciation = ageInMonths * monthlyRate;
    const depreciationRate = Math.min(rawDepreciation, maxCap);
    depreciatedBaseValue = Math.round(launchPrice * (1 - depreciationRate));
  }

  // 3. Fault Deduction Schedule
  const appliedDeductions: AppliedDeduction[] = [];
  let totalDeductions = 0;

  for (const defect of defects) {
    const penalty = PENALTY_SCHEDULE[defect] ?? 0;
    if (penalty > 0) {
      appliedDeductions.push({ fault: defect, penalty });
      totalDeductions += penalty;
    }
  }

  // 4. Scrap Floor & Final Rounding
  let rawFinalQuote = depreciatedBaseValue - totalDeductions;

  // Enforce scrap floor of ₹500
  if (rawFinalQuote < 500) {
    rawFinalQuote = 500;
  }

  // Preserve exact rupees if override exists, otherwise round to nearest 100
  const finalCashQuote = input.basePriceOverride && input.basePriceOverride > 0
    ? Math.round(rawFinalQuote)
    : Math.round(rawFinalQuote / 100) * 100;

  // Summary message build
  const modelDisplay = friendlyModelName || modelCode;
  const summary = `Based on a device age of ${ageInMonths} months and reported defects (${
    defects.length > 0 ? defects.join(', ') : 'none'
  }), your ${brand} ${modelDisplay} (${variant}) has an estimated buyback value of ₹${finalCashQuote.toLocaleString('en-IN')}.`;

  return {
    deviceInfo: {
      brand,
      modelName: modelDisplay,
      variant,
      modelCode,
      ageInMonths,
    },
    valuationBreakdown: {
      originalMsrp: launchPrice,
      depreciatedBaseValue,
      totalDeductions,
      appliedDeductions,
      finalCashQuote,
      currency: 'INR',
    },
    summary,
  };
}

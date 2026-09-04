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

/**
 * Calibrated Defect Deduction Matrix & Tier Helper
 */
export interface DefectDeductionConfig {
  key: string;
  percentApple: number;
  percentAndroid: number;
  flatCutBudget?: number; // Flat cut when basePrice < 10,000
  flatCutMidTier?: number; // Flat cut when 10,000 <= basePrice <= 30,000
}

const DEFECT_MATRIX: Record<string, DefectDeductionConfig> = {
  CALLS_FAILED: { key: 'CALLS_FAILED', percentApple: 92.66, percentAndroid: 94.50 },
  NETWORK_ISSUE: { key: 'NETWORK_ISSUE', percentApple: 92.66, percentAndroid: 94.50 },
  TOUCH_NOT_WORKING: { key: 'TOUCH_NOT_WORKING', percentApple: 60.00, percentAndroid: 51.40 },
  SCREEN_NON_ORIGINAL: { key: 'SCREEN_NON_ORIGINAL', percentApple: 34.50, percentAndroid: 32.25 },
  SCREEN_CRACKED: { key: 'SCREEN_CRACKED', percentApple: 29.20, percentAndroid: 37.61 },
  SCREEN_GLASS_BROKEN: { key: 'SCREEN_GLASS_BROKEN', percentApple: 29.20, percentAndroid: 37.61 },
  DISPLAY_BURNT_DEAD_PIXELS: { key: 'DISPLAY_BURNT_DEAD_PIXELS', percentApple: 18.00, percentAndroid: 12.64, flatCutBudget: 550, flatCutMidTier: 2000 },
  DISPLAY_LINES_OR_SPOTS: { key: 'DISPLAY_LINES_OR_SPOTS', percentApple: 18.00, percentAndroid: 12.64, flatCutBudget: 550, flatCutMidTier: 2000 },
  DISPLAY_LINES: { key: 'DISPLAY_LINES', percentApple: 18.00, percentAndroid: 12.64, flatCutBudget: 550, flatCutMidTier: 2000 },
  SCREEN_SHADOW: { key: 'SCREEN_SHADOW', percentApple: 15.00, percentAndroid: 12.64, flatCutBudget: 550, flatCutMidTier: 2000 },
  CAMERA_FAULT: { key: 'CAMERA_FAULT', percentApple: 35.00, percentAndroid: 25.00, flatCutBudget: 800, flatCutMidTier: 2000 },
  BOTH_CAMERAS_FAULT: { key: 'BOTH_CAMERAS_FAULT', percentApple: 65.00, percentAndroid: 55.00 },
  CAMERA_GLASS_CRACK: { key: 'CAMERA_GLASS_CRACK', percentApple: 12.80, percentAndroid: 12.64 },
  BATTERY_HEALTH_LOW: { key: 'BATTERY_HEALTH_LOW', percentApple: 35.00, percentAndroid: 12.64, flatCutBudget: 800, flatCutMidTier: 2000 },
  FACE_ID_FINGERPRINT_DEAD: { key: 'FACE_ID_FINGERPRINT_DEAD', percentApple: 45.00, percentAndroid: 30.00 },
  WIFI_BLUETOOTH_ISSUE: { key: 'WIFI_BLUETOOTH_ISSUE', percentApple: 45.00, percentAndroid: 35.00 },
  SPEAKER_MIC_FAULT: { key: 'SPEAKER_MIC_FAULT', percentApple: 28.00, percentAndroid: 25.00 },
  CHARGING_PORT_FAULT: { key: 'CHARGING_PORT_FAULT', percentApple: 28.00, percentAndroid: 25.00 },
  BUTTONS_FAULT: { key: 'BUTTONS_FAULT', percentApple: 25.00, percentAndroid: 22.00 },
  BODY_DENTS_SCRATCHES: { key: 'BODY_DENTS_SCRATCHES', percentApple: 28.00, percentAndroid: 25.00 },
  BACK_GLASS_BROKEN: { key: 'BACK_GLASS_BROKEN', percentApple: 32.00, percentAndroid: 20.00 },
  MINOR_SCRATCHES: { key: 'MINOR_SCRATCHES', percentApple: 6.00, percentAndroid: 5.12 },
  PHONE_REPAIRED: { key: 'PHONE_REPAIRED', percentApple: 8.00, percentAndroid: 8.00 },
  SIM_SLOT_DAMAGED: { key: 'SIM_SLOT_DAMAGED', percentApple: 10.00, percentAndroid: 10.00 },
  ESIM_NOT_WORKING: { key: 'ESIM_NOT_WORKING', percentApple: 10.00, percentAndroid: 10.00 },
  SECONDARY_SIM_DAMAGED: { key: 'SECONDARY_SIM_DAMAGED', percentApple: 10.00, percentAndroid: 10.00 },
  SINGLE_ESIM_FAULTY: { key: 'SINGLE_ESIM_FAULTY', percentApple: 10.00, percentAndroid: 10.00 },
  DUAL_ESIM_FAULTY: { key: 'DUAL_ESIM_FAULTY', percentApple: 10.00, percentAndroid: 10.00 },
  DUAL_SIM_SLOT2_DAMAGED: { key: 'DUAL_SIM_SLOT2_DAMAGED', percentApple: 10.00, percentAndroid: 10.00 },
  NO_ORIGINAL_BOX: { key: 'NO_ORIGINAL_BOX', percentApple: 5.00, percentAndroid: 5.00 },
  NO_ORIGINAL_CHARGER: { key: 'NO_ORIGINAL_CHARGER', percentApple: 5.00, percentAndroid: 5.00 },
  NO_BOX_OR_ORIGINAL_BILL: { key: 'NO_BOX_OR_ORIGINAL_BILL', percentApple: 15.00, percentAndroid: 10.00 },
  NO_BOX_BILL: { key: 'NO_BOX_BILL', percentApple: 15.00, percentAndroid: 10.00 },
};

export function checkIfDeviceSupportsEsim(brand: string = '', model: string = ''): boolean {
  const b = brand.toLowerCase();
  const m = model.toLowerCase();

  if (b.includes('apple') || m.includes('iphone')) {
    if (
      m.includes('iphone xs') ||
      m.includes('iphone xr') ||
      m.includes('iphone 11') ||
      m.includes('iphone 12') ||
      m.includes('iphone 13') ||
      m.includes('iphone 14') ||
      m.includes('iphone 15') ||
      m.includes('iphone 16') ||
      m.includes('iphone 17') ||
      m.includes('iphone se')
    ) {
      return true;
    }
    return false;
  }

  if (b.includes('samsung')) {
    if (
      m.includes('s20') || m.includes('s21') || m.includes('s22') ||
      m.includes('s23') || m.includes('s24') || m.includes('note 20') ||
      m.includes('fold') || m.includes('flip') || m.includes('a54') || m.includes('a55')
    ) {
      return true;
    }
    return false;
  }

  if (b.includes('google') || m.includes('pixel')) {
    if (m.includes('pixel 3') || m.includes('pixel 4') || m.includes('pixel 5') || m.includes('pixel 6') || m.includes('pixel 7') || m.includes('pixel 8') || m.includes('pixel 9')) {
      return true;
    }
  }

  if (b.includes('oneplus')) {
    if (m.includes('11') || m.includes('12') || m.includes('open') || m.includes('13')) {
      return true;
    }
  }

  return false;
}

export function checkIfDeviceSupportsDualEsim(brand: string = '', model: string = ''): boolean {
  const b = brand.toLowerCase();
  const m = model.toLowerCase();

  if (b.includes('apple') || m.includes('iphone')) {
    if (
      m.includes('iphone 13') ||
      m.includes('iphone 14') ||
      m.includes('iphone 15') ||
      m.includes('iphone 16') ||
      m.includes('iphone 17')
    ) {
      return true;
    }
  }

  if (b.includes('samsung') && (m.includes('s24') || m.includes('fold 5') || m.includes('fold 6') || m.includes('flip 5') || m.includes('flip 6'))) {
    return true;
  }

  if ((b.includes('google') || m.includes('pixel')) && (m.includes('pixel 7') || m.includes('pixel 8') || m.includes('pixel 9'))) {
    return true;
  }

  return false;
}

/**
 * Rounds bytes to nearest standard RAM tier in GB
 */
function normalizeRam(bytes: number): number {
  const gb = bytes > 64 ? bytes / (1024 * 1024 * 1024) : bytes;
  const tiers = [4, 6, 8, 12, 16, 24, 32];
  return tiers.reduce((prev, curr) => (Math.abs(curr - gb) < Math.abs(prev - gb) ? curr : prev));
}

/**
 * Rounds bytes to standard ROM storage size in GB
 */
export function normalizeRom(bytes: number): number {
  const gb = bytes > 2048 ? bytes / (1024 * 1024 * 1024) : bytes;
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

  // 2. Base Value Calculation
  const ageInMonths = calculateAgeInMonths(launchDate);
  const isApple = brand.toLowerCase().includes('apple') || friendlyModelName?.toLowerCase().includes('iphone');

  let depreciatedBaseValue: number;
  if (input.basePriceOverride && input.basePriceOverride > 0) {
    depreciatedBaseValue = input.basePriceOverride;
  } else {
    // Calibrated market depreciation rate:
    const monthlyRate = isApple ? 0.012 : 0.015;
    const maxCap = isApple ? 0.45 : 0.50;

    const rawDepreciation = ageInMonths * monthlyRate;
    const depreciationRate = Math.min(rawDepreciation, maxCap);
    depreciatedBaseValue = Math.round(launchPrice * (1 - depreciationRate));
  }

  // 3. Scrap Floor Check (Core Calling / Network connectivity failure)
  const isCallingDead = defects.some(d => ['CALLS_FAILED', 'NETWORK_ISSUE'].includes(d.toUpperCase()));

  if (isCallingDead) {
    let scrapFloor = 1180;
    if (isApple) {
      scrapFloor = Math.max(1600, Math.round(depreciatedBaseValue * 0.0734));
    } else if (depreciatedBaseValue <= 20000) {
      // Direct 94.46% cut for Android under 20k (retain 5.54%, min floor ₹500)
      scrapFloor = Math.max(500, Math.round(depreciatedBaseValue * (1 - 0.9446)));
    }

    const scrapDeduction = Math.max(0, depreciatedBaseValue - scrapFloor);
    return {
      deviceInfo: {
        brand,
        modelName: friendlyModelName || modelCode,
        variant,
        modelCode,
        ageInMonths,
      },
      valuationBreakdown: {
        originalMsrp: launchPrice,
        depreciatedBaseValue,
        totalDeductions: scrapDeduction,
        appliedDeductions: [{ fault: 'CALLS_FAILED', penalty: scrapDeduction }],
        finalCashQuote: scrapFloor,
        currency: 'INR',
      },
      summary: `Device has core calling/motherboard failure. Applied scrap salvage floor of ₹${scrapFloor.toLocaleString('en-IN')}.`,
    };
  }

  // 4. Calibrated Defect Deductions (Strict Deduplication & Hierarchy Normalization)
  const appliedDeductions: AppliedDeduction[] = [];
  let totalDeductions = 0;
  let runningQuote = depreciatedBaseValue;

  const rawKeys = Array.from(new Set(defects.map(d => d.toUpperCase().trim())));
  const normalizedDefects: string[] = [];

  const hasTouchDead = rawKeys.includes('TOUCH_NOT_WORKING');
  const hasBothCamsDead = rawKeys.includes('BOTH_CAMERAS_FAULT');
  let hasSimSlotDeducted = false;

  for (const defectKey of rawKeys) {
    // If touch screen is dead, skip lower screen defects (prevents double deduction)
    if (hasTouchDead && ['SCREEN_NON_ORIGINAL', 'SCREEN_CRACKED', 'SCREEN_GLASS_BROKEN', 'MINOR_SCRATCHES'].includes(defectKey)) {
      continue;
    }
    // If both cameras dead, skip single camera faults (prevents double deduction)
    if (hasBothCamsDead && ['CAMERA_FAULT', 'FRONT_CAMERA_FAULT', 'BACK_CAMERA_FAULT'].includes(defectKey)) {
      continue;
    }
    // Prevent duplicate SIM slot deductions
    if (['SIM_SLOT_DAMAGED', 'ESIM_NOT_WORKING', 'SECONDARY_SIM_DAMAGED', 'SINGLE_ESIM_FAULTY', 'DUAL_ESIM_FAULTY', 'DUAL_SIM_SLOT2_DAMAGED'].includes(defectKey)) {
      if (hasSimSlotDeducted) continue;
      hasSimSlotDeducted = true;
    }
    normalizedDefects.push(defectKey);
  }

  for (const defectKey of normalizedDefects) {
    const cfg = DEFECT_MATRIX[defectKey];

    if (cfg) {
      let penalty = 0;

      // Check if flat cut applies on lower tiers
      if (depreciatedBaseValue < 10000 && cfg.flatCutBudget) {
        penalty = Math.min(runningQuote, cfg.flatCutBudget);
      } else if (depreciatedBaseValue <= 30000 && cfg.flatCutMidTier) {
        penalty = Math.min(runningQuote, cfg.flatCutMidTier);
      } else {
        const percent = isApple ? cfg.percentApple : cfg.percentAndroid;
        penalty = Math.round((depreciatedBaseValue * percent) / 100);
      }

      let faultLabel = defectKey;
      if (['SIM_SLOT_DAMAGED', 'ESIM_NOT_WORKING', 'SECONDARY_SIM_DAMAGED', 'SINGLE_ESIM_FAULTY', 'DUAL_ESIM_FAULTY', 'DUAL_SIM_SLOT2_DAMAGED'].includes(defectKey)) {
        const hasEsim = checkIfDeviceSupportsEsim(brand, friendlyModelName || modelCode);
        const isDualEsim = checkIfDeviceSupportsDualEsim(brand, friendlyModelName || modelCode);
        if (hasEsim) {
          faultLabel = isDualEsim ? 'SECONDARY_SIM_DUAL_ESIM_FAULTY' : 'SECONDARY_SIM_SINGLE_ESIM_FAULTY';
        } else {
          faultLabel = 'SECONDARY_SIM_SLOT_FAULTY';
        }
      }

      appliedDeductions.push({ fault: faultLabel, penalty });
      totalDeductions += penalty;
      runningQuote = Math.max(0, runningQuote - penalty);
    }
  }

  // 5. Guaranteed Dynamic Minimum Floor (Never Negative, ranges ₹750 - ₹1,160+ based on tier)
  let minFloor = 1160;
  if (isApple) {
    minFloor = Math.max(1600, Math.round(depreciatedBaseValue * 0.0734));
  } else if (depreciatedBaseValue < 8000) {
    minFloor = 750; // Ultra budget floor
  } else if (depreciatedBaseValue <= 25000) {
    minFloor = 1160; // Mid-tier / Budget Android floor
  } else {
    minFloor = Math.max(1600, Math.round(depreciatedBaseValue * 0.0554)); // Flagship Android floor
  }

  // Raw quote clamped to minimum floor (guaranteed never negative or zero)
  const rawFinalQuote = Math.max(minFloor, depreciatedBaseValue - totalDeductions);
  const finalCashQuote = Math.round(rawFinalQuote / 10) * 10;

  // Adjust total deductions to reflect actual payout
  const effectiveDeductions = Math.max(0, depreciatedBaseValue - finalCashQuote);

  // Summary message build
  const modelDisplay = friendlyModelName || modelCode;
  const summary = `Based on a device age of ${ageInMonths} months and reported defects (${defects.length > 0 ? defects.join(', ') : 'none'
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
      totalDeductions: effectiveDeductions,
      appliedDeductions,
      finalCashQuote,
      currency: 'INR',
    },
    summary,
  };
}

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
  canBuyback: boolean;
  rejectionReason?: string;
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
  // Page 1 Priority Items (Handled by priority override routines in valuationEngine)
  CALLS_FAILED: { key: 'CALLS_FAILED', percentApple: 98.98, percentAndroid: 97.42 },
  NETWORK_ISSUE: { key: 'NETWORK_ISSUE', percentApple: 98.98, percentAndroid: 97.42 },
  TOUCH_NOT_WORKING: { key: 'TOUCH_NOT_WORKING', percentApple: 51.56, percentAndroid: 68.41 },
  SCREEN_NON_ORIGINAL: { key: 'SCREEN_NON_ORIGINAL', percentApple: 38.57, percentAndroid: 47.00 },

  // Page 2: Screen & Display Cosmetic Defects
  SCREEN_CRACKED: { key: 'SCREEN_CRACKED', percentApple: 41.04, percentAndroid: 51.37 },
  SCREEN_GLASS_BROKEN: { key: 'SCREEN_GLASS_BROKEN', percentApple: 41.04, percentAndroid: 51.37 },
  CHIPPED_DISPLAY_OUTSIDE: { key: 'CHIPPED_DISPLAY_OUTSIDE', percentApple: 12.87, percentAndroid: 23.57 },
  SCREEN_SCRATCHES_HEAVY: { key: 'SCREEN_SCRATCHES_HEAVY', percentApple: 9.60, percentAndroid: 17.81 },
  SCREEN_SCRATCHES_MINOR: { key: 'SCREEN_SCRATCHES_MINOR', percentApple: 5.24, percentAndroid: 10.09 },
  
  // Dead Spots, Lines & Discoloration
  DEAD_SPOTS_HEAVY: { key: 'DEAD_SPOTS_HEAVY', percentApple: 24.04, percentAndroid: 43.30 },
  DISPLAY_BURNT_DEAD_PIXELS: { key: 'DISPLAY_BURNT_DEAD_PIXELS', percentApple: 24.04, percentAndroid: 43.30 },
  MINOR_SPOTS_3PLUS: { key: 'MINOR_SPOTS_3PLUS', percentApple: 17.55, percentAndroid: 31.83 },
  MINOR_SPOTS_1TO2: { key: 'MINOR_SPOTS_1TO2', percentApple: 7.25, percentAndroid: 13.48 },
  DISPLAY_LINES: { key: 'DISPLAY_LINES', percentApple: 24.04, percentAndroid: 43.30 },
  DISPLAY_LINES_OR_SPOTS: { key: 'DISPLAY_LINES_OR_SPOTS', percentApple: 24.04, percentAndroid: 43.30 },
  DISPLAY_FADED_EDGES: { key: 'DISPLAY_FADED_EDGES', percentApple: 14.95, percentAndroid: 27.24 },
  SCREEN_DISCOLORATION_MAJOR: { key: 'SCREEN_DISCOLORATION_MAJOR', percentApple: 16.25, percentAndroid: 29.54 },
  SCREEN_DISCOLORATION_MINOR: { key: 'SCREEN_DISCOLORATION_MINOR', percentApple: 7.16, percentAndroid: 13.48 },

  // Page 2: Body & Panel
  BODY_SCRATCHES_HEAVY: { key: 'BODY_SCRATCHES_HEAVY', percentApple: 13.97, percentAndroid: 10.31 },
  BODY_SCRATCHES_MINOR: { key: 'BODY_SCRATCHES_MINOR', percentApple: 8.48, percentAndroid: 8.13 },
  BODY_DENTS_MAJOR: { key: 'BODY_DENTS_MAJOR', percentApple: 17.97, percentAndroid: 11.08 },
  BODY_DENTS_MINOR: { key: 'BODY_DENTS_MINOR', percentApple: 13.97, percentAndroid: 12.50 },
  BODY_DENTS_SCRATCHES: { key: 'BODY_DENTS_SCRATCHES', percentApple: 13.97, percentAndroid: 11.08 },
  BACK_PANEL_BROKEN: { key: 'BACK_PANEL_BROKEN', percentApple: 38.94, percentAndroid: 31.16 },
  BACK_GLASS_BROKEN: { key: 'BACK_GLASS_BROKEN', percentApple: 38.94, percentAndroid: 31.16 },
  PANEL_MISSING: { key: 'PANEL_MISSING', percentApple: 38.94, percentAndroid: 31.16 },
  PANEL_BENT: { key: 'PANEL_BENT', percentApple: 38.94, percentAndroid: 31.16 },
  LOOSE_SCREEN: { key: 'LOOSE_SCREEN', percentApple: 24.96, percentAndroid: 15.23 },

  // Page 3: Functional Problems
  FRONT_CAMERA_FAULT: { key: 'FRONT_CAMERA_FAULT', percentApple: 5.00, percentAndroid: 8.67 },
  BACK_CAMERA_FAULT: { key: 'BACK_CAMERA_FAULT', percentApple: 7.33, percentAndroid: 11.95 },
  CAMERA_FAULT: { key: 'CAMERA_FAULT', percentApple: 7.33, percentAndroid: 11.95 },
  BOTH_CAMERAS_FAULT: { key: 'BOTH_CAMERAS_FAULT', percentApple: 12.33, percentAndroid: 20.60 },
  VOLUME_BUTTON_FAULT: { key: 'VOLUME_BUTTON_FAULT', percentApple: 2.48, percentAndroid: 5.40 },
  POWER_BUTTON_FAULT: { key: 'POWER_BUTTON_FAULT', percentApple: 2.48, percentAndroid: 5.40 },
  BUTTONS_FAULT: { key: 'BUTTONS_FAULT', percentApple: 2.48, percentAndroid: 5.40 },
  FINGERPRINT_DEAD: { key: 'FINGERPRINT_DEAD', percentApple: 1.97, percentAndroid: 23.63 },
  FACE_ID_FINGERPRINT_DEAD: { key: 'FACE_ID_FINGERPRINT_DEAD', percentApple: 21.97, percentAndroid: 24.71 },
  WIFI_ISSUE: { key: 'WIFI_ISSUE', percentApple: 31.97, percentAndroid: 34.91 },
  BLUETOOTH_ISSUE: { key: 'BLUETOOTH_ISSUE', percentApple: 31.97, percentAndroid: 30.65 },
  WIFI_BLUETOOTH_ISSUE: { key: 'WIFI_BLUETOOTH_ISSUE', percentApple: 31.97, percentAndroid: 34.91 },
  SPEAKER_FAULT: { key: 'SPEAKER_FAULT', percentApple: 4.13, percentAndroid: 9.11 },
  CHARGING_PORT_FAULT: { key: 'CHARGING_PORT_FAULT', percentApple: 4.13, percentAndroid: 9.11 },
  AUDIO_RECEIVER_FAULT: { key: 'AUDIO_RECEIVER_FAULT', percentApple: 4.13, percentAndroid: 9.77 },
  SPEAKER_MIC_FAULT: { key: 'SPEAKER_MIC_FAULT', percentApple: 4.13, percentAndroid: 9.11 },
  SILENT_BUTTON_FAULT: { key: 'SILENT_BUTTON_FAULT', percentApple: 3.26, percentAndroid: 7.25 },
  FACE_SENSOR_FAULT: { key: 'FACE_SENSOR_FAULT', percentApple: 21.97, percentAndroid: 24.71 },
  CAMERA_GLASS_CRACK: { key: 'CAMERA_GLASS_CRACK', percentApple: 4.39, percentAndroid: 8.67 },
  MICROPHONE_FAULT: { key: 'MICROPHONE_FAULT', percentApple: 2.48, percentAndroid: 5.40 },
  VIBRATOR_FAULT: { key: 'VIBRATOR_FAULT', percentApple: 2.48, percentAndroid: 5.40 },
  PROXIMITY_SENSOR_FAULT: { key: 'PROXIMITY_SENSOR_FAULT', percentApple: 4.96, percentAndroid: 7.32 },
  BATTERY_HEALTH_LOW: { key: 'BATTERY_HEALTH_LOW', percentApple: 5.60, percentAndroid: 4.30 },
  BATTERY_HEALTH_80_85: { key: 'BATTERY_HEALTH_80_85', percentApple: 3.06, percentAndroid: 2.00 },

  // SIM and Documentation
  SIM_SLOT_DAMAGED: { key: 'SIM_SLOT_DAMAGED', percentApple: 5.00, percentAndroid: 5.00 },
  ESIM_NOT_WORKING: { key: 'ESIM_NOT_WORKING', percentApple: 5.00, percentAndroid: 5.00 },
  SECONDARY_SIM_DAMAGED: { key: 'SECONDARY_SIM_DAMAGED', percentApple: 5.00, percentAndroid: 5.00 },
  SINGLE_ESIM_FAULTY: { key: 'SINGLE_ESIM_FAULTY', percentApple: 5.00, percentAndroid: 5.00 },
  DUAL_ESIM_FAULTY: { key: 'DUAL_ESIM_FAULTY', percentApple: 5.00, percentAndroid: 5.00 },
  DUAL_SIM_SLOT2_DAMAGED: { key: 'DUAL_SIM_SLOT2_DAMAGED', percentApple: 5.00, percentAndroid: 5.00 },
  NO_ORIGINAL_BOX: { key: 'NO_ORIGINAL_BOX', percentApple: 5.00, percentAndroid: 5.00 },
  NO_ORIGINAL_CHARGER: { key: 'NO_ORIGINAL_CHARGER', percentApple: 5.00, percentAndroid: 5.00 },
  NO_BOX_OR_ORIGINAL_BILL: { key: 'NO_BOX_OR_ORIGINAL_BILL', percentApple: 17.50, percentAndroid: 23.87 },
  NO_BOX_BILL: { key: 'NO_BOX_BILL', percentApple: 17.50, percentAndroid: 23.87 },
  MINOR_SCRATCHES: { key: 'MINOR_SCRATCHES', percentApple: 5.24, percentAndroid: 8.50 },
  PHONE_REPAIRED: { key: 'PHONE_REPAIRED', percentApple: 8.00, percentAndroid: 8.00 },
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

  // 3. PRIORITY 1: Core Calling / Network Connectivity Failure (Absolute Highest Priority)
  const isCallingDead = defects.some(d => ['CALLS_FAILED', 'NETWORK_ISSUE'].includes(d.toUpperCase()));

  if (isCallingDead) {
    let scrapFloor = 1180;
    if (depreciatedBaseValue < 8000 || launchPrice < 8000) {
      scrapFloor = 480;
    } else if (depreciatedBaseValue <= 23000) {
      scrapFloor = 780;
    } else {
      scrapFloor = 1180;
    }

    const scrapDeduction = Math.max(0, depreciatedBaseValue - scrapFloor);
    return {
      canBuyback: true,
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
      summary: `Calling/Network functionality dead. Immediate priority applied with fixed segment scrap value of ₹${scrapFloor.toLocaleString('en-IN')}.`,
    };
  }

  // 4. PRIORITY 2: Touch Screen Working = false
  const rawKeys = Array.from(new Set(defects.map(d => d.toUpperCase().trim())));
  const hasTouchDead = rawKeys.includes('TOUCH_NOT_WORKING');

  if (hasTouchDead) {
    // Touch screen is dead - overrides non-original screen and all page 2/3 cosmetic & functional defects
    let touchQuoteRatio = 0.33; // Default ~67% deduction
    if (isApple && depreciatedBaseValue > 50000) {
      touchQuoteRatio = 0.4941; // ~50.6% retained for premium Apple flagship
    } else if (depreciatedBaseValue < 8000) {
      touchQuoteRatio = 0.52; // Budget retain floor
    } else if (depreciatedBaseValue <= 23000) {
      touchQuoteRatio = 0.356; // Mid-range ~64.4% deduction
    }

    const finalTouchQuote = Math.round((depreciatedBaseValue * touchQuoteRatio) / 10) * 10;
    const touchPenalty = Math.max(0, depreciatedBaseValue - finalTouchQuote);

    return {
      canBuyback: true,
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
        totalDeductions: touchPenalty,
        appliedDeductions: [{ fault: 'TOUCH_NOT_WORKING', penalty: touchPenalty }],
        finalCashQuote: finalTouchQuote,
        currency: 'INR',
      },
      summary: `Touch screen is non-functional. Priority override applied showing only touch screen faulty valuation of ₹${finalTouchQuote.toLocaleString('en-IN')}.`,
    };
  }

  // 5. PRIORITY 3: Screen Non-Original (Replacement Screen)
  const hasNonOriginalScreen = rawKeys.includes('SCREEN_NON_ORIGINAL');

  if (hasNonOriginalScreen) {
    // Non-original screen - overrides minor screen cosmetic defects and page 3 defects
    let nonOriginalRetainRatio = 0.534; // ~46.6% deduction
    if (isApple && depreciatedBaseValue > 50000) {
      nonOriginalRetainRatio = 0.6266; // ~37.34% deduction for premium Apple flagship
    } else if (depreciatedBaseValue <= 23000) {
      nonOriginalRetainRatio = 0.5621; // ~43.8% deduction for mid-range
    }

    const finalNonOriginalQuote = Math.round((depreciatedBaseValue * nonOriginalRetainRatio) / 10) * 10;
    const nonOriginalPenalty = Math.max(0, depreciatedBaseValue - finalNonOriginalQuote);

    return {
      canBuyback: true,
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
        totalDeductions: nonOriginalPenalty,
        appliedDeductions: [{ fault: 'SCREEN_NON_ORIGINAL', penalty: nonOriginalPenalty }],
        finalCashQuote: finalNonOriginalQuote,
        currency: 'INR',
      },
      summary: `Non-original replacement screen reported. Priority override applied with fixed replacement screen valuation of ₹${finalNonOriginalQuote.toLocaleString('en-IN')}.`,
    };
  }

  // 6. PRIORITY 4 & 5: Cumulative Page 2 & Page 3 Defect Deductions
  const appliedDeductions: AppliedDeduction[] = [];
  let totalDeductions = 0;
  let runningQuote = depreciatedBaseValue;

  const normalizedDefects: string[] = [];
  const hasBothCamsDead = rawKeys.includes('BOTH_CAMERAS_FAULT');
  let hasSimSlotDeducted = false;
  let hasWarrantyOrBillDeducted = false;

  for (const defectKey of rawKeys) {
    // Single deduction for Out of Warranty / No GST Bill (they represent the same state)
    if (['NO_WARRANTY', 'NO_GST_BILL', 'NO_BOX_OR_ORIGINAL_BILL', 'NO_BOX_BILL'].includes(defectKey)) {
      if (hasWarrantyOrBillDeducted) continue;
      hasWarrantyOrBillDeducted = true;
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

  // 7. Excessive Defects Rejection Check
  const modelDisplay = friendlyModelName || modelCode;
  const isExcessiveDefects = totalDeductions >= depreciatedBaseValue * 0.82 || normalizedDefects.length >= 5;

  if (isExcessiveDefects) {
    return {
      canBuyback: false,
      rejectionReason: "Sorry, we can't take your device due to excessive physical or functional defects.",
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
        finalCashQuote: 0,
        currency: 'INR',
      },
      summary: "Sorry, we can't take your device.",
    };
  }

  // 8. Guaranteed Dynamic Minimum Floor (Never Negative, ranges ₹750 - ₹1,160+ based on tier)
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

  const summary = `Based on a device age of ${ageInMonths} months and reported defects (${defects.length > 0 ? defects.join(', ') : 'none'
    }), your ${brand} ${modelDisplay} (${variant}) has an estimated buyback value of ₹${finalCashQuote.toLocaleString('en-IN')}.`;

  return {
    canBuyback: true,
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

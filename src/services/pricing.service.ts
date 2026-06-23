import { prisma } from '@/lib/prisma';

export interface QuoteCalculationRequest {
  brand: string;
  model: string;
  storage: string;
  condition: 'excellent' | 'good' | 'average' | string;
  screenCracked: boolean;
  batteryHealth: number;
  cameraIssue: boolean;
  fingerprintIssue: boolean;
  faceIdIssue: boolean;
  bodyDamage: boolean;
  speakerIssue: boolean;
  chargingPortIssue: boolean;
}

export interface QuoteCalculationResponse {
  success: boolean;
  estimatedPrice: number;
  breakdown: {
    basePrice: number;
    screenDamageDeduction?: number;
    batteryDeduction?: number;
    cameraDeduction?: number;
    fingerprintDeduction?: number;
    faceIdDeduction?: number;
    bodyDamageDeduction?: number;
    speakerDeduction?: number;
    chargingPortDeduction?: number;
  };
}

export class PricingService {
  /**
   * Calculates the buyback value of a mobile device using Prisma database client.
   */
  static async calculateQuote(
    data: QuoteCalculationRequest
  ): Promise<QuoteCalculationResponse> {
    // 1. Fetch matching Device Master using case-insensitive constraints
    const device = await prisma.deviceMaster.findFirst({
      where: {
        brand: { equals: data.brand.trim(), mode: 'insensitive' },
        model: { equals: data.model.trim(), mode: 'insensitive' },
        storage: { equals: data.storage.trim(), mode: 'insensitive' },
        isActive: true,
      },
    });

    if (!device) {
      throw new Error(`Device not found or inactive for Brand: ${data.brand}, Model: ${data.model}, Storage: ${data.storage}`);
    }

    // 2. Determine base price depending on condition
    let basePrice = 0;
    const normalizedCondition = data.condition.trim().toLowerCase();

    if (normalizedCondition === 'excellent') {
      basePrice = device.basePriceExcellent;
    } else if (normalizedCondition === 'good') {
      basePrice = device.basePriceGood;
    } else if (normalizedCondition === 'average') {
      basePrice = device.basePriceAverage;
    } else {
      throw new Error(`Invalid device condition: '${data.condition}'. Supported values are: excellent, good, average`);
    }

    // 3. Fetch active Price Rules config from MongoDB via Prisma
    const rules = await prisma.priceRule.findFirst({
      where: { isActive: true },
    });
    
    // Default fallback rules in case database isn't seeded yet
    const activeRules = rules || {
      screenDamageDeduction: 0,
      batteryDeduction: 0,
      cameraDeduction: 0,
      fingerprintDeduction: 0,
      faceIdDeduction: 0,
      bodyDamageDeduction: 0,
      speakerDeduction: 0,
      chargingPortDeduction: 0,
    };

    // 4. Apply deductions
    const breakdown: any = { basePrice };
    let totalDeduction = 0;

    // Screen Damage
    if (data.screenCracked && activeRules.screenDamageDeduction > 0) {
      breakdown.screenDamageDeduction = activeRules.screenDamageDeduction;
      totalDeduction += activeRules.screenDamageDeduction;
    }

    // Battery Health < 80
    if (data.batteryHealth < 80 && activeRules.batteryDeduction > 0) {
      breakdown.batteryDeduction = activeRules.batteryDeduction;
      totalDeduction += activeRules.batteryDeduction;
    }

    // Camera Issue
    if (data.cameraIssue && activeRules.cameraDeduction > 0) {
      breakdown.cameraDeduction = activeRules.cameraDeduction;
      totalDeduction += activeRules.cameraDeduction;
    }

    // Fingerprint Issue
    if (data.fingerprintIssue && activeRules.fingerprintDeduction > 0) {
      breakdown.fingerprintDeduction = activeRules.fingerprintDeduction;
      totalDeduction += activeRules.fingerprintDeduction;
    }

    // Face ID Issue
    if (data.faceIdIssue && activeRules.faceIdDeduction > 0) {
      breakdown.faceIdDeduction = activeRules.faceIdDeduction;
      totalDeduction += activeRules.faceIdDeduction;
    }

    // Body Damage
    if (data.bodyDamage && activeRules.bodyDamageDeduction > 0) {
      breakdown.bodyDamageDeduction = activeRules.bodyDamageDeduction;
      totalDeduction += activeRules.bodyDamageDeduction;
    }

    // Speaker Issue
    if (data.speakerIssue && activeRules.speakerDeduction > 0) {
      breakdown.speakerDeduction = activeRules.speakerDeduction;
      totalDeduction += activeRules.speakerDeduction;
    }

    // Charging Port Issue
    if (data.chargingPortIssue && activeRules.chargingPortDeduction > 0) {
      breakdown.chargingPortDeduction = activeRules.chargingPortDeduction;
      totalDeduction += activeRules.chargingPortDeduction;
    }

    // Calculate final price ensuring it never falls below 0
    const estimatedPrice = Math.max(0, basePrice - totalDeduction);

    return {
      success: true,
      estimatedPrice,
      breakdown,
    };
  }
}

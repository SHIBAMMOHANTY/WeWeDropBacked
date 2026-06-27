import { z } from 'zod';
import { QuoteRequest, QuoteResponse } from '@/lib/mobile/interfaces';
import { prisma } from '@/lib/prisma';

// Zod Input Validation Schema
export const QuoteInputSchema = z.object({
  brand:         z.string().min(1, 'Brand is required'),
  model:         z.string().min(1, 'Model is required'),
  storage:       z.string().min(1, 'Storage is required'),
  condition:     z.enum(['excellent', 'good', 'average'], {
    errorMap: () => ({ message: "Condition must be 'excellent', 'good', or 'average'" }),
  }),
  batteryHealth: z.number().min(0).max(100, 'Battery health must be between 0 and 100'),
  screenDamage:  z.boolean(),
  accessories:   z.array(z.string()),
});

export class QuoteService {
  /**
   * Parse release year from YYYY-MM-DD or YYYY string
   */
  private static getReleaseYear(releaseDate?: string | null): number {
    if (!releaseDate) return 2024;
    const year = parseInt(releaseDate.split('-')[0], 10);
    return isNaN(year) ? 2024 : year;
  }

  /**
   * Estimate current market price from launch price and age
   */
  private static estimateMarketPrice(launchPrice: number, releaseYear: number): number {
    const currentYear = new Date().getFullYear();
    const age = Math.max(0, currentYear - releaseYear);
    let factor = 0.85;
    if (age === 2) factor = 0.70;
    else if (age === 3) factor = 0.55;
    else if (age >= 4) factor = 0.40;
    return Math.round(launchPrice * factor);
  }

  /**
   * Calculate mobile buyback quote estimation
   */
  static async calculateQuote(rawInput: any): Promise<QuoteResponse> {
    const { brand, model, storage, condition, batteryHealth, screenDamage, accessories } =
      QuoteInputSchema.parse(rawInput);

    // ─── 1. Find in DeviceMaster (buyback catalog) — most reliable source ───
    const brandKeywords = brand.split(/\s+/);
    const modelKeywords = model.split(/\s+/);

    const masterDevice = await prisma.deviceMaster.findFirst({
      where: {
        AND: [
          ...brandKeywords.map(kw => ({ brand: { contains: kw, mode: 'insensitive' as const } })),
          ...modelKeywords.map(kw => ({ model: { contains: kw, mode: 'insensitive' as const } })),
          { storage: { contains: storage, mode: 'insensitive' } },
          { isActive: true },
        ],
      },
    });

    // ─── 2. If no storage match, try without storage constraint ───
    const masterDeviceNoStorage = !masterDevice
      ? await prisma.deviceMaster.findFirst({
          where: {
            AND: [
              ...brandKeywords.map(kw => ({ brand: { contains: kw, mode: 'insensitive' as const } })),
              ...modelKeywords.map(kw => ({ model: { contains: kw, mode: 'insensitive' as const } })),
              { isActive: true },
            ],
          },
          orderBy: { launchPrice: 'desc' }, // pick the highest variant as baseline
        })
      : null;

    const dm = masterDevice ?? masterDeviceNoStorage;

    let basePrice: number;
    let launchPrice: number;
    let releaseYear: number;

    if (dm) {
      launchPrice  = dm.launchPrice;
      releaseYear  = this.getReleaseYear(dm.launchDate);

      // Use condition-specific buyback price from DeviceMaster as the base
      if (condition === 'excellent') {
        basePrice = dm.basePriceExcellent;
      } else if (condition === 'good') {
        basePrice = dm.basePriceGood;
      } else {
        basePrice = dm.basePriceAverage;
      }
    } else {
      // ─── 3. Generic estimation fallback ───
      // Rough launch price guess from brand tier
      const brandLower = brand.toLowerCase();
      if (brandLower.includes('apple') || brandLower.includes('iphone')) {
        launchPrice = 80000;
      } else if (brandLower.includes('samsung') && model.toLowerCase().includes('ultra')) {
        launchPrice = 120000;
      } else if (brandLower.includes('samsung')) {
        launchPrice = 50000;
      } else if (brandLower.includes('oneplus')) {
        launchPrice = 40000;
      } else {
        launchPrice = 25000;
      }
      releaseYear = 2023;
      const marketPrice = this.estimateMarketPrice(launchPrice, releaseYear);
      basePrice = condition === 'excellent'
        ? Math.round(marketPrice * 0.55)
        : condition === 'good'
          ? Math.round(marketPrice * 0.45)
          : Math.round(marketPrice * 0.35);
    }

    // ─── Apply deductions on top of the base buyback price ───

    // 1. Battery health deduction
    let batteryMultiplier = 1.0;
    if (batteryHealth < 80) {
      batteryMultiplier = 0.85;
    } else if (batteryHealth < 85) {
      batteryMultiplier = 0.94;
    }

    // 2. Screen damage deduction
    const screenDamageMultiplier = screenDamage ? 0.70 : 1.0;

    // 3. Missing accessories deductions
    let accessoriesMultiplier = 1.0;
    const lowerAccessories = accessories.map(a => a.toLowerCase());
    if (!lowerAccessories.includes('charger')) accessoriesMultiplier *= 0.97;
    if (!lowerAccessories.includes('box'))     accessoriesMultiplier *= 0.98;
    if (!lowerAccessories.includes('bill'))    accessoriesMultiplier *= 0.95;

    // Final price
    let estimatedPrice = basePrice * batteryMultiplier * screenDamageMultiplier * accessoriesMultiplier;

    // Floor: at least 10% of launch price
    const minFloorPrice = launchPrice * 0.10;
    if (estimatedPrice < minFloorPrice) estimatedPrice = minFloorPrice;

    // Round to nearest 100
    estimatedPrice = Math.round(estimatedPrice / 100) * 100;
    const minPrice = Math.round((estimatedPrice * 0.90) / 100) * 100;
    const maxPrice = Math.round((estimatedPrice * 1.10) / 100) * 100;

    // Confidence score
    let confidenceScore = dm ? 0.85 : 0.55;
    if (masterDevice) confidenceScore = Math.min(1.0, confidenceScore + 0.10); // exact storage match
    if (batteryHealth >= 85) confidenceScore = Math.min(1.0, confidenceScore + 0.05);
    if (!screenDamage)       confidenceScore = Math.min(1.0, confidenceScore + 0.05);

    return { estimatedPrice, minPrice, maxPrice, confidenceScore };
  }
}

import { z } from 'zod';
import { QuoteRequest, QuoteResponse } from '@/lib/mobile/interfaces';
import { DeviceRepository } from '@/repositories/mobile/device.repository';
import { PriceService } from './price.service';
import { ScraperService } from './scraper.service';

// Zod Input Validation Schema
export const QuoteInputSchema = z.object({
  brand: z.string().min(1, 'Brand is required'),
  model: z.string().min(1, 'Model is required'),
  storage: z.string().min(1, 'Storage is required'),
  condition: z.enum(['excellent', 'good', 'average'], {
    errorMap: () => ({ message: "Condition must be 'excellent', 'good', or 'average'" }),
  }),
  batteryHealth: z.number().min(0).max(100, 'Battery health must be between 0 and 100'),
  screenDamage: z.boolean(),
  accessories: z.array(z.string()),
});

export class QuoteService {
  /**
   * Helper to slugify brand and model
   */
  private static makeSlug(brand: string, model: string, storage: string): string {
    return `${brand}-${model}-${storage}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  /**
   * Helper to parse release year from release date string (YYYY-MM-DD)
   */
  private static getReleaseYear(releaseDate?: string | null): number {
    if (!releaseDate) return 2024;
    const year = parseInt(releaseDate.split('-')[0], 10);
    return isNaN(year) ? 2024 : year;
  }

  /**
   * Calculate mobile buyback quote estimation
   */
  static async calculateQuote(rawInput: any): Promise<QuoteResponse> {
    // Validate inputs
    const validatedInput = QuoteInputSchema.parse(rawInput);
    const { brand, model, storage, condition, batteryHealth, screenDamage, accessories } = validatedInput;

    const slug = this.makeSlug(brand, model, storage);
    let device = await DeviceRepository.findBySlug(slug);
    let isLiveDevice = !!device;

    // If device doesn't exist, try scraping and creating a new Device record
    if (!device) {
      const query = `${brand} ${model} ${storage}`;
      const searchResults = await ScraperService.search(query, 1);
      
      if (searchResults.length > 0) {
        // Find best match in scraped results to fetch detailed specifications page
        const match = searchResults[0];
        let detailSpecs = match.url 
          ? await ScraperService.fetchDetails(match.url)
          : null;

        if (!detailSpecs) {
          detailSpecs = ScraperService.parseSpecsFromKeySpecs(match.model, match.keySpecs || [], match.image, match.price || 0, match.mrp || 0);
        }

        device = await DeviceRepository.create({
          slug,
          brand: detailSpecs.brand,
          model: detailSpecs.model,
          display: detailSpecs.display,
          processor: detailSpecs.processor,
          ram: detailSpecs.ram,
          storage: detailSpecs.storage || storage,
          battery: detailSpecs.battery,
          camera: detailSpecs.camera,
          os: detailSpecs.os,
          images: detailSpecs.images && detailSpecs.images.length > 0 ? detailSpecs.images : [match.image],
          launchPrice: detailSpecs.launchPrice || match.price || 50000,
          releaseDate: detailSpecs.releaseDate || match.releaseDate,
        });
      } else {
        // Ultimate fallback: Create a dummy device mapping
        device = await DeviceRepository.create({
          slug,
          brand,
          model,
          storage,
          images: [],
          launchPrice: 60000,
          releaseDate: '2024-01-01',
        });
      }
    }

    // Collect current market prices for baseline calculations
    const pricesData = await PriceService.collectPrices(device.id);
    const baseMarketPrice = pricesData.averagePrice;

    // 1. Device Age depreciation
    const currentYear = new Date().getFullYear(); // 2026 in system
    const releaseYear = this.getReleaseYear(device.releaseDate);
    const age = Math.max(0, currentYear - releaseYear);

    let ageMultiplier = 0.85; // <= 1 year
    if (age === 2) {
      ageMultiplier = 0.70;
    } else if (age === 3) {
      ageMultiplier = 0.55;
    } else if (age >= 4) {
      ageMultiplier = 0.40;
    }

    // Brand bonus (premium brands retain value better)
    const brandLower = brand.toLowerCase();
    if (brandLower.includes('apple') || brandLower.includes('iphone')) {
      ageMultiplier *= 1.05; // retains +5%
    } else if (brandLower.includes('samsung')) {
      ageMultiplier *= 1.02; // retains +2%
    }

    // 2. Condition multiplier
    let conditionMultiplier = 1.0; // excellent
    if (condition === 'good') {
      conditionMultiplier = 0.88; // -12%
    } else if (condition === 'average') {
      conditionMultiplier = 0.75; // -25%
    }

    // 3. Battery health deductions
    let batteryMultiplier = 1.0;
    if (batteryHealth < 80) {
      batteryMultiplier = 0.85; // -15%
    } else if (batteryHealth < 85) {
      batteryMultiplier = 0.94; // -6%
    }

    // 4. Screen Damage deduction
    const screenDamageMultiplier = screenDamage ? 0.70 : 1.0; // -30%

    // 5. Accessories deductions (deduct if standard accessories are missing)
    let accessoriesMultiplier = 1.0;
    const lowerAccessories = accessories.map(a => a.toLowerCase());
    
    if (!lowerAccessories.includes('charger')) {
      accessoriesMultiplier *= 0.97; // -3%
    }
    if (!lowerAccessories.includes('box')) {
      accessoriesMultiplier *= 0.98; // -2%
    }
    if (!lowerAccessories.includes('bill')) {
      accessoriesMultiplier *= 0.95; // -5%
    }

    // Calculate estimated buyback price
    let estimatedPrice =
      baseMarketPrice *
      ageMultiplier *
      conditionMultiplier *
      batteryMultiplier *
      screenDamageMultiplier *
      accessoriesMultiplier;

    // Floor price: Device should retain at least 15% of the current market value if functional
    const minFloorPrice = baseMarketPrice * 0.15;
    if (estimatedPrice < minFloorPrice) {
      estimatedPrice = minFloorPrice;
    }

    // Round to nearest 100
    estimatedPrice = Math.round(estimatedPrice / 100) * 100;

    const minPrice = Math.round((estimatedPrice * 0.9) / 100) * 100;
    const maxPrice = Math.round((estimatedPrice * 1.1) / 100) * 100;

    // Calculate Confidence Score
    let confidenceScore = 0.6;
    if (isLiveDevice) confidenceScore += 0.2;
    if (pricesData.prices.some(p => p.price > 0 && p.seller === 'Flipkart')) confidenceScore += 0.1;
    if (batteryHealth >= 85) confidenceScore += 0.1;

    // Clamp confidence score between 0.0 and 1.0
    confidenceScore = Math.min(1.0, Math.max(0.0, confidenceScore));

    return {
      estimatedPrice,
      minPrice,
      maxPrice,
      confidenceScore,
    };
  }
}

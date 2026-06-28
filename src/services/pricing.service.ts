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
  modelSlug?: string; // Optional real-time API slug
  launchPrice?: number;
}

export interface QuoteCalculationResponse {
  success: boolean;
  estimatedPrice: number;
  launchPrice?: number;
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

/**
 * Fallback estimator to determine a device's base price if it's not pre-configured in the database.
 */
function estimateFallbackBasePrice(brand: string, modelName: string): { excellent: number; good: number; average: number } {
  const brandLower = brand.toLowerCase();
  const modelLower = modelName.toLowerCase();
  let excellentPrice = 12000; // default fallback

  // 1. APPLE IPHONES
  if (brandLower.includes("apple") || modelLower.includes("iphone")) {
    let yearBase = 32000;
    
    if (modelLower.includes("15")) yearBase = 52000;
    else if (modelLower.includes("16")) yearBase = 68000;
    else if (modelLower.includes("14")) yearBase = 42000;
    else if (modelLower.includes("13")) yearBase = 32000;
    else if (modelLower.includes("12")) yearBase = 24000;
    else if (modelLower.includes("11")) yearBase = 18000;
    else if (modelLower.includes("xs") || modelLower.includes("xr")) yearBase = 12000;
    else if (modelLower.includes("se")) yearBase = 10000;
    else if (modelLower.includes("8") || modelLower.includes("7") || modelLower.includes("6")) yearBase = 6000;

    let tierMultiplier = 1.0;
    if (modelLower.includes("pro max")) tierMultiplier = 1.6;
    else if (modelLower.includes("pro")) tierMultiplier = 1.4;
    else if (modelLower.includes("plus")) tierMultiplier = 1.2;
    else if (modelLower.includes("mini")) tierMultiplier = 0.85;

    excellentPrice = Math.round(yearBase * tierMultiplier);
  }
  // 2. SAMSUNG
  else if (brandLower.includes("samsung")) {
    if (modelLower.includes("ultra")) {
      if (modelLower.includes("s24")) excellentPrice = 82000;
      else if (modelLower.includes("s23")) excellentPrice = 62000;
      else if (modelLower.includes("s22")) excellentPrice = 45000;
      else if (modelLower.includes("s21")) excellentPrice = 32000;
      else excellentPrice = 28000;
    } else if (modelLower.includes("fold")) {
      if (modelLower.includes("6")) excellentPrice = 75000;
      else if (modelLower.includes("5")) excellentPrice = 58000;
      else if (modelLower.includes("4")) excellentPrice = 42000;
      else excellentPrice = 30000;
    } else if (modelLower.includes("flip")) {
      if (modelLower.includes("6")) excellentPrice = 45000;
      else if (modelLower.includes("5")) excellentPrice = 36000;
      else if (modelLower.includes("4")) excellentPrice = 26000;
      else excellentPrice = 18000;
    } else if (modelLower.includes("s24")) excellentPrice = 48000;
    else if (modelLower.includes("s23")) excellentPrice = 38000;
    else if (modelLower.includes("s22")) excellentPrice = 28000;
    else if (modelLower.includes("s21")) excellentPrice = 18000;
    else if (modelLower.includes("a55") || modelLower.includes("a54")) excellentPrice = 20000;
    else if (modelLower.includes("a35") || modelLower.includes("a34")) excellentPrice = 14000;
    else if (modelLower.includes("a25") || modelLower.includes("a15")) excellentPrice = 9500;
    else excellentPrice = 8000;
  }
  // 3. ONEPLUS
  else if (brandLower.includes("oneplus")) {
    if (modelLower.includes("12")) excellentPrice = 46000;
    else if (modelLower.includes("11")) excellentPrice = 34000;
    else if (modelLower.includes("10")) excellentPrice = 24000;
    else if (modelLower.includes("9")) excellentPrice = 16000;
    else if (modelLower.includes("nord")) {
      if (modelLower.includes("ce")) excellentPrice = 9000;
      else excellentPrice = 13000;
    } else excellentPrice = 14000;
  }
  // 4. GOOGLE PIXEL
  else if (brandLower.includes("google") || modelLower.includes("pixel")) {
    excellentPrice = 15000;
    if (modelLower.includes("8 pro")) excellentPrice = 56000;
    else if (modelLower.includes("8")) excellentPrice = 38000;
    else if (modelLower.includes("7 pro")) excellentPrice = 38000;
    else if (modelLower.includes("7")) excellentPrice = 25000;
    else if (modelLower.includes("6 pro")) excellentPrice = 24000;
    else if (modelLower.includes("6")) excellentPrice = 18000;
  }
  // 5. OTHER BRANDS
  else {
    if (modelLower.includes("pro plus") || modelLower.includes("pro+")) excellentPrice = 15000;
    else if (modelLower.includes("pro") || modelLower.includes("ultra")) excellentPrice = 12500;
    else if (modelLower.includes("neo") || modelLower.includes("gt")) excellentPrice = 11000;
    else excellentPrice = 7500;
  }

  return {
    excellent: excellentPrice,
    good: Math.round(excellentPrice * 0.9),
    average: Math.round(excellentPrice * 0.78),
  };
}

function cleanModelName(model: string, brand: string): string {
  let m = model.trim();
  m = m.replace(/\s*\([^)]*\)/g, '').trim();
  const brandLower = brand.toLowerCase().trim();
  if (m.toLowerCase().startsWith(brandLower)) {
    m = m.substring(brandLower.length).trim();
  }
  return m;
}

function getDeductionPercentage(ruleValue: number): number {
  if (ruleValue <= 0) return 0;
  if (ruleValue > 100) {
    return ruleValue / 10000;
  }
  return ruleValue / 100;
}

interface APIDeviceSpecs {
  launchPrice?: number;
  releaseYear?: number;
  thumbnail?: string;
}

/**
 * Fetch specifications and pricing in real-time from phone-specs-api.
 */
async function fetchSpecsFromAPI(brandName: string, modelName: string, modelSlug?: string): Promise<APIDeviceSpecs | null> {
  try {
    let slug = modelSlug;

    // Clean modelName to remove storage/variant suffixes like "(128GB)" or "128GB"
    const cleanedModelName = modelName
      .replace(/\(\d+GB\)/gi, '')
      .replace(/\b\d+GB\b/gi, '')
      .replace(/\(\s*\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Step 1: If modelSlug is not provided, look it up by searching brand and model
    if (!slug) {
      const brandsRes = await fetch("https://phone-specs-api.vercel.app/brands");
      if (!brandsRes.ok) return null;
      const brandsJson = await brandsRes.json();
      if (!brandsJson.status || !brandsJson.data) return null;

      const brandList = brandsJson.data as Array<{ brand_name: string; brand_slug: string }>;
      const matchedBrand = brandList.find(b => b.brand_name.toLowerCase().trim() === brandName.toLowerCase().trim());
      if (!matchedBrand) return null;

      const modelsRes = await fetch(`https://phone-specs-api.vercel.app/brands/${matchedBrand.brand_slug}`);
      if (!modelsRes.ok) return null;
      const modelsJson = await modelsRes.json();
      if (!modelsJson.status || !modelsJson.data || !modelsJson.data.phones) return null;

      const modelList = modelsJson.data.phones as Array<{ phone_name: string; slug: string }>;
      let matchedModel = modelList.find(m => m.phone_name.toLowerCase().trim() === cleanedModelName.toLowerCase());
      if (!matchedModel) {
        matchedModel = modelList.find(m => m.phone_name.toLowerCase().includes(cleanedModelName.toLowerCase()) || cleanedModelName.toLowerCase().includes(m.phone_name.toLowerCase()));
      }
      if (!matchedModel) return null;
      slug = matchedModel.slug;
    }

    // Step 2: Fetch specs for slug
    const detailsRes = await fetch(`https://phone-specs-api.vercel.app/${slug}`);
    if (!detailsRes.ok) return null;
    const detailsJson = await detailsRes.json();
    if (!detailsJson.status || !detailsJson.data) return null;

    const data = detailsJson.data;
    let priceStr = "";
    let year = 2026;

    // Extract release date year
    if (data.release_date) {
      const match = data.release_date.match(/\b(20\d{2})\b/);
      if (match) {
        year = parseInt(match[1], 10);
      }
    }

    // Extract price from specifications
    if (data.specifications) {
      for (const group of data.specifications) {
        for (const spec of group.specs) {
          if (spec.key.toLowerCase() === 'price') {
            if (spec.val && spec.val.length > 0) {
              priceStr = spec.val[0];
            }
          }
        }
      }
    }

    let parsedLaunchPrice = 0;
    if (priceStr) {
      const parseCleanNumber = (valStr: string): number => {
        const cleaned = valStr.replace(/[^\d.]/g, '');
        return parseFloat(cleaned) || 0;
      };

      const parts = priceStr.split('/');
      let inrPrice = 0;
      let usdPrice = 0;
      let eurPrice = 0;
      let gbpPrice = 0;
      let cadPrice = 0;

      for (const part of parts) {
        const cleanPart = part.trim();
        if (cleanPart.includes('₹') || cleanPart.toLowerCase().includes('inr') || cleanPart.includes('Rs.')) {
          inrPrice = parseCleanNumber(cleanPart);
        } else if (cleanPart.includes('$') && !cleanPart.includes('C$')) {
          usdPrice = parseCleanNumber(cleanPart);
        } else if (cleanPart.includes('€') || cleanPart.toLowerCase().includes('eur')) {
          eurPrice = parseCleanNumber(cleanPart);
        } else if (cleanPart.includes('£') || cleanPart.toLowerCase().includes('gbp')) {
          gbpPrice = parseCleanNumber(cleanPart);
        } else if (cleanPart.includes('C$') || cleanPart.toLowerCase().includes('cad')) {
          cadPrice = parseCleanNumber(cleanPart);
        }
      }

      if (inrPrice > 0) parsedLaunchPrice = inrPrice;
      else if (usdPrice > 0) parsedLaunchPrice = usdPrice * 83.5;
      else if (eurPrice > 0) parsedLaunchPrice = eurPrice * 90.0;
      else if (gbpPrice > 0) parsedLaunchPrice = gbpPrice * 106.0;
      else if (cadPrice > 0) parsedLaunchPrice = cadPrice * 61.0;
      else {
        const firstNum = parseCleanNumber(parts[0]);
        if (firstNum > 0) parsedLaunchPrice = firstNum * 83.5;
      }
    }

    return {
      launchPrice: parsedLaunchPrice > 0 ? Math.round(parsedLaunchPrice) : undefined,
      releaseYear: year,
      thumbnail: data.thumbnail
    };
  } catch (err) {
    console.error("Error fetching specs from phone-specs-api:", err);
    return null;
  }
}

export class PricingService {
  /**
   * Calculates the buyback value of a mobile device using Prisma database client and real-time API.
   */
  static async calculateQuote(
    data: QuoteCalculationRequest
  ): Promise<QuoteCalculationResponse> {
    let basePriceExcellent = 0;
    let basePriceGood = 0;
    let basePriceAverage = 0;
    let launchPrice = 0;
    let releaseYear = 2026;

    const cleanedModel = cleanModelName(data.model, data.brand);

    // 1. Fetch matching Device Master using case-insensitive constraints from DB first (most reliable source)
    const device = await prisma.deviceMaster.findFirst({
      where: {
        brand: { equals: data.brand.trim(), mode: 'insensitive' },
        OR: [
          { model: { equals: data.model.trim(), mode: 'insensitive' } },
          { model: { equals: cleanedModel, mode: 'insensitive' } },
          { model: { contains: cleanedModel, mode: 'insensitive' } }
        ],
        storage: { equals: data.storage.trim(), mode: 'insensitive' },
        isActive: true,
      },
    });

    if (device) {
      basePriceExcellent = device.basePriceExcellent;
      basePriceGood = device.basePriceGood;
      basePriceAverage = device.basePriceAverage;
      launchPrice = data.launchPrice || device.launchPrice;
      if (device.launchDate) {
        const year = parseInt(device.launchDate.split('-')[0], 10);
        releaseYear = isNaN(year) ? 2024 : year;
      } else {
        releaseYear = 2024;
      }
    } else {
      // 2. Bypassed or not found in DeviceMaster, try matching in registered Device collection
      const deviceSlug = `${data.brand}-${data.model}-${data.storage || '128GB'}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

      const dbDevice = await prisma.device.findUnique({
        where: { slug: deviceSlug },
      });

      if (dbDevice && dbDevice.launchPrice && dbDevice.launchPrice > 0) {
        launchPrice = data.launchPrice || dbDevice.launchPrice;
        if (dbDevice.releaseDate) {
          const year = parseInt(dbDevice.releaseDate.split('-')[0], 10);
          releaseYear = isNaN(year) ? 2024 : year;
        } else {
          releaseYear = 2024;
        }

        const ageYears = Math.max(0, 2026 - releaseYear);
        let multiplierExcellent = 0.55;
        const brandLower = data.brand.toLowerCase();

        if (brandLower.includes("apple") || data.model.toLowerCase().includes("iphone")) {
          if (ageYears <= 1) multiplierExcellent = 0.68;
          else if (ageYears === 2) multiplierExcellent = 0.55;
          else if (ageYears === 3) multiplierExcellent = 0.42;
          else if (ageYears === 4) multiplierExcellent = 0.32;
          else multiplierExcellent = 0.22;
        } else if (brandLower.includes("samsung")) {
          if (ageYears <= 1) multiplierExcellent = 0.60;
          else if (ageYears === 2) multiplierExcellent = 0.48;
          else if (ageYears === 3) multiplierExcellent = 0.36;
          else if (ageYears === 4) multiplierExcellent = 0.26;
          else multiplierExcellent = 0.16;
        } else {
          if (ageYears <= 1) multiplierExcellent = 0.52;
          else if (ageYears === 2) multiplierExcellent = 0.40;
          else if (ageYears === 3) multiplierExcellent = 0.30;
          else if (ageYears === 4) multiplierExcellent = 0.20;
          else multiplierExcellent = 0.12;
        }

        basePriceExcellent = Math.round(launchPrice * multiplierExcellent);
        basePriceGood = Math.round(basePriceExcellent * 0.9);
        basePriceAverage = Math.round(basePriceExcellent * 0.78);
      } else {
        // If data.launchPrice is provided in payload, use it to estimate base price dynamically
        if (data.launchPrice && data.launchPrice > 0) {
          launchPrice = data.launchPrice;
          releaseYear = 2024;
          
          const ageYears = Math.max(0, 2026 - releaseYear);
          let multiplierExcellent = 0.55;
          const brandLower = data.brand.toLowerCase();

          if (brandLower.includes("apple") || data.model.toLowerCase().includes("iphone")) {
            if (ageYears <= 1) multiplierExcellent = 0.68;
            else if (ageYears === 2) multiplierExcellent = 0.55;
            else if (ageYears === 3) multiplierExcellent = 0.42;
            else if (ageYears === 4) multiplierExcellent = 0.32;
            else multiplierExcellent = 0.22;
          } else if (brandLower.includes("samsung")) {
            if (ageYears <= 1) multiplierExcellent = 0.60;
            else if (ageYears === 2) multiplierExcellent = 0.48;
            else if (ageYears === 3) multiplierExcellent = 0.36;
            else if (ageYears === 4) multiplierExcellent = 0.26;
            else multiplierExcellent = 0.16;
          } else {
            if (ageYears <= 1) multiplierExcellent = 0.52;
            else if (ageYears === 2) multiplierExcellent = 0.40;
            else if (ageYears === 3) multiplierExcellent = 0.30;
            else if (ageYears === 4) multiplierExcellent = 0.20;
            else multiplierExcellent = 0.12;
          }

          basePriceExcellent = Math.round(launchPrice * multiplierExcellent);
          basePriceGood = Math.round(basePriceExcellent * 0.9);
          basePriceAverage = Math.round(basePriceExcellent * 0.78);
        } else {
          // 3. Try fetching specs in real-time from phone-specs-api as third priority
          const apiSpecs = await fetchSpecsFromAPI(data.brand, data.model, data.modelSlug);

          if (apiSpecs && apiSpecs.launchPrice && apiSpecs.launchPrice > 0) {
            launchPrice = apiSpecs.launchPrice;
            releaseYear = apiSpecs.releaseYear || 2026;

            const ageYears = Math.max(0, 2026 - releaseYear);
            let multiplierExcellent = 0.55;
            const brandLower = data.brand.toLowerCase();

            if (brandLower.includes("apple") || data.model.toLowerCase().includes("iphone")) {
              if (ageYears <= 1) multiplierExcellent = 0.68;
              else if (ageYears === 2) multiplierExcellent = 0.55;
              else if (ageYears === 3) multiplierExcellent = 0.42;
              else if (ageYears === 4) multiplierExcellent = 0.32;
              else multiplierExcellent = 0.22;
            } else if (brandLower.includes("samsung")) {
              if (ageYears <= 1) multiplierExcellent = 0.60;
              else if (ageYears === 2) multiplierExcellent = 0.48;
              else if (ageYears === 3) multiplierExcellent = 0.36;
              else if (ageYears === 4) multiplierExcellent = 0.26;
              else multiplierExcellent = 0.16;
            } else {
              if (ageYears <= 1) multiplierExcellent = 0.52;
              else if (ageYears === 2) multiplierExcellent = 0.40;
              else if (ageYears === 3) multiplierExcellent = 0.30;
              else if (ageYears === 4) multiplierExcellent = 0.20;
              else multiplierExcellent = 0.12;
            }

            basePriceExcellent = Math.round(launchPrice * multiplierExcellent);
            basePriceGood = Math.round(basePriceExcellent * 0.9);
            basePriceAverage = Math.round(basePriceExcellent * 0.78);
          } else {
            // 4. Bypassed/Estimator Fallback: Estimate base price dynamically
            const estimates = estimateFallbackBasePrice(data.brand, data.model);
            basePriceExcellent = estimates.excellent;
            basePriceGood = estimates.good;
            basePriceAverage = estimates.average;
            launchPrice = Math.round(estimates.excellent * 1.55);
          }
        }
      }
    }

    // 2. Determine base price depending on condition
    let basePrice = 0;
    const normalizedCondition = data.condition.trim().toLowerCase();

    if (normalizedCondition === 'excellent') {
      basePrice = basePriceExcellent;
    } else if (normalizedCondition === 'good') {
      basePrice = basePriceGood;
    } else if (normalizedCondition === 'average') {
      basePrice = basePriceAverage;
    } else {
      throw new Error(`Invalid device condition: '${data.condition}'. Supported values are: excellent, good, average`);
    }

    // 3. Fetch active Price Rules config from MongoDB via Prisma
    const rules = await prisma.priceRule.findFirst({
      where: { isActive: true },
    });
    
    // Default fallback rules
    const activeRules = rules || {
      screenDamageDeduction: 3500,
      batteryDeduction: 1500,
      cameraDeduction: 2000,
      fingerprintDeduction: 1200,
      faceIdDeduction: 1800,
      bodyDamageDeduction: 1500,
      speakerDeduction: 800,
      chargingPortDeduction: 800,
    };

    // 4. Apply deductions
    const breakdown: any = { basePrice };
    let totalDeduction = 0;

    // Define deduction percentages (e.g. screenDamageDeduction of 3500 represents a 35% cap, i.e., 3500 / 10000 = 0.35)
    const screenDamagePct = getDeductionPercentage(activeRules.screenDamageDeduction);
    const batteryPct = getDeductionPercentage(activeRules.batteryDeduction);
    const cameraPct = getDeductionPercentage(activeRules.cameraDeduction);
    const fingerprintPct = getDeductionPercentage(activeRules.fingerprintDeduction);
    const faceIdPct = getDeductionPercentage(activeRules.faceIdDeduction);
    const bodyDamagePct = getDeductionPercentage(activeRules.bodyDamageDeduction);
    const speakerPct = getDeductionPercentage(activeRules.speakerDeduction);
    const chargingPortPct = getDeductionPercentage(activeRules.chargingPortDeduction);

    // Screen Damage
    if (data.screenCracked && screenDamagePct > 0) {
      const deduction = Math.round(basePrice * screenDamagePct);
      breakdown.screenDamageDeduction = deduction;
      totalDeduction += deduction;
    }

    // Battery Health < 80
    if (data.batteryHealth < 80 && batteryPct > 0) {
      const deduction = Math.round(basePrice * batteryPct);
      breakdown.batteryDeduction = deduction;
      totalDeduction += deduction;
    }

    // Camera Issue
    if (data.cameraIssue && cameraPct > 0) {
      const deduction = Math.round(basePrice * cameraPct);
      breakdown.cameraDeduction = deduction;
      totalDeduction += deduction;
    }

    // Fingerprint Issue
    if (data.fingerprintIssue && fingerprintPct > 0) {
      const deduction = Math.round(basePrice * fingerprintPct);
      breakdown.fingerprintDeduction = deduction;
      totalDeduction += deduction;
    }

    // Face ID Issue (Only applicable for Apple devices that support Face ID)
    const isApple = data.brand.toLowerCase().includes('apple') || data.model.toLowerCase().includes('iphone');
    const hasFaceId = isApple && !data.model.toLowerCase().match(/\b(iphone\s*(5|6|7|8|se))\b/i);
    if (data.faceIdIssue && hasFaceId && faceIdPct > 0) {
      const deduction = Math.round(basePrice * faceIdPct);
      breakdown.faceIdDeduction = deduction;
      totalDeduction += deduction;
    }

    // Body Damage
    if (data.bodyDamage && bodyDamagePct > 0) {
      const deduction = Math.round(basePrice * bodyDamagePct);
      breakdown.bodyDamageDeduction = deduction;
      totalDeduction += deduction;
    }

    // Speaker Issue
    if (data.speakerIssue && speakerPct > 0) {
      const deduction = Math.round(basePrice * speakerPct);
      breakdown.speakerDeduction = deduction;
      totalDeduction += deduction;
    }

    // Charging Port Issue
    if (data.chargingPortIssue && chargingPortPct > 0) {
      const deduction = Math.round(basePrice * chargingPortPct);
      breakdown.chargingPortDeduction = deduction;
      totalDeduction += deduction;
    }

    // Enforce floor price: at least 10% of launch price, absolute minimum of 1000 rupees
    const minFloorPrice = Math.max(
      Math.round((launchPrice * 0.10) / 100) * 100,
      1000
    );

    let estimatedPrice = Math.max(minFloorPrice, basePrice - totalDeduction);

    // Round to nearest 100
    estimatedPrice = Math.round(estimatedPrice / 100) * 100;

    return {
      success: true,
      estimatedPrice,
      launchPrice,
      breakdown,
    };
  }
}

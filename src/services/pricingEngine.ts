export interface ConditionAnswers {
  screen: string;
  body: string;
  functional: string | string[]; 
  batteryHealth: string;
  hasBill?: boolean;
  hasBox?: boolean;
  hasCharger?: boolean;
}

export interface PricingRules {
  rulesVersion: number;
  screenFactors: Record<string, number>;
  bodyFactors: Record<string, number>;
  functionalFactors: Record<string, number>;
  batteryFactors: Record<string, number>;
  noBillDeduction: number;
  noBoxDeduction: number;
  noChargerDeduction: number;
}

export function calculateQuote({ 
  deviceId, 
  basePrice, 
  conditionAnswers, 
  rules 
}: {
  deviceId: string;
  basePrice: number;
  conditionAnswers: ConditionAnswers;
  rules: PricingRules;
}) {
  console.log(`[PricingEngine] Start - DeviceID: ${deviceId}, BasePrice: ${basePrice}`);

  // e. If functionalFactor answer = "does not power on", skip all other multipliers and route to a separate scrapValue calculation instead
  const isDead = Array.isArray(conditionAnswers.functional) 
    ? conditionAnswers.functional.includes("does not power on")
    : conditionAnswers.functional === "does not power on";

  let price = basePrice;
  const breakdown = [];

  if (isDead) {
    // Scrap value calculation
    price = Math.max(500, basePrice * 0.05); // e.g. 5% or minimum 500
    console.log(`[PricingEngine] Device dead. Scrap value: ${price}`);
    breakdown.push({ step: 'scrap_value', value: price });
    
    // Round at the very end
    price = Math.round(price / 10) * 10;
    
    return {
      finalPrice: price,
      breakdown,
      rulesVersion: rules.rulesVersion,
    };
  }

  // Multiply by condition factors in sequence
  const screenFactor = rules.screenFactors[conditionAnswers.screen] ?? 1.0;
  price *= screenFactor;
  console.log(`[PricingEngine] After Screen Factor (${screenFactor}): ${price}`);
  breakdown.push({ step: 'screen', factor: screenFactor, runningPrice: price });

  const bodyFactor = rules.bodyFactors[conditionAnswers.body] ?? 1.0;
  price *= bodyFactor;
  console.log(`[PricingEngine] After Body Factor (${bodyFactor}): ${price}`);
  breakdown.push({ step: 'body', factor: bodyFactor, runningPrice: price });

  // Functional factor can be an array if multiple issues are selected
  let functionalFactor = 1.0;
  if (Array.isArray(conditionAnswers.functional)) {
    for (const ans of conditionAnswers.functional) {
      functionalFactor *= (rules.functionalFactors[ans] ?? 1.0);
    }
  } else if (conditionAnswers.functional) {
    functionalFactor = rules.functionalFactors[conditionAnswers.functional] ?? 1.0;
  }
  price *= functionalFactor;
  console.log(`[PricingEngine] After Functional Factor (${functionalFactor}): ${price}`);
  breakdown.push({ step: 'functional', factor: functionalFactor, runningPrice: price });

  const batteryFactor = rules.batteryFactors[conditionAnswers.batteryHealth] ?? 1.0;
  price *= batteryFactor;
  console.log(`[PricingEngine] After Battery Factor (${batteryFactor}): ${price}`);
  breakdown.push({ step: 'battery', factor: batteryFactor, runningPrice: price });

  // c. Subtract flat deductions AFTER all multipliers:
  if (!conditionAnswers.hasBill) {
    price -= rules.noBillDeduction;
    console.log(`[PricingEngine] After No Bill Deduction (-${rules.noBillDeduction}): ${price}`);
    breakdown.push({ step: 'no_bill', deduction: rules.noBillDeduction, runningPrice: price });
  }
  
  if (!conditionAnswers.hasBox) {
    price -= rules.noBoxDeduction;
    console.log(`[PricingEngine] After No Box Deduction (-${rules.noBoxDeduction}): ${price}`);
    breakdown.push({ step: 'no_box', deduction: rules.noBoxDeduction, runningPrice: price });
  }

  if (!conditionAnswers.hasCharger) {
    price -= rules.noChargerDeduction;
    console.log(`[PricingEngine] After No Charger Deduction (-${rules.noChargerDeduction}): ${price}`);
    breakdown.push({ step: 'no_charger', deduction: rules.noChargerDeduction, runningPrice: price });
  }

  // Ensure price doesn't go too low (minimum scrap value)
  price = Math.max(price, Math.max(500, basePrice * 0.05)); 

  // d. Round ONCE at the very end (Math.round(price / 10) * 10)
  price = Math.round(price / 10) * 10;
  console.log(`[PricingEngine] Final Rounded Price: ${price}`);
  breakdown.push({ step: 'final_rounding', runningPrice: price });

  return {
    finalPrice: price,
    breakdown,
    rulesVersion: rules.rulesVersion,
  };
}

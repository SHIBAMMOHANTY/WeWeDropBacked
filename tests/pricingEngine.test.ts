import { calculateQuote, PricingRules } from '../src/services/pricingEngine';

describe('Pricing Engine', () => {
  const defaultRules: PricingRules = {
    rulesVersion: 1,
    screenFactors: {
      flawless: 1.0,
      scratched: 0.8,
      cracked: 0.5,
    },
    bodyFactors: {
      flawless: 1.0,
      scratched: 0.9,
      dented: 0.7,
    },
    functionalFactors: {
      "all working": 1.0,
      "camera issue": 0.8,
      "battery issue": 0.9,
      "does not power on": 0.05,
    },
    batteryFactors: {
      "above 80": 1.0,
      "below 80": 0.9,
    },
    noBillDeduction: 1000,
    noBoxDeduction: 500,
    noChargerDeduction: 500,
  };

  test('Case 1: Flawless condition with all accessories', () => {
    const result = calculateQuote({
      deviceId: 'dev1',
      basePrice: 50000,
      conditionAnswers: {
        screen: 'flawless',
        body: 'flawless',
        functional: 'all working',
        batteryHealth: 'above 80',
        hasBill: true,
        hasBox: true,
        hasCharger: true,
      },
      rules: defaultRules,
    });
    // Should be exactly basePrice (50000)
    expect(result.finalPrice).toBe(50000);
  });

  test('Case 2: Scratched screen and body, no box', () => {
    const result = calculateQuote({
      deviceId: 'dev2',
      basePrice: 50000,
      conditionAnswers: {
        screen: 'scratched', // 0.8
        body: 'scratched',   // 0.9
        functional: 'all working',
        batteryHealth: 'above 80',
        hasBill: true,
        hasBox: false,       // -500
        hasCharger: true,
      },
      rules: defaultRules,
    });
    // 50000 * 0.8 = 40000
    // 40000 * 0.9 = 36000
    // 36000 - 500 = 35500
    // Rounded to 35500
    expect(result.finalPrice).toBe(35500);
  });

  test('Case 3: Multiple functional issues (Array)', () => {
    const result = calculateQuote({
      deviceId: 'dev3',
      basePrice: 50000,
      conditionAnswers: {
        screen: 'flawless',
        body: 'flawless',
        functional: ['camera issue', 'battery issue'], // 0.8 * 0.9 = 0.72
        batteryHealth: 'below 80', // 0.9
        hasBill: true,
        hasBox: true,
        hasCharger: true,
      },
      rules: defaultRules,
    });
    // 50000 * 0.72 = 36000
    // 36000 * 0.9 = 32400
    expect(result.finalPrice).toBe(32400);
  });

  test('Case 4: Scrap value if it does not power on', () => {
    const result = calculateQuote({
      deviceId: 'dev4',
      basePrice: 50000,
      conditionAnswers: {
        screen: 'cracked', // ignored
        body: 'dented',    // ignored
        functional: 'does not power on', // triggers scrap
        batteryHealth: 'below 80', // ignored
        hasBill: false, // ignored
        hasBox: false,
        hasCharger: false,
      },
      rules: defaultRules,
    });
    // 5% of 50000 = 2500
    expect(result.finalPrice).toBe(2500);
  });

  test('Case 5: Edge case - rounding and floor price', () => {
    const result = calculateQuote({
      deviceId: 'dev5',
      basePrice: 2000,
      conditionAnswers: {
        screen: 'cracked', // 0.5 => 1000
        body: 'dented',    // 0.7 => 700
        functional: 'all working',
        batteryHealth: 'below 80', // 0.9 => 630
        hasBill: false, // -1000 => -370
        hasBox: false,  // -500 => -870
        hasCharger: false, // -500 => -1370
      },
      rules: defaultRules,
    });
    // Expected to floor at max(500, basePrice * 0.05) => max(500, 100) => 500
    // Rounding 500 => 500
    expect(result.finalPrice).toBe(500);
  });
});

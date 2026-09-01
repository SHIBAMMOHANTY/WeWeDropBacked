export class PricingService {
  static async calculateQuote(
    data: QuoteCalculationRequest
  ): Promise<QuoteCalculationResponse> {
    let basePriceExcellent = 0;
    let launchPrice = 0;
    let releaseYear = 2026;

    let priceSource:
      | 'database'
      | 'cashify'
      | 'api'
      | 'estimate' = 'estimate';

    const condition = data.condition
      .trim()
      .toLowerCase();

    if (
      !['excellent', 'good', 'average'].includes(
        condition
      )
    ) {
      throw new Error(
        `Invalid condition: '${data.condition}'`
      );
    }

    /*
     * IMPORTANT:
     *
     * Current market/Cashify price is already a resale price.
     * NEVER apply another generic 10% condition reduction
     * to it before defect deductions.
     */
    let hasConditionSpecificDatabasePrice = false;
    let isCurrentMarketPrice = false;

    const cleanedModel = cleanModelName(
      data.model,
      data.brand
    );

    const exactModel = escapeMongoRegex(
      data.model.trim()
    );

    const exactCleanedModel =
      escapeMongoRegex(cleanedModel);

    const exactBrandPrefixedModel =
      escapeMongoRegex(
        `${data.brand.trim()} ${cleanedModel}`
      );

    /*
     * ==========================================================
     * STEP 1 — EXACT DEVICE DATABASE LOOKUP
     * ==========================================================
     */

    const device =
      await prisma.deviceMaster.findFirst({
        where: {
          brand: {
            equals: data.brand.trim(),
            mode: 'insensitive',
          },

          OR: [
            {
              model: {
                equals: exactModel,
                mode: 'insensitive',
              },
            },
            {
              model: {
                equals: exactCleanedModel,
                mode: 'insensitive',
              },
            },
            {
              model: {
                equals: exactBrandPrefixedModel,
                mode: 'insensitive',
              },
            },
            {
              model: {
                contains: exactCleanedModel,
                mode: 'insensitive',
              },
            },
          ],

          storage: {
            equals: data.storage.trim(),
            mode: 'insensitive',
          },

          isActive: true,
        },
      });

    if (device) {
      /*
       * DeviceMaster contains an actual admin-managed
       * condition price, so this is already condition-specific.
       */
      basePriceExcellent =
        condition === 'excellent'
          ? device.basePriceExcellent
          : condition === 'good'
            ? device.basePriceGood
            : device.basePriceAverage;

      hasConditionSpecificDatabasePrice = true;

      launchPrice =
        data.launchPrice ||
        device.launchPrice;

      priceSource = 'database';

      if (device.launchDate) {
        const y = parseInt(
          device.launchDate.split('-')[0],
          10
        );

        releaseYear = isNaN(y)
          ? 2024
          : y;
      }

      console.log(
        `[PricingService] DeviceMaster match: ` +
        `${data.brand} ${data.model} ${data.storage} ` +
        `→ ₹${basePriceExcellent}`
      );
    }

    /*
     * ==========================================================
     * STEP 2 — CURRENT MARKET / CASHIFY
     * ==========================================================
     *
     * If database has no exact device price, use current
     * market pricing.
     */

    if (!basePriceExcellent) {
      try {
        const cashify =
          await Promise.race([
            getCashifyPrice(
              data.brand,
              data.model,
              data.storage,
              'good',
              {
                ram: detectRamFromRequest(data),
                modelId:
                  (data as any).modelId ||
                  undefined,
              }
            ),

            new Promise<null>(
              (resolve) =>
                setTimeout(
                  () => resolve(null),
                  12000
                )
            ),
          ]);

        if (
          cashify &&
          typeof cashify === 'object' &&
          cashify.price &&
          cashify.price > 0
        ) {
          basePriceExcellent =
            cashify.price;

          launchPrice =
            cashify.launchPrice || 0;

          /*
           * Both market and cashify represent an
           * already-current resale/buyback value.
           */
          if (
            cashify.source === 'market' ||
            cashify.source === 'cache'
          ) {
            priceSource = 'cashify';
            isCurrentMarketPrice = true;
          } else {
            priceSource = 'cashify';
          }

          console.log(
            `[PricingService] Market price used: ` +
            `${data.brand} ${data.model} ` +
            `${data.storage} → ` +
            `₹${cashify.price} ` +
            `(source: ${cashify.source})`
          );
        }
      } catch (e) {
        console.warn(
          '[PricingService] Cashify fetch failed:',
          e
        );
      }
    }

    /*
     * ==========================================================
     * STEP 3 — PHONE SPECS API
     * ==========================================================
     */

    if (!basePriceExcellent) {
      const apiSpecs =
        await fetchSpecsFromAPI(
          data.brand,
          data.model,
          data.modelSlug
        );

      if (
        apiSpecs?.launchPrice &&
        apiSpecs.launchPrice > 0
      ) {
        launchPrice =
          apiSpecs.launchPrice;

        releaseYear =
          apiSpecs.releaseYear || 2026;

        priceSource = 'api';
      } else if (
        data.launchPrice &&
        data.launchPrice > 0
      ) {
        launchPrice =
          data.launchPrice;

        priceSource = 'api';
      }

      if (launchPrice > 0) {
        const ageYears = Math.max(
          0,
          new Date().getFullYear() -
          releaseYear
        );

        const mult =
          getDepreciationRate(
            data.brand,
            data.model,
            ageYears
          );

        basePriceExcellent =
          Math.round(
            launchPrice * mult
          );

        console.log(
          `[PricingService] API estimate: ` +
          `launch ₹${launchPrice}, ` +
          `year ${releaseYear}, ` +
          `→ ₹${basePriceExcellent}`
        );
      }
    }

    /*
     * ==========================================================
     * STEP 4 — DYNAMIC FALLBACK
     * ==========================================================
     */

    if (!basePriceExcellent) {
      const estimatedMSRP =
        estimateDynamicMSRP(
          data.brand,
          data.model,
          data.storage
        );

      const estimatedYear =
        estimateDynamicYear(
          data.model
        );

      const currentYear =
        new Date().getFullYear();

      const estimatedAgeYears =
        Math.max(
          0,
          currentYear - estimatedYear
        );

      const clampedAge =
        Math.min(
          estimatedAgeYears,
          5
        );

      const mult =
        getDepreciationRate(
          data.brand,
          data.model,
          clampedAge
        );

      basePriceExcellent =
        Math.round(
          estimatedMSRP * mult
        );

      launchPrice =
        estimatedMSRP;

      priceSource = 'estimate';

      console.log(
        `[PricingService] Dynamic fallback: ` +
        `MSRP=${estimatedMSRP}, ` +
        `year=${estimatedYear}, ` +
        `mult=${mult}, ` +
        `price=${basePriceExcellent}`
      );
    }

    /*
     * ==========================================================
     * CONDITION PRICE
     * ==========================================================
     */

    let basePrice =
      basePriceExcellent;

    /*
     * CRITICAL FIX:
     *
     * Current market price already represents a resale/
     * buyback price.
     *
     * Do NOT do:
     *
     *   marketPrice * 0.90
     *
     * for "good".
     */
    if (
      !hasConditionSpecificDatabasePrice &&
      !isCurrentMarketPrice
    ) {
      if (condition === 'good') {
        basePrice =
          Math.round(
            basePriceExcellent * 0.9
          );
      } else if (
        condition === 'average'
      ) {
        basePrice =
          Math.round(
            basePriceExcellent * 0.78
          );
      }
    }

    console.log(
      `[PricingService] Base price: ` +
      `₹${basePrice} ` +
      `(source=${priceSource}, ` +
      `market=${isCurrentMarketPrice})`
    );

    /*
     * ==========================================================
     * EXISTING DEDUCTION / BONUS ENGINE
     * ==========================================================
     */

    const isApple =
      data.brand
        .toLowerCase()
        .includes('apple') ||
      data.model
        .toLowerCase()
        .includes('iphone');

    const iPhoneGen =
      isApple
        ? getiPhoneGeneration(
          data.model
        )
        : 0;

    const deductions: {
      label: string;
      amount: number;
    }[] = [];

    const bonuses: {
      label: string;
      amount: number;
    }[] = [];

    const deduct = (
      label: string,
      pct: number
    ) => {
      const amount =
        Math.round(
          basePrice * pct
        );

      if (amount > 0) {
        deductions.push({
          label,
          amount,
        });
      }
    };

    const bonus = (
      label: string,
      pct: number
    ) => {
      const amount =
        Math.round(
          basePrice * pct
        );

      if (amount > 0) {
        bonuses.push({
          label,
          amount,
        });
      }
    };

    /*
     * SCREEN
     */

    if (
      data.screenIssue ||
      data.screenCracked
    ) {
      deduct(
        'Screen Issue',
        0.75
      );
    } else if (
      data.replacementScreen
    ) {
      deduct(
        'Replacement Screen (Non-Original)',
        0.55
      );
    } else if (
      data.glassbroken
    ) {
      deduct(
        'Glass Broken',
        0.60
      );
    } else if (
      data.heavyDiscoloration
    ) {
      deduct(
        'Heavy Discoloration / Dead Spot',
        0.70
      );
    } else if (
      data.scratchOnScreen
    ) {
      deduct(
        'Scratch on Screen',
        0.40
      );
    }

    /*
     * BODY
     */

    if (
      data.bodyHeavyScratch
    ) {
      deduct(
        'Heavy Body Scratch / Dent',
        0.25
      );
    } else if (
      data.bodyDamage
    ) {
      deduct(
        'Body Damage',
        0.30
      );
    } else if (
      data.minorBodyScratch
    ) {
      deduct(
        'Minor Body Scratch (1-2)',
        0.25
      );
    }

    if (
      data.cameraGlassBroken
    ) {
      deduct(
        'Camera Glass Broken',
        0.30
      );
    }

    /*
     * SIM
     */

    if (data.simNotWorking) {
      const simFlat =
        iPhoneGen >= 13
          ? 1200
          : 800;

      deductions.push({
        label:
          'SIM Not Working',
        amount: simFlat,
      });
    }

    /*
     * CAMERAS
     */

    if (
      data.frontCameraIssue &&
      data.backCameraIssue
    ) {
      deduct(
        'Front + Back Camera Not Working',
        0.55
      );
    } else if (
      data.backCameraIssue ||
      data.cameraIssue
    ) {
      deduct(
        'Back Camera Not Working',
        0.40
      );
    } else if (
      data.frontCameraIssue
    ) {
      deduct(
        'Front Camera Not Working',
        0.35
      );
    }

    /*
     * FUNCTIONAL
     */

    if (data.fingerprintIssue)
      deduct(
        'Fingerprint Not Working',
        0.25
      );

    if (
      data.faceIdIssue &&
      isApple
    )
      deduct(
        'Face ID Not Working',
        0.45
      );

    if (data.volumeButtonIssue)
      deduct(
        'Volume Button Not Working',
        0.30
      );

    if (data.wifiNotWorking)
      deduct(
        'Wi-Fi Not Working',
        0.60
      );

    if (data.speakerIssue)
      deduct(
        'Speaker Not Working',
        0.30
      );

    if (data.silentButtonIssue)
      deduct(
        'Silent / Mute Button Not Working',
        0.30
      );

    if (data.powerButtonIssue)
      deduct(
        'Power Button Not Working',
        0.30
      );

    if (data.chargingPortIssue)
      deduct(
        'Charging Port Not Working',
        0.30
      );

    if (data.audioReceiverIssue)
      deduct(
        'Audio Receiver (Earpiece) Not Working',
        0.30
      );

    if (data.microphoneIssue)
      deduct(
        'Microphone Not Working',
        0.30
      );

    if (data.bluetoothIssue)
      deduct(
        'Bluetooth Not Working',
        0.55
      );

    if (data.vibrationIssue)
      deduct(
        'Vibration Not Working',
        0.30
      );

    if (
      data.proximitySensorIssue
    )
      deduct(
        'Proximity Sensor Not Working',
        0.30
      );

    /*
     * BATTERY
     */

    const batteryHealth =
      data.batteryHealth ?? 100;

    if (batteryHealth < 80) {
      deduct(
        'Battery Health < 80%',
        0.35
      );
    } else if (
      batteryHealth < 90
    ) {
      deduct(
        'Battery Health 80–90%',
        0.30
      );
    }

    /*
     * ACCESSORIES
     */

    if (
      data.hasChargerAndBox
    ) {
      bonus(
        'Original Charger & Box',
        0.05
      );
    }

    if (data.hasBill) {
      bonus(
        'Original Bill',
        0.05
      );
    }

    /*
     * WARRANTY
     */

    const wm =
      data.warrantyMonths ?? 0;

    if (
      wm > 0 &&
      wm < 3
    ) {
      bonus(
        'Warranty < 3 Months Remaining',
        0.05
      );
    } else if (
      wm >= 3 &&
      wm < 6
    ) {
      bonus(
        'Warranty 3–6 Months',
        0.075
      );
    } else if (
      wm >= 6 &&
      wm < 12
    ) {
      bonus(
        'Warranty 6–11 Months',
        0.10
      );
    }

    /*
     * ==========================================================
     * FINAL
     * ==========================================================
     */

    const totalDeduction =
      deductions.reduce(
        (sum, item) =>
          sum + item.amount,
        0
      );

    const totalBonus =
      bonuses.reduce(
        (sum, item) =>
          sum + item.amount,
        0
      );

    const minFloorPrice =
      launchPrice > 0
        ? Math.max(
          Math.round(
            (launchPrice * 0.08) /
            100
          ) * 100,
          500
        )
        : 500;

    let estimatedPrice =
      Math.max(
        minFloorPrice,
        basePrice -
        totalDeduction +
        totalBonus
      );

    estimatedPrice =
      Math.round(
        estimatedPrice / 100
      ) * 100;

    console.log(
      `[PricingService] FINAL: ` +
      `${data.brand} ${data.model} ` +
      `${data.storage} → ₹${estimatedPrice}`
    );

    return {
      success: true,
      estimatedPrice,
      launchPrice,
      priceSource,
      breakdown: {
        basePrice,
        deductions,
        bonuses,
        totalDeduction,
        totalBonus,
      },
    };
  }
}
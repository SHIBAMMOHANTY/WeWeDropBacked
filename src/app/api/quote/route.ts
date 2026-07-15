import { z } from 'zod';
import { jsonResponse, getAuthSession } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { calculateQuote, ConditionAnswers } from '@/services/pricingEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const quoteSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
  conditionAnswers: z.object({
    screen: z.string(),
    body: z.string(),
    functional: z.union([z.string(), z.array(z.string())]),
    batteryHealth: z.string(),
    hasBill: z.boolean().optional(),
    hasBox: z.boolean().optional(),
    hasCharger: z.boolean().optional(),
  }),
  // Optional booking details for "verified" quotes
  customerName: z.string().optional(),
  customerAddress: z.string().optional(),
  customerPincode: z.string().optional(),
  contactNumber: z.string().optional(),
  paymentMode: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const session = await getAuthSession(req);
    // userId is optional for instant quotes, but required if they want to book
    const userId = session?.id;

    const body = await req.json();
    const parseResult = quoteSchema.safeParse(body);

    if (!parseResult.success) {
      return jsonResponse({
        error: 'Validation failed',
        details: parseResult.error.errors,
      }, 400);
    }

    const { deviceId, conditionAnswers, customerName } = parseResult.data;

    // 1. Fetch Device to get basePriceExcellent
    const device = await prisma.deviceMaster.findUnique({
      where: { id: deviceId, isActive: true },
    });

    if (!device) {
      return jsonResponse({ error: 'Device not found or inactive' }, 404);
    }

    // 2. Fetch Active Pricing Rules
    const activeRule = await prisma.pricingRule.findFirst({
      where: { isActive: true },
      orderBy: { rulesVersion: 'desc' },
    });

    if (!activeRule) {
      return jsonResponse({ error: 'Pricing rules not configured' }, 500);
    }

    // 3. Calculate Quote
    const calculation = calculateQuote({
      deviceId,
      basePrice: device.basePriceExcellent,
      conditionAnswers: conditionAnswers as ConditionAnswers,
      rules: {
        rulesVersion: activeRule.rulesVersion,
        screenFactors: activeRule.screenFactors as Record<string, number>,
        bodyFactors: activeRule.bodyFactors as Record<string, number>,
        functionalFactors: activeRule.functionalFactors as Record<string, number>,
        batteryFactors: activeRule.batteryFactors as Record<string, number>,
        noBillDeduction: activeRule.noBillDeduction,
        noBoxDeduction: activeRule.noBoxDeduction,
        noChargerDeduction: activeRule.noChargerDeduction,
      },
    });

    // 4. Generate Quote Number
    const timestampStr = Date.now().toString().slice(-6);
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const quoteNumber = `QE-${timestampStr}-${randomSuffix}`;

    // 5. Save to DB
    const isBooking = !!customerName;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Quotes expire in 7 days

    const quote = await prisma.quote.create({
      data: {
        quoteNumber,
        userId: userId || undefined,
        deviceId,
        basePriceUsed: device.basePriceExcellent,
        conditionAnswers: conditionAnswers as any,
        rulesVersion: calculation.rulesVersion,
        breakdown: calculation.breakdown as any,
        finalPrice: calculation.finalPrice,
        quoteType: isBooking ? 'verified' : 'instant',
        status: isBooking ? 'ordered' : 'pending',
        expiresAt,
        // Booking Details (if applicable)
        customerName: parseResult.data.customerName,
        customerAddress: parseResult.data.customerAddress,
        customerPincode: parseResult.data.customerPincode,
        contactNumber: parseResult.data.contactNumber,
        paymentMode: parseResult.data.paymentMode,
      },
    });

    return jsonResponse({
      success: true,
      quoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      finalPrice: calculation.finalPrice,
      breakdown: calculation.breakdown,
      rulesVersion: calculation.rulesVersion,
      expiresAt,
    }, 201);
  } catch (err: any) {
    console.error('Pricing Engine API Error:', err);
    return jsonResponse({ error: err.message || 'Internal server error' }, 500);
  }
}

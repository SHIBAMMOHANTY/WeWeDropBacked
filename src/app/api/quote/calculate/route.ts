import { z } from 'zod';
import { jsonResponse, getAuthSession, buildPagination } from '@/lib/api';
import { PricingService } from '@/services/pricing.service';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const calculateSchema = z.object({
  brand: z.string().min(1, 'Brand is required'),
  model: z.string().min(1, 'Model is required'),
  storage: z.string().min(1, 'Storage size is required'),
  condition: z.enum(['excellent', 'good', 'average'], {
    errorMap: () => ({ message: "Condition must be 'excellent', 'good', or 'average'" }),
  }),
  // Legacy compat
  screenCracked: z.boolean().default(false),
  cameraIssue: z.boolean().default(false),
  bodyDamage: z.boolean().default(false),

  // Screen
  screenIssue: z.boolean().default(false),
  replacementScreen: z.boolean().default(false),
  glassbroken: z.boolean().default(false),
  heavyDiscoloration: z.boolean().default(false),
  scratchOnScreen: z.boolean().default(false),

  // Body
  bodyHeavyScratch: z.boolean().default(false),
  minorBodyScratch: z.boolean().default(false),
  cameraGlassBroken: z.boolean().default(false),

  // SIM
  simNotWorking: z.boolean().default(false),

  // Cameras
  frontCameraIssue: z.boolean().default(false),
  backCameraIssue: z.boolean().default(false),

  // Functional
  fingerprintIssue: z.boolean().default(false),
  faceIdIssue: z.boolean().default(false),
  speakerIssue: z.boolean().default(false),
  chargingPortIssue: z.boolean().default(false),
  volumeButtonIssue: z.boolean().default(false),
  wifiNotWorking: z.boolean().default(false),
  silentButtonIssue: z.boolean().default(false),
  powerButtonIssue: z.boolean().default(false),
  audioReceiverIssue: z.boolean().default(false),
  microphoneIssue: z.boolean().default(false),
  bluetoothIssue: z.boolean().default(false),
  vibrationIssue: z.boolean().default(false),
  proximitySensorIssue: z.boolean().default(false),

  // Battery
  batteryHealth: z.number().min(0).max(100).default(100),

  // Accessories & bonuses
  hasChargerAndBox: z.boolean().default(false),
  hasBill: z.boolean().default(false),
  warrantyMonths: z.number().min(0).default(0),

  modelSlug: z.string().optional(),
  launchPrice: z.number().optional(),
});


export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("BACKEND CALCULATE PRICE REQUEST PATH: /api/quote/calculate");
    console.log("REQUEST PAYLOAD:", JSON.stringify(body, null, 2));
    
    // Validate request parameters
    const parseResult = calculateSchema.safeParse(body);
    if (!parseResult.success) {
      console.log("CALCULATE API VALIDATION FAILED:", JSON.stringify(parseResult.error.format(), null, 2));
      return jsonResponse(
        {
          error: 'Validation failed',
          details: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        400
      );
    }

    // Process price estimation
    const calculation = await PricingService.calculateQuote(parseResult.data);
    console.log("BACKEND CALCULATE PRICE RESPONSE:", JSON.stringify(calculation, null, 2));
    
    // Auto-save to Quote History if user is authenticated
    let quote = null;
    const session = await getAuthSession(req).catch(() => null);
    if (session && session.id) {
      const timestampStr = Date.now().toString().slice(-6);
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const quoteNumber = `QB-${timestampStr}-${randomSuffix}`;

      quote = await prisma.quote.create({
        data: {
          quoteNumber,
          userId: session.id,
          brand: parseResult.data.brand,
          model: parseResult.data.model,
          storage: parseResult.data.storage,
          condition: parseResult.data.condition,
          screenCracked: parseResult.data.screenCracked,
          batteryHealth: parseResult.data.batteryHealth,
          cameraIssue: parseResult.data.cameraIssue,
          fingerprintIssue: parseResult.data.fingerprintIssue,
          faceIdIssue: parseResult.data.faceIdIssue,
          bodyDamage: parseResult.data.bodyDamage,
          speakerIssue: parseResult.data.speakerIssue,
          chargingPortIssue: parseResult.data.chargingPortIssue,
          estimatedPrice: calculation.estimatedPrice,
          finalPrice: calculation.estimatedPrice,
          status: 'pending',
          images: [],
        },
      });
      console.log(`Saved calculation to quote database history: ${quoteNumber}`);
    }

    return jsonResponse({
      ...calculation,
      quote: quote || undefined,
    });
  } catch (err: any) {
    console.error('Calculation API Error:', err);
    return jsonResponse(
      { error: err.message || 'Internal server error during price calculation' },
      err.message?.includes('Device not found') ? 404 : 500
    );
  }
}

export async function GET(req: Request) {
  try {
    // 1. Authenticate user
    const session = await getAuthSession(req);
    if (!session || !session.id) {
      return jsonResponse({ error: 'Unauthorized: Authentication required' }, 401);
    }

    // 2. Parse query parameters for pagination
    const { page, limit, skip } = buildPagination(req.url);

    // 3. Query user's calculated quotes from Prisma client with pagination
    const query = { userId: session.id };
    
    const total = await prisma.quote.count({ where: query });
    const quotes = await prisma.quote.findMany({
      where: query,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    return jsonResponse({
      success: true,
      quotes,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Fetch User Calculation History Error:', err);
    return jsonResponse(
      { error: err.message || 'Internal server error while fetching calculation history' },
      500
    );
  }
}

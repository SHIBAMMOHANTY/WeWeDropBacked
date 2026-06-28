import { z } from 'zod';
import { jsonResponse, getAuthSession, buildPagination } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { PricingService } from '@/services/pricing.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const calculateSchema = z.object({
  brand: z.string().min(1, 'Brand is required'),
  model: z.string().min(1, 'Model is required'),
  storage: z.string().min(1, 'Storage size is required'),
  condition: z.enum(['excellent', 'good', 'average'], {
    errorMap: () => ({ message: "Condition must be 'excellent', 'good', or 'average'" }),
  }),
  screenCracked: z.boolean().default(false),
  batteryHealth: z.number().min(0).max(100).default(100),
  cameraIssue: z.boolean().default(false),
  fingerprintIssue: z.boolean().default(false),
  faceIdIssue: z.boolean().default(false),
  bodyDamage: z.boolean().default(false),
  speakerIssue: z.boolean().default(false),
  chargingPortIssue: z.boolean().default(false),
  modelSlug: z.string().optional(),
  launchPrice: z.number().optional(),
});

const createQuoteSchema = calculateSchema.extend({
  images: z.array(z.string()).optional().default([]),
});

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function POST(req: Request) {
  try {
    // 1. Authenticate user
    const session = await getAuthSession(req);
    if (!session || !session.id) {
      return jsonResponse({ error: 'Unauthorized: Authentication required' }, 401);
    }

    const body = await req.json();

    // 2. Validate input schema
    const parseResult = createQuoteSchema.safeParse(body);
    if (!parseResult.success) {
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

    const quoteData = parseResult.data;

    // 3. Recalculate price on server side using Prisma-based Pricing Engine
    const calculation = await PricingService.calculateQuote(quoteData);

    // 4. Generate unique quote number (QB + Timestamp + Random suffix)
    const timestampStr = Date.now().toString().slice(-6);
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const quoteNumber = `QB-${timestampStr}-${randomSuffix}`;

    // 5. Save the Quote using Prisma client
    const quote = await prisma.quote.create({
      data: {
        quoteNumber,
        userId: session.id,
        brand: quoteData.brand,
        model: quoteData.model,
        storage: quoteData.storage,
        condition: quoteData.condition,
        screenCracked: quoteData.screenCracked,
        batteryHealth: quoteData.batteryHealth,
        cameraIssue: quoteData.cameraIssue,
        fingerprintIssue: quoteData.fingerprintIssue,
        faceIdIssue: quoteData.faceIdIssue,
        bodyDamage: quoteData.bodyDamage,
        speakerIssue: quoteData.speakerIssue,
        chargingPortIssue: quoteData.chargingPortIssue,
        estimatedPrice: calculation.estimatedPrice,
        finalPrice: calculation.estimatedPrice, // Admin can update this later
        status: 'pending',
        images: quoteData.images,
      },
    });

    return jsonResponse({
      success: true,
      message: 'Quote created successfully',
      quote,
    }, 201);
  } catch (err: any) {
    console.error('Create Quote API Error:', err);
    return jsonResponse(
      { error: err.message || 'Internal server error while creating quote' },
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

    // 3. Query user's quotes from Prisma client with pagination
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
    console.error('Fetch User Quote History Error:', err);
    return jsonResponse(
      { error: err.message || 'Internal server error while fetching quote history' },
      500
    );
  }
}

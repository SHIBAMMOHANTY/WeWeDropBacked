import { z } from 'zod';
import { jsonResponse, getAuthSession } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { PricingService } from '@/services/pricing.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const diagnoseSchema = z.object({
  screenCracked: z.boolean().optional(),
  cameraIssue: z.boolean().optional(),
  fingerprintIssue: z.boolean().optional(),
  faceIdIssue: z.boolean().optional(),
  bodyDamage: z.boolean().optional(),
  speakerIssue: z.boolean().optional(),
  chargingPortIssue: z.boolean().optional(),
  batteryHealth: z.number().min(0).max(100).optional(),
});

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Authenticate user
    const session = await getAuthSession(req);
    if (!session || !session.id) {
      return jsonResponse({ error: 'Unauthorized: Authentication required' }, 401);
    }

    const { id } = params;
    if (!id) {
      return jsonResponse({ error: 'Quote ID is required' }, 400);
    }

    const body = await req.json();

    // 2. Validate request parameters
    const parseResult = diagnoseSchema.safeParse(body);
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

    // 3. Find the Quote
    let quote = null;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);

    if (isObjectId) {
      quote = await prisma.quote.findUnique({
        where: { id },
      });
    }

    if (!quote) {
      quote = await prisma.quote.findUnique({
        where: { quoteNumber: id },
      });
    }

    if (!quote) {
      return jsonResponse({ error: 'Quote not found' }, 404);
    }

    // Check if the quote belongs to the logged-in user or if the user is a delivery agent assigned to it
    if (quote.userId !== session.id && session.role !== 'DELIVERY_AGENT' && session.role !== 'SUPER_ADMIN') {
      return jsonResponse({ error: 'Forbidden: You do not have permission to update this quote' }, 403);
    }

    const updates = parseResult.data;

    // 4. Merge existing quote data with new diagnostic answers
    const mergedData = {
      brand: quote.brand,
      model: quote.model,
      storage: quote.storage,
      condition: (quote.condition || 'good') as 'excellent' | 'good' | 'average',
      screenCracked: updates.screenCracked ?? quote.screenCracked ?? false,
      batteryHealth: updates.batteryHealth ?? quote.batteryHealth ?? 100,
      cameraIssue: updates.cameraIssue ?? quote.cameraIssue ?? false,
      fingerprintIssue: updates.fingerprintIssue ?? quote.fingerprintIssue ?? false,
      faceIdIssue: updates.faceIdIssue ?? quote.faceIdIssue ?? false,
      bodyDamage: updates.bodyDamage ?? quote.bodyDamage ?? false,
      speakerIssue: updates.speakerIssue ?? quote.speakerIssue ?? false,
      chargingPortIssue: updates.chargingPortIssue ?? quote.chargingPortIssue ?? false,
    };

    // 5. Recalculate price on server side
    const calculation = await PricingService.calculateQuote(mergedData);

    // 6. Save the Quote using Prisma client
    const updatedQuote = await prisma.quote.update({
      where: { id: quote.id },
      data: {
        screenCracked: mergedData.screenCracked,
        batteryHealth: mergedData.batteryHealth,
        cameraIssue: mergedData.cameraIssue,
        fingerprintIssue: mergedData.fingerprintIssue,
        faceIdIssue: mergedData.faceIdIssue,
        bodyDamage: mergedData.bodyDamage,
        speakerIssue: mergedData.speakerIssue,
        chargingPortIssue: mergedData.chargingPortIssue,
        estimatedPrice: calculation.estimatedPrice,
        finalPrice: calculation.estimatedPrice,
      },
    });

    return jsonResponse({
      success: true,
      quote: updatedQuote,
    });
  } catch (err: any) {
    console.error('Update Quote Diagnostics Error:', err);
    return jsonResponse(
      { error: err.message || 'Internal server error while updating diagnostics' },
      500
    );
  }
}

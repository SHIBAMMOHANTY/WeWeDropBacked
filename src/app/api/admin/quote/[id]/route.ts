import { z } from 'zod';
import { jsonResponse, getAuthSession } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const updateQuoteSchema = z.object({
  finalPrice: z.number().min(0, 'Final price cannot be negative').optional(),
  status: z.enum([
    'pending',
    'requested',
    'accepted',
    'pickup_scheduled',
    'pickup_successful',
    'payment_processing',
    'payment_completed',
    'cancelled',
    'rejected',
    'ordered',
    'submitted'
  ], {
    errorMap: () => ({ message: "Status must be one of: pending, requested, accepted, pickup_scheduled, pickup_successful, payment_processing, payment_completed, cancelled, rejected, ordered, submitted" }),
  }).optional(),
  pickupDate: z.string().optional().nullable(),
  agentId: z.string().optional().nullable(),
}).refine(data => data.finalPrice !== undefined || data.status !== undefined || data.pickupDate !== undefined || data.agentId !== undefined, {
  message: "At least one of 'finalPrice', 'status', 'pickupDate', or 'agentId' is required for update",
});

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Authenticate user and verify role
    const session = await getAuthSession(req);
    if (!session || !session.id) {
      return jsonResponse({ error: 'Unauthorized: Authentication required' }, 401);
    }
    
    if (session.role !== 'SUPER_ADMIN' && session.role !== 'DELIVERY_AGENT') {
      return jsonResponse({ error: 'Forbidden: Admin or Agent role required' }, 403);
    }

    const { id } = params;
    if (!id) {
      return jsonResponse({ error: 'Quote ID is required' }, 400);
    }

    const body = await req.json();

    // 2. Validate request parameters
    const parseResult = updateQuoteSchema.safeParse(body);
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

    const { finalPrice, status, pickupDate, agentId } = parseResult.data;

    // 3. Look up the Quote using Prisma
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

    // Check if agent is updating their own assigned quote
    if (session.role === 'DELIVERY_AGENT' && quote.agentId !== session.id) {
      return jsonResponse({ error: 'Forbidden: This quote is not assigned to you' }, 403);
    }

    // 4. Update the quote
    const updateData: any = {};
    if (finalPrice !== undefined) {
      updateData.finalPrice = finalPrice;
    }
    if (status !== undefined) {
      updateData.status = status;
    }
    if (pickupDate !== undefined) {
      updateData.pickupDate = pickupDate ? new Date(pickupDate) : null;
    }
    if (agentId !== undefined) {
      updateData.agentId = agentId;
    }

    const updatedQuote = await prisma.quote.update({
      where: { id: quote.id },
      data: updateData,
    });

    return jsonResponse({
      success: true,
      message: 'Quote updated successfully',
      quote: updatedQuote,
    });
  } catch (err: any) {
    console.error('Update Quote Error:', err);
    return jsonResponse(
      { error: err.message || 'Internal server error while updating quote' },
      500
    );
  }
}

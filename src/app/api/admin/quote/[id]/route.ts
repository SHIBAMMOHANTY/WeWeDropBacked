import { z } from 'zod';
import { jsonResponse, getAuthSession } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const updateQuoteSchema = z.object({
  finalPrice: z.number().min(0, 'Final price cannot be negative').optional(),
  status: z.enum(['pending', 'completed', 'cancelled'], {
    errorMap: () => ({ message: "Status must be 'pending', 'completed', or 'cancelled'" }),
  }).optional(),
}).refine(data => data.finalPrice !== undefined || data.status !== undefined, {
  message: "At least one of 'finalPrice' or 'status' is required for update",
});

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Authenticate user and verify role is SUPER_ADMIN
    const session = await getAuthSession(req);
    if (!session || !session.id) {
      return jsonResponse({ error: 'Unauthorized: Authentication required' }, 401);
    }
    
    if (session.role !== 'SUPER_ADMIN') {
      return jsonResponse({ error: 'Forbidden: Admin role required' }, 403);
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

    const { finalPrice, status } = parseResult.data;

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

    // 4. Update the quote
    const updateData: any = {};
    if (finalPrice !== undefined) {
      updateData.finalPrice = finalPrice;
    }
    if (status !== undefined) {
      updateData.status = status;
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

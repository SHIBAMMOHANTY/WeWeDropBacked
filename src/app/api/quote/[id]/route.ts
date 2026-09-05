import { jsonResponse, getAuthSession } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.id) {
      return jsonResponse({ error: 'Unauthorized: Authentication required' }, 401);
    }

    const { id } = params;
    if (!id) {
      return jsonResponse({ error: 'Quote ID is required' }, 400);
    }

    // Attempt retrieval by MongoDB ObjectId or Unique Quote Number
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

    // Role-based Access Control: User must be owner, or have SUPER_ADMIN role
    const isOwner = quote.userId === session.id;
    const isAdmin = session.role === 'SUPER_ADMIN';

    if (!isOwner && !isAdmin) {
      return jsonResponse({ error: 'Forbidden: Access denied' }, 403);
    }

    return jsonResponse({
      success: true,
      quote,
    });
  } catch (err: any) {
    console.error('Fetch Quote Details Error:', err);
    return jsonResponse(
      { error: err.message || 'Internal server error while fetching quote details' },
      500
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.id) {
      return jsonResponse({ error: 'Unauthorized: Authentication required' }, 401);
    }

    const { id } = params;
    if (!id) {
      return jsonResponse({ error: 'Quote ID is required' }, 400);
    }

    // Must be object ID to update
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    if (!isObjectId) {
      return jsonResponse({ error: 'Invalid Quote ID for update' }, 400);
    }

    const quote = await prisma.quote.findUnique({
      where: { id },
    });

    if (!quote) {
      return jsonResponse({ error: 'Quote not found' }, 404);
    }

    if (quote.userId !== session.id && session.role !== 'SUPER_ADMIN') {
      return jsonResponse({ error: 'Forbidden: Access denied' }, 403);
    }

    const body = await req.json();

    const updatedQuote = await prisma.quote.update({
      where: { id },
      data: {
        customerName: body.customerName !== undefined ? body.customerName : undefined,
        customerAddress: body.customerAddress !== undefined ? body.customerAddress : undefined,
        customerPincode: body.customerPincode !== undefined ? body.customerPincode : undefined,
        contactNumber: body.contactNumber !== undefined ? body.contactNumber : undefined,
        imeiNumber: body.imeiNumber !== undefined ? body.imeiNumber : (body.imei !== undefined ? body.imei : undefined),
        imei: body.imei !== undefined ? body.imei : (body.imeiNumber !== undefined ? body.imeiNumber : undefined),
        paymentMode: body.paymentMode !== undefined ? body.paymentMode : undefined,
        description: body.description !== undefined ? body.description : undefined,
        finalPrice: body.finalPrice !== undefined ? body.finalPrice : undefined,
        status: body.status !== undefined ? body.status : (body.customerName ? 'booked' : quote.status),
        payoutMethod: body.payoutMethod !== undefined ? body.payoutMethod : undefined,
        upiId: body.upiId !== undefined ? body.upiId : undefined,
        bankAccount: body.bankAccount !== undefined ? body.bankAccount : undefined,
        bankIfsc: body.bankIfsc !== undefined ? body.bankIfsc : undefined,
        bankAccountHolder: body.bankAccountHolder !== undefined ? body.bankAccountHolder : undefined,
        isDelayed: body.isDelayed !== undefined ? body.isDelayed : undefined,
        delayReason: body.delayReason !== undefined ? body.delayReason : undefined,
      },
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


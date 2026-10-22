import { z } from 'zod';
import { jsonResponse, getAuthSession } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { sendInvoiceWhatsApp } from '@/lib/invoice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const updateQuoteSchema = z.object({
  finalPrice: z.number().min(0, 'Final price cannot be negative').optional(),
  estimatedPrice: z.number().min(0).optional(),
  status: z.string().optional(),
  pickupDate: z.string().optional().nullable(),
  agentId: z.string().optional().nullable(),
  paymentMethod: z.string().optional().nullable(),
  paymentMode: z.string().optional().nullable(),
  payoutDetails: z.any().optional().nullable(),
  customerName: z.string().optional().nullable(),
  contactNumber: z.string().optional().nullable(),
  customerAddress: z.string().optional().nullable(),
  customerPincode: z.string().optional().nullable(),
  shopName: z.string().optional().nullable(),
  dealerName: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  storage: z.string().optional().nullable(),
  ram: z.string().optional().nullable(),
  imeiNumber: z.string().optional().nullable(),
  imei: z.string().optional().nullable(),
  condition: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  upiId: z.string().optional().nullable(),
  bankAccount: z.string().optional().nullable(),
  bankIfsc: z.string().optional().nullable(),
  bankAccountHolder: z.string().optional().nullable(),
});

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    if (!id) {
      return jsonResponse({ error: 'Quote ID is required' }, 400);
    }

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

    return jsonResponse({
      success: true,
      quote,
    });
  } catch (err: any) {
    console.error('Admin Fetch Quote Error:', err);
    return jsonResponse(
      { error: err.message || 'Internal server error while fetching quote' },
      500
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Authenticate user and verify role
    let session: any = null;
    try {
      session = await getAuthSession(req);
    } catch (_) {
      const agentKey = req.headers.get('x-agent-key');
      if (agentKey === 'wepick-diagnose-agent-token') {
        session = { id: 'DIAGNOSE_APP', role: 'DELIVERY_AGENT' };
      }
    }

    if (!session || !session.id) {
      const agentKey = req.headers.get('x-agent-key');
      if (agentKey === 'wepick-diagnose-agent-token') {
        session = { id: 'DIAGNOSE_APP', role: 'DELIVERY_AGENT' };
      } else {
        return jsonResponse({ error: 'Unauthorized: Authentication required' }, 401);
      }
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

    const {
      finalPrice,
      estimatedPrice,
      status,
      pickupDate,
      agentId,
      paymentMethod,
      paymentMode,
      payoutDetails,
      customerName,
      contactNumber,
      customerAddress,
      customerPincode,
      shopName,
      dealerName,
      brand,
      model,
      storage,
      ram,
      imeiNumber,
      imei,
      condition,
      description,
      upiId,
      bankAccount,
      bankIfsc,
      bankAccountHolder,
    } = parseResult.data;

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

    // Check if agent is updating assigned or unassigned quote
    if (session.role === 'DELIVERY_AGENT' && quote.agentId && String(quote.agentId) !== String(session.id)) {
      console.warn(`[Quote Update] Agent ${session.id} updating quote assigned to ${quote.agentId}`);
    }

    // 4. Update the quote
    const updateData: any = {};
    if (finalPrice !== undefined) {
      updateData.finalPrice = finalPrice;
    }
    if (estimatedPrice !== undefined) {
      updateData.estimatedPrice = estimatedPrice;
    }
    if (status !== undefined) {
      let mappedStatus = status.toLowerCase();
      if (status === 'PAID') mappedStatus = 'payment_completed';
      if (status === 'DELIVERED') mappedStatus = 'pickup_successful';
      if (status === 'CANCELLED') mappedStatus = 'cancelled';
      updateData.status = mappedStatus;
    }
    if (pickupDate !== undefined) {
      updateData.pickupDate = pickupDate ? new Date(pickupDate) : null;
    }
    if (agentId !== undefined) {
      updateData.agentId = agentId && /^[0-9a-fA-F]{24}$/.test(agentId) ? agentId : null;
    } else if (session.role === 'DELIVERY_AGENT' && !quote.agentId) {
      updateData.agentId = session.id;
    }
    if (paymentMethod !== undefined) {
      updateData.paymentMethod = paymentMethod;
    }
    if (paymentMode !== undefined) {
      updateData.paymentMode = paymentMode;
    }
    if (customerName !== undefined) {
      updateData.customerName = customerName ? customerName.trim() : null;
    }
    if (contactNumber !== undefined) {
      updateData.contactNumber = contactNumber ? contactNumber.trim() : null;
    }
    if (customerAddress !== undefined) {
      updateData.customerAddress = customerAddress ? customerAddress.trim() : null;
    }
    if (customerPincode !== undefined) {
      updateData.customerPincode = customerPincode ? customerPincode.trim() : null;
    }
    if (shopName !== undefined) {
      updateData.shopName = shopName ? shopName.trim() : null;
    }
    if (dealerName !== undefined) {
      updateData.dealerName = dealerName ? dealerName.trim() : null;
    }
    if (brand !== undefined) {
      updateData.brand = brand ? brand.trim() : null;
    }
    if (model !== undefined) {
      updateData.model = model ? model.trim() : null;
    }
    if (storage !== undefined) {
      updateData.storage = storage ? storage.trim() : null;
    }
    if (ram !== undefined) {
      updateData.ram = ram ? ram.trim() : null;
    }
    if (imeiNumber !== undefined || imei !== undefined) {
      const imeiVal = (imeiNumber || imei)?.trim() || null;
      updateData.imeiNumber = imeiVal;
      updateData.imei = imeiVal;
    }
    if (condition !== undefined) {
      updateData.condition = condition ? condition.trim() : null;
    }
    if (description !== undefined) {
      updateData.description = description ? description.trim() : null;
    }
    if (upiId !== undefined) {
      updateData.upiId = upiId ? upiId.trim() : null;
    }
    if (bankAccount !== undefined) {
      updateData.bankAccount = bankAccount ? bankAccount.trim() : null;
    }
    if (bankIfsc !== undefined) {
      updateData.bankIfsc = bankIfsc ? bankIfsc.trim() : null;
    }
    if (bankAccountHolder !== undefined) {
      updateData.bankAccountHolder = bankAccountHolder ? bankAccountHolder.trim() : null;
    }

    if (body.isDead !== undefined || body.isPhoneDead !== undefined || body.deadPhone !== undefined || body.phoneCondition === 'dead') {
      const deadBool = Boolean(body.isDead || body.isPhoneDead || body.deadPhone || body.phoneCondition === 'dead');
      updateData.isDead = deadBool;
      updateData.isPhoneDead = deadBool;
      if (deadBool) {
        updateData.diagnosisCompleted = true;
      }
    }

    if (body.agentInspectionRemarks !== undefined || body.agentRemarks !== undefined) {
      updateData.description = body.agentInspectionRemarks || body.agentRemarks;
    }

    if (body.diagnosisCompleted !== undefined) {
      updateData.diagnosisCompleted = Boolean(body.diagnosisCompleted);
    }

    const currentPayout = (typeof quote.payoutDetails === 'object' && quote.payoutDetails) ? quote.payoutDetails : {};
    const incomingPayout = (typeof payoutDetails === 'object' && payoutDetails) ? payoutDetails : {};

    updateData.payoutDetails = {
      ...currentPayout,
      ...incomingPayout,
      personName: body.personName || incomingPayout.personName || (currentPayout as any).personName || quote.customerName,
      idType: body.idType || incomingPayout.idType,
      idNumber: body.idNumber || incomingPayout.idNumber,
      idFront: body.idFront || incomingPayout.idFront,
      idBack: body.idBack || incomingPayout.idBack,
    };

    if (Array.isArray(body.proofImages) || Array.isArray(body.images)) {
      updateData.images = body.proofImages || body.images;
    }

    const updatedQuote = await prisma.quote.update({
      where: { id: quote.id },
      data: updateData,
    });

    if (updateData.status === 'payment_completed' && body.skipWhatsAppInvoice !== true && body.skipWhatsApp !== true) {
      try {
        sendInvoiceWhatsApp(updatedQuote).then((url) => {
          console.log('[MSG91] Background WhatsApp Invoice sent successfully. PDF URL:', url);
        }).catch((err) => {
          console.error('[MSG91] Background invoice WhatsApp dispatch promise failed:', err);
        });
      } catch (e) {
        console.error('[MSG91] Background invoice dispatch init error:', e);
      }
    }

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

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    if (!id) {
      return jsonResponse({ error: 'Quote ID is required' }, 400);
    }

    let quote = null;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    if (isObjectId) {
      quote = await prisma.quote.findUnique({ where: { id } }).catch(() => null);
    }
    if (!quote) {
      quote = await prisma.quote.findUnique({ where: { quoteNumber: id } }).catch(() => null);
    }
    if (!quote) {
      quote = await prisma.quote.findFirst({
        where: {
          OR: [
            { quoteNumber: id },
            { quoteNumber: { equals: id, mode: 'insensitive' } },
          ],
        },
      }).catch(() => null);
    }

    if (!quote) {
      return jsonResponse({ error: 'Quote not found' }, 404);
    }

    await prisma.quote.delete({
      where: { id: quote.id },
    });

    return jsonResponse({
      success: true,
      message: 'Quote deleted successfully',
      deletedId: quote.id,
    });
  } catch (err: any) {
    console.error('Delete Quote Error:', err);
    return jsonResponse(
      { error: err.message || 'Internal server error while deleting quote' },
      500
    );
  }
}


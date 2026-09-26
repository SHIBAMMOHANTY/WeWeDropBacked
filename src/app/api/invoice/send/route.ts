import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendInvoiceWhatsApp } from '@/lib/invoice';

function jsonResponse(data: any, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function OPTIONS() {
  return jsonResponse({}, 200);
}

/**
 * POST /api/invoice/send
 * 
 * Generates purchase receipt PDF and dispatches MSG91 WhatsApp outbound template message.
 * Accepts either:
 * - { quoteId: "6a930f747591caf46c4d857f" }
 * - OR full quote object payload
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    let quoteData = body;

    if (body.quoteId) {
      const dbQuote = await prisma.quote.findUnique({
        where: { id: body.quoteId },
      });
      if (dbQuote) {
        quoteData = {
          ...dbQuote,
          ...body,
          customerName: body.customerName || dbQuote.customerName,
          contactNumber: body.contactNumber || body.phone || dbQuote.contactNumber,
          phone: body.phone || body.contactNumber || dbQuote.phone || dbQuote.contactNumber,
          payoutDetails: body.payoutDetails || dbQuote.payoutDetails,
          finalPrice: body.finalPrice || dbQuote.finalPrice,
        };
      }
    }

    if (!quoteData || (!quoteData.contactNumber && !quoteData.phone)) {
      return jsonResponse({ error: 'Valid quote data or quoteId with phone number is required.' }, 400);
    }

    const result: any = await sendInvoiceWhatsApp(quoteData);
    const invoiceUrl = result?.invoiceUrl || String(result);

    return jsonResponse({
      success: true,
      message: result?.whatsappDispatched
        ? `Purchase receipt PDF generated and WhatsApp message dispatched to ${result?.mobileNumber}.`
        : `Purchase receipt PDF generated. WhatsApp status: ${result?.error || 'Dispatched to MSG91'}`,
      invoicePdf: invoiceUrl,
      whatsapp: {
        dispatched: Boolean(result?.whatsappDispatched),
        sentTo: result?.mobileNumber || quoteData.contactNumber,
        status: result?.msg91Status || null,
        response: result?.msg91Response || null,
        error: result?.error || null,
      },
    });
  } catch (err: any) {
    console.error('[API POST /api/invoice/send] Error:', err);
    return jsonResponse({ error: err.message || 'Failed to dispatch invoice WhatsApp message' }, 500);
  }
}

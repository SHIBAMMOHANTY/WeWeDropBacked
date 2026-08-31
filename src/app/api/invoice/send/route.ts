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
        quoteData = dbQuote;
      }
    }

    if (!quoteData || (!quoteData.contactNumber && !quoteData.phone)) {
      return jsonResponse({ error: 'Valid quote data or quoteId with phone number is required.' }, 400);
    }

    console.log('[API POST /api/invoice/send] Processing invoice dispatch for:', quoteData.id || quoteData.quoteNumber);

    const invoiceUrl = await sendInvoiceWhatsApp(quoteData);

    return jsonResponse({
      success: true,
      message: 'Purchase receipt PDF generated and WhatsApp message dispatched via MSG91.',
      invoicePdf: invoiceUrl,
    });
  } catch (err: any) {
    console.error('[API POST /api/invoice/send] Error:', err);
    return jsonResponse({ error: err.message || 'Failed to dispatch invoice WhatsApp message' }, 500);
  }
}

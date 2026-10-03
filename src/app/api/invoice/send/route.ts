import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendInvoiceWhatsApp, sendMobileSaleConfirmationWhatsApp } from '@/lib/invoice';

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

    // If mobile_sale_confirmation template is requested
    if (
      body.templateName === 'mobile_sale_confirmation' ||
      body.template === 'mobile_sale_confirmation' ||
      body.payload?.template?.name === 'mobile_sale_confirmation'
    ) {
      const resSale = await sendMobileSaleConfirmationWhatsApp({
        phone: quoteData.phone || quoteData.contactNumber,
        customerName: quoteData.customerName,
        deviceModel: quoteData.deviceModel || quoteData.model,
        imei: quoteData.imei || quoteData.imeiNumber,
        devices: quoteData.devices,
      });

      return jsonResponse({
        success: resSale.success,
        message: resSale.success
          ? `Sale confirmation WhatsApp dispatched to ${resSale.mobileNumber}.`
          : `Sale confirmation failed: ${resSale.error || 'Check MSG91 config'}`,
        whatsapp: resSale,
      });
    }

    const result: any = await sendInvoiceWhatsApp({ ...quoteData, forceDispatch: true });
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

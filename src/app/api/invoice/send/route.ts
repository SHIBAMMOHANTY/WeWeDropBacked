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
 * Supports:
 * 1. Used Mobile Purchase Receipt (invoice_sent template with PDF attachment)
 * 2. Customer Sale Confirmation (mobile_sale_confirmation template)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    let quoteData = { ...body };

    // 1. Safely query DB if quoteId or quoteNumber provided
    const quoteIdRaw = String(body.quoteId || body.id || '').trim();
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(quoteIdRaw);

    let dbQuote: any = null;
    try {
      if (isObjectId) {
        dbQuote = await prisma.quote.findUnique({
          where: { id: quoteIdRaw },
        });
      }
      if (!dbQuote) {
        const qNum = body.quoteNumber || body.quoteId || body.id;
        if (qNum) {
          dbQuote = await prisma.quote.findFirst({
            where: { quoteNumber: String(qNum) },
          });
        }
      }
    } catch (findErr) {
      console.warn('[Invoice] DB Quote Lookup Notice:', findErr);
    }

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

    const templateName =
      body.templateName ||
      body.template ||
      body.payload?.template?.name ||
      '';

    console.log(`📤 [POST /api/invoice/send] Processing request for template: "${templateName || 'invoice_sent'}", phone: ${quoteData.phone || quoteData.contactNumber}`);

    // 2. If sale_confirmation or mobile_sale_confirmation template is requested
    if (templateName === 'sale_confirmation' || templateName === 'mobile_sale_confirmation') {
      const resSale = await sendMobileSaleConfirmationWhatsApp({
        phone: quoteData.phone || quoteData.contactNumber || body.recipient,
        customerName: quoteData.customerName || body.templateData?.var1 || 'Valued Customer',
        deviceModel: quoteData.deviceModel || quoteData.model || body.templateData?.var2 || 'Handset',
        imei: quoteData.imei || quoteData.imeiNumber || body.templateData?.var3 || 'N/A',
        templateName: templateName || 'sale_confirmation',
        devices: quoteData.devices,
      });

      console.log(`📲 [MSG91 ${templateName} Result]:`, resSale);

      return jsonResponse({
        success: resSale.success,
        message: resSale.success
          ? `Sale confirmation WhatsApp dispatched to ${resSale.mobileNumber}.`
          : `Sale confirmation failed: ${resSale.error || 'Check MSG91 config'}`,
        whatsapp: resSale,
      });
    }

    // 3. Default: Dispatch Used Mobile Purchase Receipt (invoice_sent template with PDF)
    const result: any = await sendInvoiceWhatsApp({ ...quoteData, forceDispatch: true });
    const invoiceUrl = result?.invoiceUrl || String(result);

    console.log('📲 [MSG91 invoice_sent Result]:', {
      dispatched: result?.whatsappDispatched,
      mobile: result?.mobileNumber,
      status: result?.msg91Status,
      response: result?.msg91Response,
      error: result?.error,
    });

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

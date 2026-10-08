import { NextResponse } from 'next/server';
import { sendMobileSaleConfirmationWhatsApp, sendInvoiceWhatsApp } from '@/lib/invoice';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/**
 * POST /api/notifications/whatsapp/template
 * 
 * Generic MSG91 WhatsApp Template Message Dispatcher
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const templateName =
      body.templateName ||
      body.template ||
      body.payload?.template?.name ||
      '';

    const authKey = process.env.MSG91_AUTH_KEY;
    const intNumber = process.env.MSG91_INTEGRATED_NUMBER || '919318411796';
    const namespace = process.env.MSG91_NAMESPACE || 'e67365fb_e80f_4118_a3da_6701091246fa';

    // 1. Mobile Sale Confirmation Template
    if (templateName === 'mobile_sale_confirmation') {
      const phone = body.phone || body.contactNumber || body.recipient || body.payload?.template?.to_and_components?.[0]?.to?.[0] || '';
      const customerName = body.customerName || body.templateData?.var1 || body.payload?.template?.to_and_components?.[0]?.components?.body_1?.value || 'Valued Customer';
      const deviceModel = body.deviceModel || body.model || body.templateData?.var2 || body.payload?.template?.to_and_components?.[0]?.components?.body_2?.value || 'Handset';
      const imei = body.imei || body.imeiNumber || body.templateData?.var3 || body.payload?.template?.to_and_components?.[0]?.components?.body_3?.value || 'N/A';

      const resSale = await sendMobileSaleConfirmationWhatsApp({
        phone,
        customerName,
        deviceModel,
        imei,
        devices: body.devices,
      });

      return NextResponse.json({
        success: resSale.success,
        message: resSale.success
          ? `Sale confirmation WhatsApp dispatched to ${resSale.mobileNumber}.`
          : `Sale confirmation failed: ${resSale.error || 'Check MSG91 config'}`,
        whatsapp: resSale,
      }, { status: resSale.success ? 200 : 400, headers: corsHeaders });
    }

    // 2. Used Mobile Purchase Receipt / Invoice Template
    if (templateName === 'invoice_sent' || body.invoice_sent || body.quoteId) {
      const result: any = await sendInvoiceWhatsApp({ ...body, forceDispatch: true });
      return NextResponse.json({
        success: Boolean(result?.whatsappDispatched),
        message: result?.whatsappDispatched
          ? `Purchase receipt WhatsApp dispatched to ${result?.mobileNumber}.`
          : `Purchase receipt status: ${result?.error || 'Dispatched to MSG91'}`,
        whatsapp: result,
      }, { status: result?.whatsappDispatched ? 200 : 400, headers: corsHeaders });
    }

    // 3. Raw MSG91 Template Proxy Dispatch
    if (body.payload && body.payload.template) {
      if (!authKey || authKey === 'your_msg91_authkey_here') {
        return NextResponse.json(
          { error: 'MSG91 Auth Key missing in environment' },
          { status: 500, headers: corsHeaders }
        );
      }

      const msg91Payload = {
        integrated_number: body.integrated_number || intNumber,
        content_type: 'template',
        payload: {
          messaging_product: 'whatsapp',
          type: 'template',
          template: {
            ...body.payload.template,
            namespace: body.payload.template.namespace || namespace,
          },
        },
      };

      const res = await fetch(
        'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/',
        {
          method: 'POST',
          headers: {
            authkey: authKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(msg91Payload),
        }
      );

      const responseText = await res.text();
      let responseJson: any = null;
      try {
        responseJson = JSON.parse(responseText);
      } catch (_) {
        responseJson = { raw: responseText };
      }

      return NextResponse.json({
        success: res.ok,
        status: res.status,
        response: responseJson,
      }, { status: res.ok ? 200 : 400, headers: corsHeaders });
    }

    return NextResponse.json(
      { error: 'Invalid template payload. Specify templateName or MSG91 payload structure.' },
      { status: 400, headers: corsHeaders }
    );
  } catch (err: any) {
    console.error('[API POST /api/notifications/whatsapp/template] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to dispatch WhatsApp template message' },
      { status: 500, headers: corsHeaders }
    );
  }
}

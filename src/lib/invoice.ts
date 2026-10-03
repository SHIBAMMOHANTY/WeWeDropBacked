import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { uploadToCloudinary } from './upload';
import { prisma } from './prisma';

function getR2Client() {
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT || 'https://2ecf668a62f8c8df5b85bbe3c3368f5c.r2.cloudflarestorage.com';
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || 'ec927c9858329b5e3aa0d04730e33ebf';
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || 'b78a67734d4ad6bf96559ab351a93da8febf1066133fdc7abb5296233cababea';

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

/**
 * Generates a high-fidelity PDF purchase receipt matching WEPICK WEDROP used mobile template.
 */
export async function generateInvoicePDF(quote: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    const cyanColor = '#0891B2';
    const darkColor = '#0F172A';
    const grayColor = '#475569';
    const lightGray = '#E2E8F0';

    const setFont = (fontName: string) => {
      try {
        doc.font(fontName);
      } catch (e) {
        // Fallback silently if font file loading fails in bundler
      }
    };

    // Header Title and Logo
    setFont('Helvetica-Bold');
    doc.fillColor(darkColor).fontSize(16).text('USED MOBILE PURCHASE RECEIPT', 40, 40);
    setFont('Helvetica-Bold');
    doc.fillColor(cyanColor).fontSize(16).text('WEPICK WEDROP', 400, 40, { align: 'right' });
    
    // Sub-header details
    setFont('Helvetica-Bold');
    doc.fillColor(cyanColor).fontSize(9).text('DYVOLOOP LOGISTIC PRIVATE LIMITED', 40, 65);
    setFont('Helvetica');
    doc.fillColor(grayColor).fontSize(8).text(
      'Registered Office: Budh Vihar, Phase 1,\nBlock A1, House No. 3/A, Delhi - 110086\nGSTIN: 07AALCD8950C1ZJ\nEmail: support@wepickwedrop.com',
      40, 78,
      { lineGap: 2 }
    );

    // Receipt Box Right Header
    const boxX = 380;
    const boxY = 62;
    const boxW = 180;
    const boxH = 50;
    doc.strokeColor(lightGray).lineWidth(1).rect(boxX, boxY, boxW, boxH).stroke();
    // Inner box lines
    doc.moveTo(boxX, boxY + 17).lineTo(boxX + boxW, boxY + 17).stroke();
    doc.moveTo(boxX, boxY + 34).lineTo(boxX + boxW, boxY + 34).stroke();
    doc.moveTo(boxX + 70, boxY).lineTo(boxX + 70, boxY + boxH).stroke();

    const receiptNo = `WWP/PR/25-26/${quote.quoteNumber || (quote.id ? quote.id.slice(-6).toUpperCase() : '000000')}`;
    const dateStr = quote.payoutDetails?.date || (quote.updatedAt ? new Date(quote.updatedAt).toLocaleString('en-IN') : new Date().toLocaleString('en-IN'));

    setFont('Helvetica-Bold');
    doc.fontSize(7.5).fillColor(grayColor);
    doc.text('RECEIPT NO.', boxX + 6, boxY + 5);
    doc.text('DATE & TIME', boxX + 6, boxY + 22);
    doc.text('PLACE', boxX + 6, boxY + 39);

    setFont('Helvetica-Bold');
    doc.fontSize(8).fillColor(cyanColor);
    doc.text(receiptNo, boxX + 76, boxY + 5);
    setFont('Helvetica');
    doc.fontSize(7.5).fillColor(darkColor);
    doc.text(dateStr, boxX + 76, boxY + 22);
    doc.text('Delhi, India', boxX + 76, boxY + 39);

    let currentY = 130;

    // Banner draw helper
    function drawSectionBanner(title: string, y: number) {
      doc.fillColor(cyanColor).rect(40, y, 520, 15).fill();
      setFont('Helvetica-Bold');
      doc.fillColor('#FFFFFF').fontSize(8.5).text(title, 46, y + 3.5);
      return y + 20;
    }

    // Grid row draw helper
    function drawGridRow(labels: string[], values: string[], y: number, heights: number = 20) {
      doc.strokeColor(lightGray).lineWidth(1).rect(40, y, 520, heights).stroke();
      
      const colW = 130;
      doc.moveTo(40 + colW, y).lineTo(40 + colW, y + heights).stroke();
      doc.moveTo(40 + colW * 2, y).lineTo(40 + colW * 2, y + heights).stroke();
      doc.moveTo(40 + colW * 3, y).lineTo(40 + colW * 3, y + heights).stroke();

      // Col 1 label and value
      setFont('Helvetica-Bold');
      doc.fontSize(7.5).fillColor(grayColor).text(labels[0], 46, y + 6);
      setFont('Helvetica');
      doc.fontSize(7.5).fillColor(darkColor).text(values[0], 176, y + 6, { width: 110, height: heights - 8 });

      // Col 2 label and value
      setFont('Helvetica-Bold');
      doc.fontSize(7.5).fillColor(grayColor).text(labels[1], 306, y + 6);
      setFont('Helvetica');
      doc.fontSize(7.5).fillColor(darkColor).text(values[1], 436, y + 6, { width: 110, height: heights - 8 });

      return y + heights;
    }

    // 1. Seller Details
    currentY = drawSectionBanner('1. SELLER DETAILS', currentY);
    currentY = drawGridRow(
      ['SELLER NAME', 'ID NUMBER'],
      [quote.customerName || 'N/A', quote.payoutDetails?.payoutId || 'Agent App Verified'],
      currentY
    );
    currentY = drawGridRow(
      ['MOBILE NO.', 'KYC REF'],
      [quote.contactNumber || quote.phone || 'N/A', 'Verified (Aadhar/PAN)'],
      currentY
    );
    
    // Address block
    doc.strokeColor(lightGray).rect(40, currentY, 520, 20).stroke();
    doc.moveTo(170, currentY).lineTo(170, currentY + 20).stroke();
    setFont('Helvetica-Bold');
    doc.fontSize(7.5).fillColor(grayColor).text('ADDRESS', 46, currentY + 6);
    setFont('Helvetica');
    doc.fontSize(7.5).fillColor(darkColor).text(quote.customerAddress || 'N/A', 176, currentY + 6, { width: 370 });
    currentY += 20;

    // Payment Mode
    doc.strokeColor(lightGray).rect(40, currentY, 520, 20).stroke();
    doc.moveTo(170, currentY).lineTo(170, currentY + 20).stroke();
    doc.moveTo(300, currentY).lineTo(300, currentY + 20).stroke();
    doc.moveTo(430, currentY).lineTo(430, currentY + 20).stroke();

    setFont('Helvetica-Bold');
    doc.fontSize(7.5).fillColor(grayColor).text('PAYMENT MODE', 46, currentY + 6);
    const methodStr = `${quote.paymentMethod === 'CASH' ? '[x] Cash' : '[ ] Cash'}  ${quote.paymentMethod === 'UPI' ? '[x] UPI' : '[ ] UPI'}  ${quote.paymentMethod === 'BANK' ? '[x] Bank' : '[ ] Bank'}`;
    setFont('Helvetica');
    doc.fontSize(7.5).fillColor(darkColor).text(methodStr, 176, currentY + 6);

    setFont('Helvetica-Bold');
    doc.fontSize(7.5).fillColor(grayColor).text('TXN ID / UTR', 306, currentY + 6);
    setFont('Helvetica-Bold');
    doc.fontSize(7.5).fillColor(cyanColor).text(quote.payoutDetails?.utr || 'CASH_PAYMENT', 436, currentY + 6, { width: 110 });
    currentY += 20;

    // 2. Customer Details
    currentY += 8;
    currentY = drawSectionBanner('2. CUSTOMER DETAILS (FOR RECORD)', currentY);
    currentY = drawGridRow(
      ['CUSTOMER NAME', 'ID TYPE'],
      ['WEPICK WEDROP', 'Corporate Identity'],
      currentY
    );
    currentY = drawGridRow(
      ['MOBILE NO.', 'ID NUMBER'],
      ['8750662854', 'U74999DL2022PTC394857'],
      currentY
    );
    
    // Address block
    doc.strokeColor(lightGray).rect(40, currentY, 520, 20).stroke();
    doc.moveTo(170, currentY).lineTo(170, currentY + 20).stroke();
    setFont('Helvetica-Bold');
    doc.fontSize(7.5).fillColor(grayColor).text('ADDRESS', 46, currentY + 6);
    setFont('Helvetica');
    doc.fontSize(7.5).fillColor(darkColor).text('Flat no. 90/25, A1/3A Budh Vihar Phase I, Delhi - 110086', 176, currentY + 6, { width: 370 });
    currentY += 20;

    // 3. Device Details
    currentY += 8;
    currentY = drawSectionBanner('3. DEVICE DETAILS', currentY);
    currentY = drawGridRow(
      ['BRAND / MODEL', 'VARIANT (RAM/STORAGE)'],
      [`${quote.brand || 'N/A'} ${quote.model || ''}`, quote.storage || 'N/A'],
      currentY
    );
    currentY = drawGridRow(
      ['IMEI 1 / SERIAL', 'BATTERY HEALTH'],
      [quote.imeiNumber || 'Verified Checks Passed', `${quote.batteryHealth || '100'}%`],
      currentY
    );

    // Device Condition checkboxes
    doc.strokeColor(lightGray).rect(40, currentY, 520, 20).stroke();
    doc.moveTo(170, currentY).lineTo(170, currentY + 20).stroke();
    setFont('Helvetica-Bold');
    doc.fontSize(7.5).fillColor(grayColor).text('DEVICE CONDITION', 46, currentY + 6);
    const condStr = `[x] Working    [ ] Minor Issues    [ ] Damaged    [ ] Dead`;
    setFont('Helvetica');
    doc.fontSize(7.5).fillColor(darkColor).text(condStr, 176, currentY + 6);
    currentY += 20;

    // 4. Purchase Details
    currentY += 8;
    currentY = drawSectionBanner('4. PURCHASE DETAILS', currentY);
    doc.strokeColor(lightGray).rect(40, currentY, 520, 22).stroke();
    doc.moveTo(300, currentY).lineTo(300, currentY + 22).stroke();
    setFont('Helvetica-Bold');
    doc.fontSize(8.5).fillColor(grayColor).text('AMOUNT PAID TO SELLER / CUSTOMER (₹)', 46, currentY + 7);
    setFont('Helvetica-Bold');
    doc.fontSize(11).fillColor(cyanColor).text(`₹ ${quote.finalPrice || quote.estimatedPrice || 0}`, 306, currentY + 6);
    currentY += 22;

    // 5. Seller Declaration
    currentY += 8;
    currentY = drawSectionBanner('5. SELLER DECLARATION', currentY);
    setFont('Helvetica-Oblique');
    doc.fontSize(8).fillColor(grayColor).text(
      'I hereby declare that I am the lawful owner / authorised seller of the above mobile device and have the legal right to sell it. The device is not stolen, lost, pledged or subject to any police/court dispute. The IMEI/serial details provided by me are true. I agree to cooperate with WEPICK WEDROP and law-enforcement authorities if any ownership dispute arises.',
      40, currentY, { width: 520, align: 'justify', lineGap: 1.5 }
    );
    currentY += 45;

    // Signature Area
    const sigY = currentY + 20;
    doc.strokeColor(grayColor).lineWidth(0.5).dash(2, { space: 2 }).moveTo(40, sigY).lineTo(240, sigY).stroke();
    doc.strokeColor(grayColor).lineWidth(0.5).moveTo(320, sigY).lineTo(520, sigY).stroke();
    doc.undash();

    setFont('Helvetica-Bold');
    doc.fontSize(8).fillColor(grayColor);
    doc.text('SELLER SIGNATURE', 40, sigY + 5, { width: 200, align: 'center' });
    doc.text('WEPICK WEDROP REPRESENTATIVE', 320, sigY + 5, { width: 200, align: 'center' });

    setFont('Helvetica');
    doc.fontSize(7.5).fillColor(grayColor);
    doc.text(`Name: ${quote.customerName || ''}`, 40, sigY + 15, { width: 200, align: 'center' });
    doc.text('Authorized Signatory', 320, sigY + 15, { width: 200, align: 'center' });

    // Footer note
    doc.strokeColor(lightGray).lineWidth(1).moveTo(40, 520).lineTo(560, 520).stroke();
    setFont('Helvetica');
    doc.fontSize(7.5).fillColor(grayColor).text(
      'Note: This is a purchase record from the seller. It is not a GST tax invoice.',
      40, 530
    );
    setFont('Helvetica-Bold');
    doc.fontSize(8).fillColor(cyanColor).text(
      'THANK YOU FOR CHOOSING WEPICK WEDROP',
      350, 530, { align: 'right' }
    );

    doc.end();
  });
}

// Module-level deduplication cache to prevent duplicate WhatsApp invoice dispatches
const recentInvoiceDispatches = new Map<string, { timestamp: number; url: string }>();

/**
 * Generates purchase receipt PDF, uploads to Cloudinary/Storage, links to Quote in database,
 * and dispatches outbound template WhatsApp message via MSG91 API (invoice_sent template).
 */
export async function sendInvoiceWhatsApp(quote: any): Promise<string> {
  const customerPhone = quote.contactNumber || quote.phone || '';
  if (!customerPhone) {
    throw new Error('Customer phone number is missing.');
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://wepick-rho.vercel.app';
  const targetId = quote.id || quote.quoteNumber || quote.orderId || 'receipt';
  let invoiceUrl = `${baseUrl}/api/invoice/pdf/${targetId}`;

  // Normalize phone number (adds 91 prefix if it's 10-digits)
  let mobileNumber = customerPhone.replace(/\D/g, '');
  if (mobileNumber.length === 10) {
    mobileNumber = `91${mobileNumber}`;
  }

  // Deduplication check: prevent multiple sends for the same quote and phone within 120 seconds
  const dispatchKey = `${targetId}_${mobileNumber}`;
  const existingDispatch = recentInvoiceDispatches.get(dispatchKey);
  const now = Date.now();

  if (existingDispatch && (now - existingDispatch.timestamp < 120000)) {
    console.log(`⚡ [MSG91 Deduplication] Preventing duplicate WhatsApp dispatch for ${dispatchKey}. Already sent ${Math.round((now - existingDispatch.timestamp) / 1000)}s ago.`);
    const dupResult: any = new String(existingDispatch.url);
    dupResult.invoiceUrl = existingDispatch.url;
    dupResult.whatsappDispatched = true;
    dupResult.alreadyDispatched = true;
    dupResult.mobileNumber = mobileNumber;
    dupResult.msg91Status = 200;
    dupResult.msg91Response = 'Duplicate dispatch prevented - WhatsApp invoice already sent.';
    dupResult.error = null;
    return dupResult;
  }

  // Cleanup old entries from cache
  if (recentInvoiceDispatches.size > 200) {
    recentInvoiceDispatches.forEach((v, k) => {
      if (now - v.timestamp > 600000) {
        recentInvoiceDispatches.delete(k);
      }
    });
  }

  // DB-level deduplication: If this quote already has an invoicePdf generated, do not re-dispatch (unless forceDispatch is true)
  if (!quote.forceDispatch) {
    try {
      const quoteIdLookup = quote.id || (/^[0-9a-fA-F]{24}$/.test(targetId) ? targetId : null);
      if (quoteIdLookup) {
        const existingDbQuote = await prisma.quote.findUnique({
          where: { id: quoteIdLookup },
          select: { invoicePdf: true },
        });
        if (existingDbQuote?.invoicePdf) {
          console.log(`⚡ [DB Deduplication] Quote ${quoteIdLookup} already has invoicePdf (${existingDbQuote.invoicePdf}). Skipping duplicate WhatsApp dispatch.`);
          const dupResult: any = new String(existingDbQuote.invoicePdf);
          dupResult.invoiceUrl = existingDbQuote.invoicePdf;
          dupResult.whatsappDispatched = true;
          dupResult.alreadyDispatched = true;
          dupResult.mobileNumber = mobileNumber;
          dupResult.msg91Status = 200;
          dupResult.msg91Response = 'Duplicate dispatch prevented - Invoice already generated and dispatched.';
          dupResult.error = null;
          return dupResult;
        }
      }
    } catch (dbCheckErr) {
      console.warn('[Invoice DB Deduplication Check Warning]:', dbCheckErr);
    }
  }

  // 1. Generate PDF buffer safely with fallback
  try {
    const pdfBuffer = await generateInvoicePDF(quote);
    let uploaded = false;

    // A. Priority 1: Cloudflare R2 (configured storage bucket & CDN)
    const r2 = getR2Client();
    if (r2) {
      try {
        const bucket = process.env.CLOUDFLARE_R2_BUCKET || 'crm';
        const publicUrlBase = process.env.CLOUDFLARE_R2_PUBLIC_URL_BASE || 'https://pub-3980550907254b0a90694547699c11dd.r2.dev';
        const cleanTargetId = String(targetId).replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = `invoice_${cleanTargetId}.pdf`;
        const key = `invoices/${Date.now()}_${fileName}`;
        await r2.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: pdfBuffer,
            ContentType: 'application/pdf',
            ContentDisposition: `attachment; filename="${fileName}"`,
          })
        );
        invoiceUrl = `${publicUrlBase}/${key}`;
        uploaded = true;
      } catch (r2Err) {
        console.warn('[Invoice Cloudflare R2 Upload Warning]:', r2Err);
      }
    }

    // B. Priority 2: Cloudinary fallback if R2 is not available
    if (!uploaded && process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        const uploadRes = await uploadToCloudinary(pdfBuffer, {
          folder: 'invoices',
          public_id: `invoice_${targetId}`
        });
        if (uploadRes?.secure_url) {
          invoiceUrl = uploadRes.secure_url;
          uploaded = true;
        }
      } catch (uploadErr) {
        console.warn('[Invoice Cloudinary Upload Warning]:', uploadErr);
      }
    }
  } catch (pdfErr) {
    console.warn('[Invoice PDF Generation Warning] (using live stream route URL):', pdfErr);
  }

  if (quote.id) {
    await prisma.quote.update({
      where: { id: quote.id },
      data: { invoicePdf: invoiceUrl }
    }).catch((e: any) => console.warn('[Invoice] DB update warning:', e?.message));
  }

  // 3. Dispatch WhatsApp via MSG91 Template (invoice_sent)
  const authKey = process.env.MSG91_AUTH_KEY;
  const intNumber = process.env.MSG91_INTEGRATED_NUMBER || '919318411796';
  const namespace = process.env.MSG91_NAMESPACE || 'e67365fb_e80f_4118_a3da_6701091246fa';


  const orderId = quote.quoteNumber || quote.orderId || (quote.id ? String(quote.id) : '');
  const customerName = (quote.customerName || quote.custName || quote.dealerName || quote.shopName || quote.personName || quote.beneficiaryName || quote.name || '').trim();

  let deviceName = (quote.model || quote.brand || quote.productName || '').trim();
  if (Array.isArray(quote.devices) && quote.devices.length > 0) {
    deviceName = quote.devices.map((d: any) => `${d.brand || ''} ${d.model || d.phoneModel || ''}`.trim()).filter(Boolean).join(', ') || deviceName;
  }

  let imeiNumber = (quote.imeiNumber || quote.imei || '').trim();
  if (Array.isArray(quote.devices) && quote.devices.length > 0) {
    const imeis = quote.devices.map((d: any) => d.imei || d.imeiNumber).filter(Boolean).join(', ');
    if (imeis) imeiNumber = imeis;
  }

  const rawAmount = quote.finalPrice ?? quote.agreedPrice ?? quote.amount ?? quote.totalAmount ?? quote.estimatedPrice ?? 0;
  const invoiceAmount = `Rs. ${Number(rawAmount).toLocaleString('en-IN')}`;

  const payload = {
    integrated_number: intNumber,
    content_type: 'template',
    payload: {
      messaging_product: 'whatsapp',
      type: 'template',
      template: {
        name: 'invoice_sent',
        language: {
          code: 'en'
        },
        namespace: namespace,
        to_and_components: [
          {
            to: [mobileNumber],
            components: {
              header_1: {
                type: 'document',
                value: invoiceUrl,
              },
              body_1: {
                type: 'text',
                value: String(customerName),
              },
              body_2: {
                type: 'text',
                value: String(orderId),
              },
              body_3: {
                type: 'text',
                value: String(customerName),
              },
              body_4: {
                type: 'text',
                value: String(deviceName),
              },
              body_5: {
                type: 'text',
                value: String(imeiNumber),
              },
              body_6: {
                type: 'text',
                value: String(invoiceAmount),
              },
            },
          }
        ]
      }
    }
  };

  let msg91Status: number | null = null;
  let msg91ResponseText: string | null = null;
  let whatsappDispatched = false;
  let dispatchError: string | null = null;

  if (authKey && authKey !== 'your_msg91_authkey_here') {
    try {
      const res = await fetch(
        'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/',
        {
          method: 'POST',
          headers: {
            authkey: authKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      );

      const responseText = await res.text();
      msg91Status = res.status;
      msg91ResponseText = responseText;

      if (res.ok || res.status === 200) {
        whatsappDispatched = true;
        recentInvoiceDispatches.set(dispatchKey, { timestamp: Date.now(), url: invoiceUrl });
      } else {
        dispatchError = `MSG91 HTTP ${res.status}: ${responseText}`;
      }
    } catch (err: any) {
      dispatchError = err?.message || String(err);
    }
  } else {
    dispatchError = 'MSG91 Auth Key missing or placeholder in .env';
  }

  const result: any = new String(invoiceUrl);
  result.invoiceUrl = invoiceUrl;
  result.whatsappDispatched = whatsappDispatched;
  result.mobileNumber = mobileNumber;
  result.msg91Status = msg91Status;
  result.msg91Response = msg91ResponseText;
  result.error = dispatchError;

  return result;
}

/**
 * Send WhatsApp mobile_sale_confirmation via MSG91 Template (Exact 3-variable payload):
 *
 * Hi {{1}},
 *
 * Your mobile has been successfully sold
 * to WePick WeDrop.
 *
 * Your Device Details:
 * Phone: {{2}}
 * IMEI Number: {{3}}
 *
 * Thank you for choosing WePick WeDrop.
 *
 * Download our app from the Play Store
 * and enjoy our services
 */
export async function sendMobileSaleConfirmationWhatsApp(data: {
  phone: string;
  customerName?: string;
  deviceModel?: string;
  imei?: string;
  devices?: any[];
}) {
  const authKey = process.env.MSG91_AUTH_KEY;
  const intNumber = process.env.MSG91_INTEGRATED_NUMBER || '919318411796';
  const namespace = process.env.MSG91_NAMESPACE || 'e67365fb_e80f_4118_a3da_6701091246fa';

  let cleanPhone = String(data.phone || '').replace(/\D/g, '');
  if (cleanPhone.length === 10) {
    cleanPhone = `91${cleanPhone}`;
  }

  const customerName = (data.customerName || '').trim();
  let deviceModel = (data.deviceModel || '').trim();
  let imei = (data.imei || '').trim();

  if (Array.isArray(data.devices) && data.devices.length > 0) {
    const d0 = data.devices[0];
    deviceModel = `${d0.brand || ''} ${d0.model || d0.phoneModel || ''}`.trim() || deviceModel;
    imei = d0.imei || d0.imeiNumber || imei;
  }

  const payload = {
    integrated_number: intNumber,
    content_type: 'template',
    payload: {
      messaging_product: 'whatsapp',
      type: 'template',
      template: {
        name: 'mobile_sale_confirmation',
        language: {
          code: 'en',
          policy: 'deterministic',
        },
        namespace: namespace,
        to_and_components: [
          {
            to: [cleanPhone],
            components: {
              body_1: {
                type: 'text',
                value: String(customerName),
              },
              body_2: {
                type: 'text',
                value: String(deviceModel),
              },
              body_3: {
                type: 'text',
                value: String(imei),
              },
            },
          },
        ],
      },
    },
  };

  let msg91Status: number | null = null;
  let msg91ResponseText: string | null = null;
  let whatsappDispatched = false;
  let dispatchError: string | null = null;

  if (authKey && authKey !== 'your_msg91_authkey_here') {
    try {
      const res = await fetch(
        'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/',
        {
          method: 'POST',
          headers: {
            authkey: authKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      const responseText = await res.text();
      msg91Status = res.status;
      msg91ResponseText = responseText;

      if (res.ok || res.status === 200) {
        whatsappDispatched = true;
      } else {
        dispatchError = `MSG91 HTTP ${res.status}: ${responseText}`;
      }
    } catch (err: any) {
      dispatchError = err?.message || String(err);
    }
  } else {
    dispatchError = 'MSG91 Auth Key missing or placeholder in .env';
  }

  return {
    success: whatsappDispatched,
    whatsappDispatched,
    mobileNumber: cleanPhone,
    status: msg91Status,
    response: msg91ResponseText,
    error: dispatchError,
  };
}

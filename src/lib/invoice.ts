import PDFDocument from 'pdfkit';
import { uploadToCloudinary } from './upload';
import { prisma } from './prisma';

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

    // Header Title and Logo
    doc.fillColor(darkColor).font('Helvetica-Bold').fontSize(16).text('USED MOBILE PURCHASE RECEIPT', 40, 40);
    doc.fillColor(cyanColor).font('Helvetica-Bold').fontSize(16).text('WEPICK WEDROP', 400, 40, { align: 'right' });
    
    // Sub-header details
    doc.fillColor(cyanColor).font('Helvetica-Bold').fontSize(9).text('DYVOLOOP LOGISTIC PRIVATE LIMITED', 40, 65);
    doc.fillColor(grayColor).font('Helvetica').fontSize(8).text(
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

    const receiptNo = `WWP/PR/25-26/${quote.quoteNumber || quote.id.slice(-6).toUpperCase()}`;
    const dateStr = quote.payoutDetails?.date || (quote.updatedAt ? new Date(quote.updatedAt).toLocaleString('en-IN') : new Date().toLocaleString('en-IN'));

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(grayColor);
    doc.text('RECEIPT NO.', boxX + 6, boxY + 5);
    doc.text('DATE & TIME', boxX + 6, boxY + 22);
    doc.text('PLACE', boxX + 6, boxY + 39);

    doc.font('Helvetica-Bold').fontSize(8).fillColor(cyanColor);
    doc.text(receiptNo, boxX + 76, boxY + 5);
    doc.font('Helvetica').fontSize(7.5).fillColor(darkColor);
    doc.text(dateStr, boxX + 76, boxY + 22);
    doc.text('Delhi, India', boxX + 76, boxY + 39);

    let currentY = 130;

    // Banner draw helper
    function drawSectionBanner(title: string, y: number) {
      doc.fillColor(cyanColor).rect(40, y, 520, 15).fill();
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5).text(title, 46, y + 3.5);
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
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(grayColor).text(labels[0], 46, y + 6);
      doc.font('Helvetica').fontSize(7.5).fillColor(darkColor).text(values[0], 176, y + 6, { width: 110, height: heights - 8 });

      // Col 2 label and value
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(grayColor).text(labels[1], 306, y + 6);
      doc.font('Helvetica').fontSize(7.5).fillColor(darkColor).text(values[1], 436, y + 6, { width: 110, height: heights - 8 });

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
      [quote.contactNumber || 'N/A', 'Verified (Aadhar/PAN)'],
      currentY
    );
    
    // Address block
    doc.strokeColor(lightGray).rect(40, currentY, 520, 20).stroke();
    doc.moveTo(170, currentY).lineTo(170, currentY + 20).stroke();
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(grayColor).text('ADDRESS', 46, currentY + 6);
    doc.font('Helvetica').fontSize(7.5).fillColor(darkColor).text(quote.customerAddress || 'N/A', 176, currentY + 6, { width: 370 });
    currentY += 20;

    // Payment Mode
    doc.strokeColor(lightGray).rect(40, currentY, 520, 20).stroke();
    doc.moveTo(170, currentY).lineTo(170, currentY + 20).stroke();
    doc.moveTo(300, currentY).lineTo(300, currentY + 20).stroke();
    doc.moveTo(430, currentY).lineTo(430, currentY + 20).stroke();

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(grayColor).text('PAYMENT MODE', 46, currentY + 6);
    const methodStr = `${quote.paymentMethod === 'CASH' ? '[x] Cash' : '[ ] Cash'}  ${quote.paymentMethod === 'UPI' ? '[x] UPI' : '[ ] UPI'}  ${quote.paymentMethod === 'BANK' ? '[x] Bank' : '[ ] Bank'}`;
    doc.font('Helvetica').fontSize(7.5).fillColor(darkColor).text(methodStr, 176, currentY + 6);

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(grayColor).text('TXN ID / UTR', 306, currentY + 6);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(cyanColor).text(quote.payoutDetails?.utr || 'CASH_PAYMENT', 436, currentY + 6, { width: 110 });
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
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(grayColor).text('ADDRESS', 46, currentY + 6);
    doc.font('Helvetica').fontSize(7.5).fillColor(darkColor).text('Flat no. 90/25, A1/3A Budh Vihar Phase I, Delhi - 110086', 176, currentY + 6, { width: 370 });
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
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(grayColor).text('DEVICE CONDITION', 46, currentY + 6);
    const condStr = `[x] Working    [ ] Minor Issues    [ ] Damaged    [ ] Dead`;
    doc.font('Helvetica').fontSize(7.5).fillColor(darkColor).text(condStr, 176, currentY + 6);
    currentY += 20;

    // 4. Purchase Details
    currentY += 8;
    currentY = drawSectionBanner('4. PURCHASE DETAILS', currentY);
    doc.strokeColor(lightGray).rect(40, currentY, 520, 22).stroke();
    doc.moveTo(300, currentY).lineTo(300, currentY + 22).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(grayColor).text('AMOUNT PAID TO SELLER / CUSTOMER (₹)', 46, currentY + 7);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(cyanColor).text(`₹ ${quote.finalPrice || quote.estimatedPrice || 0}`, 306, currentY + 6);
    currentY += 22;

    // 5. Seller Declaration
    currentY += 8;
    currentY = drawSectionBanner('5. SELLER DECLARATION', currentY);
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(grayColor).text(
      'I hereby declare that I am the lawful owner / authorised seller of the above mobile device and have the legal right to sell it. The device is not stolen, lost, pledged or subject to any police/court dispute. The IMEI/serial details provided by me are true. I agree to cooperate with WEPICK WEDROP and law-enforcement authorities if any ownership dispute arises.',
      40, currentY, { width: 520, align: 'justify', lineGap: 1.5 }
    );
    currentY += 45;

    // Signature Area
    const sigY = currentY + 20;
    doc.strokeColor(grayColor).lineWidth(0.5).dash(2, { space: 2 }).moveTo(40, sigY).lineTo(240, sigY).stroke();
    doc.strokeColor(grayColor).lineWidth(0.5).moveTo(320, sigY).lineTo(520, sigY).stroke();
    doc.undash();

    doc.font('Helvetica-Bold').fontSize(8).fillColor(grayColor);
    doc.text('SELLER SIGNATURE', 40, sigY + 5, { width: 200, align: 'center' });
    doc.text('WEPICK WEDROP REPRESENTATIVE', 320, sigY + 5, { width: 200, align: 'center' });

    doc.font('Helvetica').fontSize(7.5).fillColor(grayColor);
    doc.text(`Name: ${quote.customerName || ''}`, 40, sigY + 15, { width: 200, align: 'center' });
    doc.text('Authorized Signatory', 320, sigY + 15, { width: 200, align: 'center' });

    // Footer note
    doc.strokeColor(lightGray).lineWidth(1).moveTo(40, 520).lineTo(560, 520).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(grayColor).text(
      'Note: This is a purchase record from the seller. It is not a GST tax invoice.',
      40, 530
    );
    doc.font('Helvetica-Bold').fontSize(8).fillColor(cyanColor).text(
      'THANK YOU FOR CHOOSING WEPICK WEDROP',
      350, 530, { align: 'right' }
    );

    doc.end();
  });
}

/**
 * Generates purchase receipt PDF, uploads to Cloudinary, links to Quote in database,
 * and dispatches outbound template WhatsApp message via MSG91 API.
 */
export async function sendInvoiceWhatsApp(quote: any): Promise<string> {
  const customerPhone = quote.contactNumber || '';
  if (!customerPhone) {
    throw new Error('Customer phone number is missing.');
  }

  // 1. Generate PDF buffer
  const pdfBuffer = await generateInvoicePDF(quote);

  // 2. Upload to Cloudinary
  const uploadRes = await uploadToCloudinary(pdfBuffer, {
    folder: 'invoices',
    public_id: `invoice_${quote.quoteNumber || quote.id}`
  });

  const invoiceUrl = uploadRes.secure_url;

  // Save the URL to the quote database record
  await prisma.quote.update({
    where: { id: quote.id },
    data: { invoicePdf: invoiceUrl }
  });

  // 3. Dispatch WhatsApp via MSG91 Template
  const authKey = process.env.MSG91_AUTH_KEY;
  const intNumber = process.env.MSG91_INTEGRATED_NUMBER;
  const namespace = process.env.MSG91_NAMESPACE || 'e67365fb_e80f_4118_a3da_6701091246fa';

  if (!authKey || !intNumber) {
    console.warn('[MSG91] Auth Key or Integrated Number missing in .env - Skipping WhatsApp dispatch.');
    return invoiceUrl;
  }

  // Normalize phone number (adds 91 prefix if it's 10-digits)
  let mobileNumber = customerPhone.replace(/\D/g, '');
  if (mobileNumber.length === 10) {
    mobileNumber = `91${mobileNumber}`;
  }

  const filename = `Invoice-${quote.quoteNumber || quote.id}.pdf`;
  const customerName = quote.customerName || 'Customer';
  const deviceModel = `${quote.brand || ''} ${quote.model || ''}`.trim() || 'Device';
  const totalAmount = `Rs. ${quote.finalPrice || quote.estimatedPrice || 0}`;

  const payload = {
    integrated_number: intNumber,
    content_type: 'template',
    payload: {
      messaging_product: 'whatsapp',
      type: 'template',
      template: {
        name: 'invoice_sent',
        language: {
          code: 'en',
          policy: 'deterministic'
        },
        namespace: namespace,
        to_and_components: [
          {
            to: [mobileNumber],
            components: {
              header_1: {
                filename: filename,
                type: 'document',
                value: invoiceUrl
              },
              body_1: {
                type: 'text',
                value: customerName
              },
              body_2: {
                type: 'text',
                value: deviceModel
              },
              body_3: {
                type: 'text',
                value: totalAmount
              }
            }
          }
        ]
      }
    }
  };

  console.log('[MSG91] Sending WhatsApp Invoice to:', mobileNumber);

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
    console.log('[MSG91] Payout Invoice WhatsApp Status:', res.status, '| Response:', responseText);
  } catch (err) {
    console.error('[MSG91] WhatsApp Invoice Dispatch Failed:', err);
  }

  return invoiceUrl;
}

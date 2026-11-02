import { z } from 'zod';
import { jsonResponse, getAuthSession, buildPagination } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { PricingService } from '@/services/pricing.service';
import { sendInvoiceWhatsApp, sendMobileSaleConfirmationWhatsApp } from '@/lib/invoice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const calculateSchema = z.object({
  brand: z.string().optional(),
  model: z.string().min(1, 'Model is required'),
  storage: z.string().optional().default('128 GB'),
  condition: z.union([z.string(), z.enum(['excellent', 'good', 'average'])]).optional().default('good').transform((val) => {
    const lower = (val || '').toLowerCase();
    if (lower === 'excellent' || lower === 'average') return lower;
    return 'good';
  }),
  screenCracked: z.boolean().default(false),
  batteryHealth: z.union([z.number(), z.string()]).optional().transform((val) => {
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    return isNaN(num as number) ? 100 : (num as number);
  }),
  cameraIssue: z.boolean().default(false),
  fingerprintIssue: z.boolean().default(false),
  faceIdIssue: z.boolean().default(false),
  bodyDamage: z.boolean().default(false),
  speakerIssue: z.boolean().default(false),
  chargingPortIssue: z.boolean().default(false),
  modelSlug: z.string().optional(),
  launchPrice: z.number().optional(),
});

const createQuoteSchema = calculateSchema.extend({
  images: z.array(z.string()).optional().default([]),
  customerName: z.string().optional(),
  customerAddress: z.string().optional(),
  customerPincode: z.string().optional(),
  contactNumber: z.string().optional(),
  imeiNumber: z.string().optional(),
  imei: z.string().optional(),
  paymentMode: z.string().optional(),
  payoutMethod: z.string().optional(),
  upiId: z.string().optional(),
  bankAccount: z.string().optional(),
  bankIfsc: z.string().optional(),
  bankAccountHolder: z.string().optional(),
  status: z.string().optional(),
  description: z.string().optional(),
  finalPrice: z.number().optional(),
});

function inferBrandFromModel(modelName: string): string {
  if (!modelName) return '';
  const lower = modelName.toLowerCase().trim();
  const clean = lower.replace(/[^a-z0-9]/g, '');

  if (clean.includes('iphone') || clean.includes('apple') || clean.includes('ipad')) return 'Apple';
  if (clean.includes('samsung') || clean.includes('galaxy')) return 'Samsung';
  if (clean.includes('oneplus') || clean.includes('1plus')) return 'OnePlus';
  if (clean.includes('xiaomi') || clean.includes('redmi') || clean.includes('poco') || lower.includes('mi ')) return 'Xiaomi';
  if (clean.includes('vivo') || clean.includes('iqoo') || lower.startsWith('vio') || lower.startsWith('v2')) return 'Vivo';
  if (clean.includes('oppo') || clean.includes('realme')) return 'Oppo';
  if (clean.includes('google') || clean.includes('pixel')) return 'Google';
  if (clean.includes('motorola') || clean.includes('moto')) return 'Motorola';
  if (clean.includes('nothing')) return 'Nothing';
  if (clean.includes('honor') || clean.includes('huawei')) return 'Honor';

  return '';
}

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function POST(req: Request) {
  try {
    let session: any = null;
    try {
      session = await getAuthSession(req);
    } catch (_) {
      // Allow guest / intake
    }

    const body = await req.json();

    // 1. Check if this is a Multi-Device Dealer Quote Intake
    const isDealerOrMultiDevice =
      body.customerType === 'dealer' ||
      (Array.isArray(body.devices) && body.devices.length > 0) ||
      Boolean(body.shopName);

    if (isDealerOrMultiDevice) {
      const devicesList = Array.isArray(body.devices) && body.devices.length > 0
        ? body.devices
        : [
            {
              model: body.model || 'Unknown Handset',
              ram: body.ram || '',
              storage: body.storage || '',
              buyingPrice: body.finalPrice || body.buyingPrice || body.totalAmount || 0,
              accessories: body.accessories || {},
              lockStatus: body.lockStatus || 'Unlocked',
              isPhoneReset: body.isPhoneReset ?? true,
              imei: body.imei || body.imeiNumber || '',
              photos6Sides: body.photos6Sides || {},
              ceirScreenshot: body.ceirScreenshot || null,
              problems: body.problems || '',
            },
          ];

      const customerName = body.customerName || body.dealerName || 'Valued Dealer';
      const shopName = body.shopName || body.storeName || 'N/A';
      const contactNumber = body.contactNumber || body.dealerPhone || body.customerPhone || body.phone || '';
      const customerAddress = body.customerAddress || body.address || '';

      const totalCalculated = devicesList.reduce((sum: number, d: any) => {
        const p = typeof d.buyingPrice === 'number' ? d.buyingPrice : parseFloat(d.buyingPrice || 0);
        return sum + (isNaN(p) ? 0 : p);
      }, 0);

      const finalAmount = body.totalAmount || body.finalPrice || (totalCalculated > 0 ? totalCalculated : 0);

      const allImages: string[] = [];
      if (body.idProofFront) allImages.push(body.idProofFront);
      if (body.idProofBack) allImages.push(body.idProofBack);

      devicesList.forEach((d: any) => {
        if (d.photos6Sides) {
          Object.values(d.photos6Sides).forEach((val) => {
            if (typeof val === 'string' && val.trim()) allImages.push(val.trim());
          });
        }
        if (Array.isArray(d.photos)) {
          d.photos.forEach((p: any) => {
            if (typeof p === 'string' && p.trim()) allImages.push(p.trim());
          });
        }
        if (d.ceirScreenshot) allImages.push(d.ceirScreenshot);
        const acc = d.accessories || {};
        if (d.billPhoto || acc.billPhoto) allImages.push(d.billPhoto || acc.billPhoto);
        if (d.boxPhoto || acc.boxPhoto) allImages.push(d.boxPhoto || acc.boxPhoto);
        if (d.chargerPhoto || acc.chargerPhoto) allImages.push(d.chargerPhoto || acc.chargerPhoto);
      });

      const isAgent = session?.role === 'AGENT' || session?.role === 'DELIVERY_PARTNER' || session?.role === 'DELIVERY_AGENT' || session?.role === 'SUPER_ADMIN';
      const assignedAgentId = body.agentId || (isAgent ? session?.id : undefined);
      const assignedAgentName = body.agentName || body.assignedAgentName || body.createdByAgent || session?.name || session?.username || '';
      const isObjectId = assignedAgentId && /^[0-9a-fA-F]{24}$/.test(String(assignedAgentId));
      const agentSnippet = assignedAgentName ? ` | Agent: ${assignedAgentName}` : '';

      // --- Robust Customer / User ID Resolution ---
      let resolvedUserId: string | undefined = undefined;

      // 1. Explicit userId or customerId from request body
      const rawCandidateId = body.customerId || body.userId || body.customer?.id || body.customer?._id || body.customer?.userId;
      if (rawCandidateId && typeof rawCandidateId === 'string' && /^[0-9a-fA-F]{24}$/.test(rawCandidateId)) {
        resolvedUserId = rawCandidateId;
      }

      // 2. If called by a regular customer/business directly, use their session id
      if (!resolvedUserId && !isAgent && session?.id && /^[0-9a-fA-F]{24}$/.test(String(session.id))) {
        resolvedUserId = String(session.id);
      }

      // 3. If intake performed by an Agent or user not yet found, look up user by phone number
      const phoneToMatch = contactNumber || body.customerPhone || body.contactNumber || body.phone || body.dealerPhone || '';
      const clean10 = String(phoneToMatch).replace(/\D/g, '').slice(-10);

      if ((!resolvedUserId || isAgent) && clean10.length === 10) {
        const phoneVariants = [
          clean10,
          `+91${clean10}`,
          `91${clean10}`,
          `0${clean10}`,
        ];

        // 3a. Check User table
        const existingUser = await prisma.user.findFirst({
          where: {
            OR: [
              { phone: { in: phoneVariants } },
              { phone: { endsWith: clean10 } },
            ],
          },
          select: { id: true },
        });

        if (existingUser?.id) {
          resolvedUserId = existingUser.id;
        } else {
          // 3b. Check Business table (if dealer mode)
          const existingBiz = await prisma.business.findFirst({
            where: {
              OR: [
                { contactNumber: { in: phoneVariants } },
                { contactNumber: { endsWith: clean10 } },
              ],
            },
            select: { id: true },
          });
          if (existingBiz?.id) {
            resolvedUserId = existingBiz.id;
          }
        }

        // 3c. If still not found and created by Agent, auto-create User record so customer will find their quotes upon login
        if (!resolvedUserId && isAgent) {
          try {
            const newUser = await prisma.user.create({
              data: {
                phone: clean10,
                username: customerName || body.ownerName || 'Customer',
                role: body.customerType === 'dealer' ? 'BUSINESS' : 'USER',
                address: customerAddress || undefined,
              },
              select: { id: true },
            });
            if (newUser?.id) {
              resolvedUserId = newUser.id;
            }
          } catch (autoErr) {
            console.warn('Auto create user during intake note:', autoErr);
          }
        }
      }

      const timestampStr = Date.now().toString().slice(-6);
      const batchRef = `BATCH-${timestampStr}`;

      const isDealer =
        body.customerType === 'dealer' ||
        (Boolean(body.shopName) && body.shopName.trim() !== 'N/A' && body.shopName.trim().length > 0);
      const prefix = isDealer ? 'DLR' : 'CUST';
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const batchQuoteNumber = `${prefix}-${timestampStr}-${randomSuffix}`;

      // Build enriched itemized devices list
      const allBatchImages: string[] = [];
      const formattedDevices = devicesList.map((d: any, idx: number) => {
        const devModel = (d.model || d.phoneModel || 'Unknown Handset').trim();
        const rawBrand = (d.brand && String(d.brand).toLowerCase() !== 'other') ? d.brand : '';
        const devBrand = rawBrand || inferBrandFromModel(devModel);
        const devStorage = d.storage || '128 GB';
        const devRam = d.ram || '';

        const devPrice = typeof d.buyingPrice === 'number'
          ? d.buyingPrice
          : parseFloat(d.buyingPrice || 0) || Math.round(finalAmount / devicesList.length);

        const devCustomer = d.customer || {};
        const devCustomerName = (devCustomer.name || d.customerName || d.deviceCustomerName || customerName || 'Valued Customer').trim();
        const devContactNumber = (devCustomer.phone || d.customerPhone || d.deviceCustomerMobile || contactNumber || '').trim();
        const devCustomerAddress = (devCustomer.address || d.customerAddress || d.deviceCustomerAddress || customerAddress || '').trim();

        const devImei = (d.isPhoneDead || d.isDead) ? 'N/A' : (d.imei || d.imeiNumber || 'N/A').trim();
        const itemOrderId = `${batchQuoteNumber}/${idx + 1}`;

        // Collect device specific images
        const devImages: string[] = [];
        const devIdFront = d.idProofFront || devCustomer.idFront || body.idProofFront;
        const devIdBack = d.idProofBack || devCustomer.idBack || body.idProofBack;

        if (d.photos6Sides) {
          Object.values(d.photos6Sides).forEach((val) => {
            if (typeof val === 'string' && val.trim()) {
              devImages.push(val.trim());
              allBatchImages.push(val.trim());
            }
          });
        }
        if (Array.isArray(d.photos)) {
          d.photos.forEach((p: any) => {
            if (typeof p === 'string' && p.trim()) {
              devImages.push(p.trim());
              allBatchImages.push(p.trim());
            }
          });
        }
        if (d.ceirScreenshot) {
          devImages.push(d.ceirScreenshot);
          allBatchImages.push(d.ceirScreenshot);
        }
        const devAcc = d.accessories || {};
        if (d.billPhoto || devAcc.billPhoto) {
          const bp = d.billPhoto || devAcc.billPhoto;
          devImages.push(bp);
          allBatchImages.push(bp);
        }
        if (d.boxPhoto || devAcc.boxPhoto) {
          const bx = d.boxPhoto || devAcc.boxPhoto;
          devImages.push(bx);
          allBatchImages.push(bx);
        }
        if (d.chargerPhoto || devAcc.chargerPhoto) {
          const cp = d.chargerPhoto || devAcc.chargerPhoto;
          devImages.push(cp);
          allBatchImages.push(cp);
        }

        return {
          ...d,
          id: itemOrderId,
          orderId: itemOrderId,
          itemNumber: idx + 1,
          brand: devBrand,
          model: devModel,
          storage: devStorage,
          ram: devRam,
          imei: devImei,
          imeiNumber: devImei,
          buyingPrice: devPrice,
          calculatedBuyingPrice: devPrice,
          price: devPrice,
          condition: d.condition || (isDealer ? 'dealer_inspected' : 'customer_inspected'),
          isPhoneDead: Boolean(d.isPhoneDead || d.isDead),
          isDead: Boolean(d.isPhoneDead || d.isDead),
          images: Array.from(new Set(devImages.filter(Boolean))),
          customer: {
            ...devCustomer,
            name: devCustomerName,
            phone: devContactNumber,
            address: devCustomerAddress,
            idType: devCustomer.idType || d.idProofType || 'Aadhaar Card',
            idNumber: devCustomer.idNumber || d.idProofNumber || 'N/A',
            idFront: devIdFront || null,
            idBack: devIdBack || null,
          },
          customerName: devCustomerName,
          customerPhone: devContactNumber,
          customerAddress: devCustomerAddress,
        };
      });

      // Filter batch images to exclude KYC ID cards
      if (allBatchImages.length === 0 && Array.isArray(body.images)) {
        body.images.forEach((img: any) => {
          if (typeof img === 'string' && img !== body.idProofFront && img !== body.idProofBack) {
            allBatchImages.push(img);
          }
        });
      }
      const uniqueBatchImages = Array.from(new Set(allBatchImages.filter(Boolean)));

      // Primary brand and model summary
      const uniqueBrands = Array.from(new Set(formattedDevices.map((d: any) => d.brand).filter(Boolean)));
      const primaryBrand = uniqueBrands.length === 1 ? uniqueBrands[0] : (uniqueBrands.length > 1 ? 'Multi-Brand' : 'Device');
      const modelSummary = formattedDevices.length === 1
        ? formattedDevices[0].model
        : `${formattedDevices.length} Devices (${formattedDevices.map((d: any) => `${d.brand ? d.brand + ' ' : ''}${d.model}`).slice(0, 3).join(', ')}${formattedDevices.length > 3 ? '...' : ''})`;

      const primaryStorage = formattedDevices.length === 1
        ? formattedDevices[0].storage
        : `${formattedDevices.length} Devices (${formattedDevices.map((d: any) => d.storage).filter(Boolean).slice(0, 3).join(', ')})`;

      const primaryRam = formattedDevices.length === 1 ? formattedDevices[0].ram : '';
      const primaryImei = formattedDevices.length === 1 ? formattedDevices[0].imei : formattedDevices.map((d: any) => d.imei).filter((im: string) => im && im !== 'N/A').join(', ') || 'Batch Multi-IMEI';

      const devDescription = isDealer
        ? (shopName !== 'N/A'
            ? `Shop: ${shopName} | Batch Intake [${formattedDevices.length} Devices: ₹${Number(finalAmount).toLocaleString('en-IN')}]${agentSnippet}`
            : `Dealer Intake [${formattedDevices.length} Devices: ₹${Number(finalAmount).toLocaleString('en-IN')}]${agentSnippet}`)
        : `Customer Sell Intake [${formattedDevices.length} Devices: ₹${Number(finalAmount).toLocaleString('en-IN')}]${agentSnippet}`;

      const rawStatus = String(body.status || body.quoteStatus || '').toLowerCase();
      const isCustomerMarked = Boolean(
        rawStatus === 'paid' ||
        rawStatus === 'payment_completed' ||
        body.paymentStatus === 'PAID' ||
        body.payoutStatus === 'COMPLETED' ||
        ((body.customerId || body.userId || resolvedUserId) && (body.customerType === 'customer' || !isDealer))
      );

      let quoteStatus = 'PICKUP_SUCCESSFUL';
      if (isCustomerMarked || rawStatus === 'paid' || rawStatus === 'payment_completed') {
        quoteStatus = 'payment_completed';
      } else if (body.status) {
        quoteStatus = String(body.status).toUpperCase() === 'PICKUP_SUCCESSFUL' ? 'PICKUP_SUCCESSFUL' : String(body.status).toLowerCase();
      }

      // CREATE EXACTLY ONE QUOTE RECORD FOR THE ENTIRE ORDER BATCH
      const quote = await prisma.quote.create({
        data: {
          quoteNumber: batchQuoteNumber,
          userId: resolvedUserId || undefined,
          agentId: isObjectId ? String(assignedAgentId) : undefined,
          brand: primaryBrand,
          model: modelSummary,
          storage: primaryStorage,
          ram: primaryRam,
          condition: isDealer ? 'dealer_inspected' : 'customer_inspected',
          estimatedPrice: finalAmount,
          finalPrice: finalAmount,
          status: quoteStatus,
          payoutDetails: (quoteStatus === 'payment_completed' || rawStatus === 'paid')
            ? (body.payoutDetails || {
                status: 'PAID',
                date: new Date().toISOString(),
                amount: finalAmount,
                paymentMethod: body.paymentMode || body.paymentMethod || 'CASH',
              })
            : (body.payoutDetails || null),
          isDead: formattedDevices.every((d: any) => d.isPhoneDead),
          isPhoneDead: formattedDevices.every((d: any) => d.isPhoneDead),
          diagnosisCompleted: true,
          images: uniqueBatchImages,
          customerName: customerName || formattedDevices[0]?.customerName || 'Valued Customer',
          ownerName: (body.ownerName?.trim() || (isDealer ? (body.dealerName?.trim() || shopName) : customerName) || '').trim(),
          dealerName: isDealer ? (body.dealerName?.trim() || shopName || 'Registered Dealer') : null,
          shopName: isDealer ? shopName : null,
          customerAddress: customerAddress || formattedDevices[0]?.customerAddress || '',
          customerPincode: body.customerPincode || '',
          contactNumber: contactNumber || body.customerPhone || formattedDevices[0]?.customerPhone || '',
          imeiNumber: primaryImei,
          imei: primaryImei,
          paymentMode: body.paymentMode || body.payoutMethod || 'CASH',
          paymentMethod: body.paymentMethod || body.paymentMode || 'CASH',
          description: devDescription,
          breakdown: {
            customerType: isDealer ? 'dealer' : 'customer',
            shopName: isDealer ? shopName : 'N/A',
            ownerName: (body.ownerName?.trim() || (isDealer ? (body.dealerName?.trim() || shopName) : customerName) || '').trim(),
            dealerName: isDealer ? (body.dealerName?.trim() || shopName || 'Registered Dealer') : null,
            dealerPhone: isDealer ? (body.dealerPhone || contactNumber) : null,
            customerName: customerName || formattedDevices[0]?.customerName || 'Customer',
            customerPhone: contactNumber || formattedDevices[0]?.customerPhone || '',
            customerAddress: customerAddress || formattedDevices[0]?.customerAddress || '',
            agentName: assignedAgentName || null,
            agentId: assignedAgentId || null,
            batchReference: batchRef,
            totalDevicesInBatch: formattedDevices.length,
            totalBatchAmount: finalAmount,
            devices: formattedDevices,
          } as any,
          conditionAnswers: {
            customerType: isDealer ? 'dealer' : 'customer',
            shopName: isDealer ? shopName : 'N/A',
            ownerName: (body.ownerName?.trim() || (isDealer ? (body.dealerName?.trim() || shopName) : customerName) || '').trim(),
            dealerName: isDealer ? (body.dealerName?.trim() || shopName || 'Registered Dealer') : null,
            dealerPhone: isDealer ? (body.dealerPhone || contactNumber) : null,
            customerName: customerName || formattedDevices[0]?.customerName || 'Customer',
            customerPhone: contactNumber || formattedDevices[0]?.customerPhone || '',
            customerAddress: customerAddress || formattedDevices[0]?.customerAddress || '',
            agentName: assignedAgentName || null,
            agentId: assignedAgentId || null,
            idProofType: body.idProofType || 'Aadhaar Card',
            idProofNumber: body.idProofNumber || 'N/A',
            idProofFront: body.idProofFront || null,
            idProofBack: body.idProofBack || null,
            devices: formattedDevices,
          } as any,
        },
      });

      // 1. WhatsApp Dispatch: Combined Batch Receipt PDF to Dealer / Partner
      try {
        const targetDealerPhone = body.dealerPhone || (isDealer ? (contactNumber || body.customerPhone) : null);
        if (targetDealerPhone) {
          sendInvoiceWhatsApp({
            ...quote,
            contactNumber: targetDealerPhone,
            phone: targetDealerPhone,
            devices: formattedDevices,
            finalPrice: finalAmount,
            totalAmount: finalAmount,
            forceDispatch: true,
          }).then((res: any) => {
            console.log(`✅ [Backend Auto-Dispatch] Dealer Invoice sent to ${targetDealerPhone}:`, res?.whatsappDispatched || res?.success);
          }).catch((err: any) => {
            console.warn(`⚠️ [Backend Auto-Dispatch] Dealer Invoice error:`, err?.message);
          });
        }
      } catch (dealerErr) {
        console.warn('⚠️ [Backend Auto-Dispatch] Dealer Invoice exception:', dealerErr);
      }

      // 2. WhatsApp Dispatch: Individual Sale Confirmation to Each Customer
      try {
        formattedDevices.forEach((dev: any, devIdx: number) => {
          const targetCustPhone = dev.customerPhone || dev.customer?.phone || contactNumber;
          const targetCustName = dev.customerName || dev.customer?.name || 'Valued Customer';
          const targetModel = `${dev.brand ? dev.brand + ' ' : ''}${dev.model}`.trim() || 'Handset';
          const targetImei = dev.imei && dev.imei !== 'N/A' ? dev.imei : 'Verified Checks Passed';

          if (targetCustPhone) {
            sendMobileSaleConfirmationWhatsApp({
              phone: targetCustPhone,
              customerName: targetCustName,
              deviceModel: targetModel,
              imei: targetImei,
            }).then((res: any) => {
              console.log(`✅ [Backend Auto-Dispatch] sale_confirmation sent to Device #${devIdx + 1} customer (${targetCustPhone}):`, res.success);
            }).catch((err: any) => {
              console.warn(`⚠️ [Backend Auto-Dispatch] sale_confirmation error for Device #${devIdx + 1}:`, err?.message);
            });
          }
        });
      } catch (custErr) {
        console.warn('⚠️ [Backend Auto-Dispatch] Customer dispatch loop exception:', custErr);
      }

      return jsonResponse({
        success: true,
        message: `Intake order created successfully with ${formattedDevices.length} device(s)`,
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        quote: quote,
        quotes: [quote],
        totalCreated: 1,
        totalDevices: formattedDevices.length,
      }, 201);
    }

    // 2. Standard Single-Device Consumer Quote Flow (Validates with createQuoteSchema)
    const parseResult = createQuoteSchema.safeParse(body);
    const parsedData = parseResult.success ? parseResult.data : body;

    const rawBrand = (parsedData.brand && String(parsedData.brand).toLowerCase() !== 'other') ? parsedData.brand : '';
    const brand = rawBrand || inferBrandFromModel(parsedData.model || '');
    const model = parsedData.model || 'Unknown Phone';
    const storage = parsedData.storage || '128 GB';
    const finalPrice = typeof parsedData.finalPrice === 'number'
      ? parsedData.finalPrice
      : parseFloat(parsedData.finalPrice || body.estimatedPrice || 0);

    let calculatedEstPrice = finalPrice || 1000;
    try {
      const calculation = await PricingService.calculateQuote({
        brand,
        model,
        storage,
        condition: parsedData.condition || 'good',
        screenCracked: Boolean(parsedData.screenCracked),
        batteryHealth: typeof parsedData.batteryHealth === 'number' ? parsedData.batteryHealth : 100,
        cameraIssue: Boolean(parsedData.cameraIssue),
        fingerprintIssue: Boolean(parsedData.fingerprintIssue),
        faceIdIssue: Boolean(parsedData.faceIdIssue),
        bodyDamage: Boolean(parsedData.bodyDamage),
        speakerIssue: Boolean(parsedData.speakerIssue),
        chargingPortIssue: Boolean(parsedData.chargingPortIssue),
      } as any);
      if (calculation && calculation.estimatedPrice > 0) {
        calculatedEstPrice = calculation.estimatedPrice;
      }
    } catch (_) {
      console.warn('PricingService fallback for single device creation:', model);
    }

    const timestampStr = Date.now().toString().slice(-6);
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const quoteNumber = `CUST-${timestampStr}-${randomSuffix}`;
    const imeiVal = parsedData.imeiNumber || parsedData.imei;

    // Resolve userId for single quote
    let singleUserId: string | undefined = undefined;
    const rawSingleId = parsedData.customerId || parsedData.userId || body.customerId || body.userId;
    if (rawSingleId && typeof rawSingleId === 'string' && /^[0-9a-fA-F]{24}$/.test(rawSingleId)) {
      singleUserId = rawSingleId;
    }
    const isSingleAgent = session?.role === 'AGENT' || session?.role === 'DELIVERY_PARTNER' || session?.role === 'DELIVERY_AGENT' || session?.role === 'SUPER_ADMIN';
    if (!singleUserId && !isSingleAgent && session?.id && /^[0-9a-fA-F]{24}$/.test(String(session.id))) {
      singleUserId = String(session.id);
    }
    const singleContact = parsedData.contactNumber || body.customerPhone || body.phone || '';
    const singleClean10 = String(singleContact).replace(/\D/g, '').slice(-10);
    if ((!singleUserId || isSingleAgent) && singleClean10.length === 10) {
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { phone: { in: [singleClean10, `+91${singleClean10}`, `91${singleClean10}`, `0${singleClean10}`] } },
            { phone: { endsWith: singleClean10 } },
          ],
        },
        select: { id: true },
      });
      if (existingUser?.id) {
        singleUserId = existingUser.id;
      }
    }

    const quote = await prisma.quote.create({
      data: {
        quoteNumber,
        userId: singleUserId || undefined,
        brand,
        model,
        storage,
        condition: parsedData.condition || 'good',
        screenCracked: Boolean(parsedData.screenCracked),
        batteryHealth: typeof parsedData.batteryHealth === 'number' ? parsedData.batteryHealth : 100,
        cameraIssue: Boolean(parsedData.cameraIssue),
        fingerprintIssue: Boolean(parsedData.fingerprintIssue),
        faceIdIssue: Boolean(parsedData.faceIdIssue),
        bodyDamage: Boolean(parsedData.bodyDamage),
        speakerIssue: Boolean(parsedData.speakerIssue),
        chargingPortIssue: Boolean(parsedData.chargingPortIssue),
        estimatedPrice: calculatedEstPrice,
        finalPrice: finalPrice || calculatedEstPrice,
        status: parsedData.status || (parsedData.customerName ? 'booked' : 'submitted'),
        images: Array.isArray(parsedData.images)
          ? parsedData.images.filter((img: any) => typeof img === 'string' && img.trim().length > 0)
          : [],
        customerName: parsedData.customerName,
        customerAddress: parsedData.customerAddress,
        customerPincode: parsedData.customerPincode,
        contactNumber: parsedData.contactNumber || body.customerPhone || body.phone,
        imeiNumber: imeiVal || undefined,
        imei: imeiVal || undefined,
        paymentMode: parsedData.paymentMode || parsedData.payoutMethod,
        payoutMethod: parsedData.payoutMethod || parsedData.paymentMode,
        upiId: parsedData.upiId,
        bankAccount: parsedData.bankAccount,
        bankIfsc: parsedData.bankIfsc,
        bankAccountHolder: parsedData.bankAccountHolder,
        description: parsedData.description,
        isDead: body.isDead !== undefined ? Boolean(body.isDead) : (body.isPhoneDead !== undefined ? Boolean(body.isPhoneDead) : undefined),
        isPhoneDead: body.isPhoneDead !== undefined ? Boolean(body.isPhoneDead) : (body.isDead !== undefined ? Boolean(body.isDead) : undefined),
        diagnosisCompleted: Boolean(body.isDead || body.isPhoneDead || body.diagnosisCompleted),
      },
    });

    return jsonResponse({
      success: true,
      message: 'Quote created successfully',
      quoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      quote,
    }, 201);
  } catch (err: any) {
    console.error('Create Quote API Error:', err);
    return jsonResponse(
      { error: err.message || 'Internal server error while creating quote' },
      500
    );
  }
}

export async function GET(req: Request) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.id) {
      return jsonResponse({ error: 'Unauthorized: Authentication required' }, 401);
    }

    const { page, limit, skip } = buildPagination(req.url);

    const query: any = {
      userId: session.id,
      status: {
        in: [
          'booked',
          'scheduled',
          'delayed_pickup',
          'pickup_delayed',
          'ordered',
          'requested',
          'accepted',
          'pickup_scheduled',
          'pickup_successful',
          'payment_processing',
          'payment_completed',
          'cancelled',
          'rejected',
          'pending',
          'submitted',
        ],
      },
    };

    const total = await prisma.quote.count({ where: query });
    const quotes = await prisma.quote.findMany({
      where: query,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    return jsonResponse({
      success: true,
      quotes,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Fetch User Quote History Error:', err);
    return jsonResponse(
      { error: err.message || 'Internal server error while fetching quote history' },
      500
    );
  }
}
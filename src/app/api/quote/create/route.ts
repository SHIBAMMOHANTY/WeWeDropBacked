import { z } from 'zod';
import { jsonResponse, getAuthSession, buildPagination } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { PricingService } from '@/services/pricing.service';

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

      const isAgent = session?.role === 'AGENT' || session?.role === 'DELIVERY_PARTNER' || session?.role === 'DELIVERY_AGENT';
      const assignedAgentId = body.agentId || (isAgent ? session?.id : undefined);
      const assignedAgentName = body.agentName || body.assignedAgentName || body.createdByAgent || session?.name || session?.username || '';
      const isObjectId = assignedAgentId && /^[0-9a-fA-F]{24}$/.test(String(assignedAgentId));
      const agentSnippet = assignedAgentName ? ` | Agent: ${assignedAgentName}` : '';

      const timestampStr = Date.now().toString().slice(-6);
      const batchRef = `BATCH-${timestampStr}`;

      const createdQuotes: any[] = [];

      for (let i = 0; i < devicesList.length; i++) {
        const d = devicesList[i];

        const devModel = d.model || 'Unknown Handset';
        const rawBrand = (d.brand && String(d.brand).toLowerCase() !== 'other') ? d.brand : '';
        const devBrand = rawBrand || inferBrandFromModel(devModel);
        const devStorage = d.storage || '128 GB';
        const devRam = d.ram || '';

        const devPrice = typeof d.buyingPrice === 'number'
          ? d.buyingPrice
          : parseFloat(d.buyingPrice || 0) || Math.round(finalAmount / devicesList.length);

        const devCustomer = d.customer || {};
        const devCustomerName = devCustomer.name || d.customerName || customerName;
        const devContactNumber = devCustomer.phone || d.customerPhone || contactNumber;
        const devCustomerAddress = devCustomer.address || d.customerAddress || customerAddress;

        // Collect device specific images (EXCLUDING KYC ID cards)
        const devImages: string[] = [];
        const devIdFront = d.idProofFront || devCustomer.idFront || body.idProofFront;
        const devIdBack = d.idProofBack || devCustomer.idBack || body.idProofBack;

        if (d.photos6Sides) {
          Object.values(d.photos6Sides).forEach((val) => {
            if (typeof val === 'string' && val.trim()) devImages.push(val.trim());
          });
        }
        if (Array.isArray(d.photos)) {
          d.photos.forEach((p: any) => {
            if (typeof p === 'string' && p.trim()) devImages.push(p.trim());
          });
        }
        if (d.ceirScreenshot) devImages.push(d.ceirScreenshot);
        const devAcc = d.accessories || {};
        if (d.billPhoto || devAcc.billPhoto) devImages.push(d.billPhoto || devAcc.billPhoto);
        if (d.boxPhoto || devAcc.boxPhoto) devImages.push(d.boxPhoto || devAcc.boxPhoto);
        if (d.chargerPhoto || devAcc.chargerPhoto) devImages.push(d.chargerPhoto || devAcc.chargerPhoto);

        // If no device specific images, fallback to body images (filtered to exclude ID proofs)
        if (devImages.length === 0 && Array.isArray(body.images)) {
          body.images.forEach((img: any) => {
            if (typeof img === 'string' && img !== devIdFront && img !== devIdBack) {
              devImages.push(img);
            }
          });
        }

        const uniqueDevImages = Array.from(new Set(devImages.filter(Boolean)));

        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const devQuoteNumber = devicesList.length > 1
          ? `DLR-${timestampStr}-${randomSuffix}-${i + 1}`
          : `DLR-${timestampStr}-${randomSuffix}`;

        const isDeadPhone = Boolean(d.isPhoneDead || d.isDead || body.isPhoneDead || body.isDead);

        const devDescription = shopName !== 'N/A'
          ? `Shop: ${shopName} | Dealer Intake [${i + 1}/${devicesList.length}: ${devBrand} ${devModel}]${agentSnippet}`
          : `Dealer Intake [${i + 1}/${devicesList.length}: ${devBrand} ${devModel}]${agentSnippet}`;

        const quote = await prisma.quote.create({
          data: {
            quoteNumber: devQuoteNumber,
            userId: session?.id || undefined,
            agentId: isObjectId ? String(assignedAgentId) : undefined,
            brand: devBrand,
            model: devModel,
            storage: devStorage,
            ram: devRam,
            condition: 'dealer_inspected',
            estimatedPrice: devPrice,
            finalPrice: devPrice,
            status: body.status
              ? (String(body.status).toUpperCase() === 'PICKUP_SUCCESSFUL' ? 'PICKUP_SUCCESSFUL' : String(body.status).toLowerCase())
              : 'PICKUP_SUCCESSFUL',
            isDead: isDeadPhone,
            isPhoneDead: isDeadPhone,
            diagnosisCompleted: isDeadPhone ? true : false,
            images: uniqueDevImages,
            customerName: devCustomerName,
            customerAddress: devCustomerAddress,
            customerPincode: body.customerPincode || '',
            contactNumber: devContactNumber,
            imeiNumber: isDeadPhone ? undefined : (d.imei || d.imeiNumber || undefined),
            imei: isDeadPhone ? undefined : (d.imei || d.imeiNumber || undefined),
            paymentMode: body.paymentMode || body.payoutMethod || 'CASH',
            payoutMethod: body.payoutMethod || body.paymentMode || 'CASH',
            description: devDescription,
            breakdown: {
              customerType: 'dealer',
              shopName,
              dealerName: customerName,
              agentName: assignedAgentName || null,
              agentId: assignedAgentId || null,
              batchReference: batchRef,
              deviceIndex: i + 1,
              totalDevicesInBatch: devicesList.length,
              totalBatchAmount: finalAmount,
              deviceData: d,
              devices: [d],
            } as any,
            conditionAnswers: {
              customerType: 'dealer',
              shopName,
              dealerName: customerName,
              agentName: assignedAgentName || null,
              agentId: assignedAgentId || null,
              idProofType: d.idProofType || devCustomer.idType || body.idProofType || 'Aadhaar Card',
              idProofNumber: d.idProofNumber || devCustomer.idNumber || body.idProofNumber || 'N/A',
              idProofFront: devIdFront || null,
              idProofBack: devIdBack || null,
              deviceData: d,
              devices: [d],
            } as any,
          },
        });

        createdQuotes.push(quote);
      }

      const primaryQuote = createdQuotes[0];

      return jsonResponse({
        success: true,
        message: `Dealer intake: ${createdQuotes.length} individual device quote(s) created successfully`,
        quoteId: primaryQuote.id,
        quoteNumber: primaryQuote.quoteNumber,
        quote: primaryQuote,
        quotes: createdQuotes,
        totalCreated: createdQuotes.length,
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

    const quote = await prisma.quote.create({
      data: {
        quoteNumber,
        userId: session?.id || undefined,
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
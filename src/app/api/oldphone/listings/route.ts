import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, buildPagination, createNotification, getAuthSession, jsonResponse, parseBoolean } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const listingCreateSchema = z.object({
  phoneName: z.string().min(1),
  phoneModel: z.string().min(1),
  phoneStorage: z.string().min(1),
  phoneColor: z.string().min(1),
  phoneRam: z.string().nullable().optional(),
  mobileRepaired: z.boolean().nullable().optional(),
  phonePrice: z.number().positive(),
  mrpPrice: z.number().positive().nullable().optional(),
  description: z.string().nullable().optional(),
  imeiNumber: z.string().nullable().optional(),
  phoneOn: z.boolean().nullable().optional(),
  displayWorking: z.boolean().nullable().optional(),
  displayGlassDamage: z.boolean().nullable().optional(),
  bodyCondition: z.enum(["GOOD", "AVERAGE", "BAD"]).nullable().optional(),
  simSlotsWorking: z.boolean().nullable().optional(),
  volumeButtonsWorking: z.boolean().nullable().optional(),
  fingerprintWorking: z.boolean().nullable().optional(),
  cameraWorking: z.boolean().nullable().optional(),
  speakerWorking: z.boolean().nullable().optional(),
  financeKitAvailable: z.boolean().nullable().optional(),
  accessories: z.array(z.string()).nullable().optional(),
  warranty: z.boolean().nullable().optional(),
  warrantyType: z.string().nullable().optional(),
  specifications: z.any().nullable().optional(),
  images: z.array(z.string()).nullable().optional(),
  billImage: z.string().nullable().optional(),
  purchaseDate: z.string().nullable().optional(),
  gift: z.string().nullable().optional(),
  exactPrice: z.number().positive().nullable().optional(),
  isActive: z.boolean().nullable().optional(),
});

export async function OPTIONS() {
  return jsonResponse({}, 204);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: Record<string, unknown> = {};

    const isActiveParam = url.searchParams.get("isActive");
    const isActive = parseBoolean(isActiveParam);
    if (typeof isActive === "boolean") {
      filters.isActive = isActive;
    }

    const isSoldParam = url.searchParams.get("isSold");
    const isSold = parseBoolean(isSoldParam);
    if (typeof isSold === "boolean") {
      filters.isSold = isSold;
    }

    const includeSold = parseBoolean(url.searchParams.get("includeSold"));
    const myListingsOnly = parseBoolean(url.searchParams.get("myListings")) || parseBoolean(url.searchParams.get("my"));

    let session: any = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        session = await getAuthSession(req);
      } catch (e) {
        // Ignore auth error for public listings browsing
      }
    }

    const userId = url.searchParams.get("userId");
    const businessId = url.searchParams.get("businessId");

    if (myListingsOnly && session) {
      if (session.role === "BUSINESS") {
        filters.businessId = session.id;
      } else if (session.role === "SUPER_ADMIN") {
        // admin sees all
      } else {
        filters.userId = session.id;
      }
    } else {
      if (userId) filters.userId = userId;
      if (businessId) filters.businessId = businessId;
    }

    // Default to active listings if not specified and not querying own/all
    if (filters.isActive === undefined && !includeSold && !myListingsOnly && !userId && !businessId) {
      filters.isActive = true;
    }

    const { page, limit, skip } = buildPagination(req.url);
    const [total, listings] = await Promise.all([
      prisma.oldPhoneListing.count({ where: filters }),
      prisma.oldPhoneListing.findMany({
        where: filters,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { 
          orders: {
            select: {
              id: true,
              orderId: true,
              deliveryStatus: true,
              createdAt: true,
            }
          },
          user: { select: { id: true, phone: true, username: true, email: true, role: true } },
          business: { select: { id: true, email: true, dealerName: true, contactNumber: true } }
        }
      }),
    ]);

    const formattedListings = listings.map((listing: any) => {
      let businessName = listing.businessId;
      if (listing.business?.dealerName) {
        businessName = listing.business.dealerName;
      } else if (listing.user && listing.businessId === listing.user.id) {
        businessName = listing.user.username || listing.user.phone;
      } else if (listing.user) {
        businessName = listing.user.username || listing.user.phone;
      }

      return {
        ...listing,
        businessId: businessName,
      };
    });

    return jsonResponse({ success: true, data: formattedListings, message: "Listings retrieved successfully", meta: { page, limit, total } });
  } catch (error: any) {
    console.error("[GET /api/oldphone/listings Error]:", error);
    if (error instanceof ApiError) {
      return jsonResponse({ success: false, error: error.message }, error.status);
    }
    return jsonResponse({ success: false, error: error?.message || "Server error" }, 500);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAuthSession(req);
    if (!['USER', 'BUSINESS', 'SELLING_TEAM', 'SUPER_ADMIN', 'DELIVERY_AGENT', 'REFURBISH_TEAM'].includes(session.role)) {
      throw new ApiError('Only authenticated users or businesses can create listings', 403);
    }
    const body = await req.json();
    const payload = listingCreateSchema.parse(body);

        // Prevent duplicate listing with identical active IMEI
    if (payload.imeiNumber && typeof payload.imeiNumber === 'string') {
      const cleanImei = payload.imeiNumber.trim();
      if (cleanImei && cleanImei.toUpperCase() !== 'N/A' && cleanImei.length >= 8) {
        const existingActiveListing = await prisma.oldPhoneListing.findFirst({
          where: {
            imeiNumber: { equals: cleanImei, mode: 'insensitive' },
            isActive: true,
            isSold: false,
          },
        });
        if (existingActiveListing) {
          throw new ApiError(
            `An active unsold phone listing with IMEI ${cleanImei} already exists (Listing: ${existingActiveListing.listingId || existingActiveListing.id}).`,
            409
          );
        }
      }
    }

    const listing = await prisma.oldPhoneListing.create({
      data: {
        listingId: `WPWD-${Math.floor(1000 + Math.random() * 9000)}`,
        userId: session.id,
        businessId: session.role === 'BUSINESS' ? session.id : null,
        phoneName: payload.phoneName,
        phoneModel: payload.phoneModel,
        phoneStorage: payload.phoneStorage,
        phoneRam: payload.phoneRam,
        mobileRepaired: payload.mobileRepaired,
        phoneColor: payload.phoneColor,
        phonePrice: payload.phonePrice,
        mrpPrice: payload.mrpPrice,
        description: payload.description,
        imeiNumber: payload.imeiNumber,
        phoneOn: payload.phoneOn,
        displayWorking: payload.displayWorking,
        displayGlassDamage: payload.displayGlassDamage,
        bodyCondition: (payload.bodyCondition as any) || "GOOD",
        simSlotsWorking: payload.simSlotsWorking,
        volumeButtonsWorking: payload.volumeButtonsWorking,
        fingerprintWorking: payload.fingerprintWorking,
        cameraWorking: payload.cameraWorking,
        speakerWorking: payload.speakerWorking,
        financeKitAvailable: payload.financeKitAvailable,
        accessories: payload.accessories ?? [],
        warranty: payload.warranty,
        warrantyType: payload.warrantyType,
        specifications: payload.specifications,
        images: payload.images ?? [],
        billImage: payload.billImage,
        purchaseDate: payload.purchaseDate,
        gift: payload.gift,
        exactPrice: payload.exactPrice,
        isActive: payload.isActive ?? true,
      },
    });

    await createNotification({
      title: 'Old phone listing created',
      message: `Your listing ${listing.phoneName} has been created and is pending review.`,
      type: 'listing',
      relatedId: listing.listingId ?? listing.id,
      userId: session.role === 'USER' ? session.id : undefined,
      businessId: session.role === 'BUSINESS' ? session.id : undefined,
    });

    return jsonResponse({ success: true, data: listing, message: 'Listing created successfully' }, 201);
  } catch (error: any) {
    console.error("[POST /api/oldphone/listings Error]:", error);
    if (error instanceof ApiError) {
      return jsonResponse({ success: false, error: error.message }, error.status);
    }
    if (error instanceof z.ZodError) {
      return jsonResponse({ success: false, error: error.errors.map((e) => e.message).join('; ') }, 400);
    }
    return jsonResponse({ success: false, error: error?.message || 'Server error' }, 500);
  }
}

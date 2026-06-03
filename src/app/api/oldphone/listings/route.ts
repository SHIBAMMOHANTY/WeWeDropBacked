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
  phoneRam: z.string().optional(),
  mobileRepaired: z.boolean().optional(),
  phonePrice: z.number().positive(),
  description: z.string().optional(),
  imeiNumber: z.string().optional(),
  phoneOn: z.boolean().optional(),
  displayWorking: z.boolean().optional(),
  displayGlassDamage: z.boolean().optional(),
  bodyCondition: z.enum(["GOOD", "AVERAGE", "BAD"]).optional(),
  simSlotsWorking: z.boolean().optional(),
  volumeButtonsWorking: z.boolean().optional(),
  fingerprintWorking: z.boolean().optional(),
  cameraWorking: z.boolean().optional(),
  speakerWorking: z.boolean().optional(),
  financeKitAvailable: z.boolean().optional(),
  accessories: z.array(z.string()).optional(),
  warranty: z.boolean().optional(),
  images: z.array(z.string()).optional(),
  billImage: z.string().optional(),
  purchaseDate: z.string().optional(),
});

export async function OPTIONS() {
  return jsonResponse({}, 204);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: Record<string, unknown> = {};
    const isActive = parseBoolean(url.searchParams.get("isActive"));
    if (typeof isActive === "boolean") {
      filters.isActive = isActive;
    }
    const userId = url.searchParams.get("userId");
    const businessId = url.searchParams.get("businessId");
    if (userId) filters.userId = userId;
    if (businessId) filters.businessId = businessId;

    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const session = await getAuthSession(req);
      if (session.role !== "SUPER_ADMIN") {
        if (session.role === "BUSINESS") {
          filters.businessId = session.id;
          delete filters.userId; // ensure they can't override
        } else {
          filters.userId = session.id;
          delete filters.businessId; // ensure they can't override
        }
      }
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
          orders: true,
          user: { select: { id: true, phone: true, username: true, email: true, role: true, avatar: true } },
          business: { select: { id: true, email: true, dealerName: true, contactNumber: true, approved: true, isActive: true } }
        }
      }),
    ]);

    const formattedListings = listings.map((listing: any) => {
      let businessName = listing.businessId;
      if (listing.business) {
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
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonResponse({ success: false, error: error.message }, error.status);
    }
    return jsonResponse({ success: false, error: "Server error" }, 500);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAuthSession(req);
    if (!['USER', 'BUSINESS'].includes(session.role)) {
      throw new ApiError('Only authenticated users or businesses can create listings', 403);
    }
    const body = await req.json();
    const payload = listingCreateSchema.parse(body);

    const listing = await prisma.oldPhoneListing.create({
      data: {
        listingId: `OL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId: session.id,
        businessId: session.role === 'BUSINESS' ? session.id : null,
        phoneName: payload.phoneName,
        phoneModel: payload.phoneModel,
        phoneStorage: payload.phoneStorage,
        phoneRam: payload.phoneRam,
        mobileRepaired: payload.mobileRepaired,
        phoneColor: payload.phoneColor,
        phonePrice: payload.phonePrice,
        description: payload.description,
        imeiNumber: payload.imeiNumber,
        phoneOn: payload.phoneOn,
        displayWorking: payload.displayWorking,
        displayGlassDamage: payload.displayGlassDamage,
        bodyCondition: payload.bodyCondition,
        simSlotsWorking: payload.simSlotsWorking,
        volumeButtonsWorking: payload.volumeButtonsWorking,
        fingerprintWorking: payload.fingerprintWorking,
        cameraWorking: payload.cameraWorking,
        speakerWorking: payload.speakerWorking,
        financeKitAvailable: payload.financeKitAvailable,
        accessories: payload.accessories ?? [],
        warranty: payload.warranty,
        images: payload.images ?? [],
        billImage: payload.billImage,
        purchaseDate: payload.purchaseDate,
        isActive: false,
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
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonResponse({ success: false, error: error.message }, error.status);
    }
    if (error instanceof z.ZodError) {
      return jsonResponse({ success: false, error: error.errors.map((e) => e.message).join('; ') }, 400);
    }
    return jsonResponse({ success: false, error: 'Server error' }, 500);
  }
}

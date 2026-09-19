import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, getAuthSession, jsonResponse } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const listingUpdateSchema = z.object({
  phoneName: z.string().min(1).nullable().optional(),
  phoneModel: z.string().min(1).nullable().optional(),
  phoneStorage: z.string().min(1).nullable().optional(),
  phoneColor: z.string().min(1).nullable().optional(),
  phoneRam: z.string().nullable().optional(),
  mobileRepaired: z.boolean().nullable().optional(),
  phonePrice: z.number().positive().nullable().optional(),
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
  isActive: z.boolean().nullable().optional(),
  isSold: z.boolean().nullable().optional(),
  gift: z.string().nullable().optional(),
  exactPrice: z.number().positive().nullable().optional(),
});

export async function OPTIONS() {
  return jsonResponse({}, 204);
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    const listing = await prisma.oldPhoneListing.findFirst({
      where: { OR: [{ id }, { listingId: id }] },
      include: {
        orders: {
          select: {
            id: true,
            orderId: true,
            deliveryStatus: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        }
      },
    });
    if (!listing) {
      throw new ApiError("Listing not found", 404);
    }
    return jsonResponse({ success: true, data: listing, message: "Listing retrieved successfully" });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonResponse({ success: false, error: error.message }, error.status);
    }
    return jsonResponse({ success: false, error: "Server error" }, 500);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthSession(req);
    const id = params.id;
    const listing = await prisma.oldPhoneListing.findFirst({ where: { OR: [{ id }, { listingId: id }] } });
    if (!listing) {
      throw new ApiError("Listing not found", 404);
    }
    const payload = listingUpdateSchema.parse(await req.json());
    if (Object.keys(payload).length === 0) {
      throw new ApiError("No fields provided for update", 400);
    }

    const isOwner = listing.userId === session.id || listing.businessId === session.id;
    const isAdmin = session.role === "SUPER_ADMIN";
    const isUser = session.role === "USER" || session.role === "BUSINESS";

    if (!isOwner && !isAdmin && !isUser) {
      throw new ApiError("Forbidden", 403);
    }
    const updateData: any = {};
    for (const [key, val] of Object.entries(payload)) {
      if (val !== null && val !== undefined) {
        updateData[key] = val;
      }
    }
    const updated = await prisma.oldPhoneListing.update({ where: { id: listing.id }, data: updateData });
    return jsonResponse({ success: true, data: updated, message: "Listing updated successfully" });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonResponse({ success: false, error: error.message }, error.status);
    }
    if (error instanceof z.ZodError) {
      return jsonResponse({ success: false, error: error.errors.map((e) => e.message).join('; ') }, 400);
    }
    return jsonResponse({ success: false, error: "Server error" }, 500);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthSession(req);
    const id = params.id;
    const listing = await prisma.oldPhoneListing.findFirst({ where: { OR: [{ id }, { listingId: id }] } });
    if (!listing) {
      throw new ApiError("Listing not found", 404);
    }
    const isOwner = listing.userId === session.id || listing.businessId === session.id;
    const isAdmin = session.role === "SUPER_ADMIN";
    const isUser = session.role === "USER" || session.role === "BUSINESS";

    if (!isOwner && !isAdmin && !isUser) {
      throw new ApiError("Forbidden", 403);
    }

    // Direct permanent deletion from database
    await prisma.oldPhoneOrder.deleteMany({ where: { listingId: listing.id } });
    await prisma.oldPhoneListing.delete({ where: { id: listing.id } });

    return jsonResponse({ success: true, data: null, message: "Listing permanently deleted from database" });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonResponse({ success: false, error: error.message }, error.status);
    }
    return jsonResponse({ success: false, error: "Server error" }, 500);
  }
}

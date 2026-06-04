import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, getAuthSession, jsonResponse } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const listingUpdateSchema = z.object({
  phoneName: z.string().min(1).optional(),
  phoneModel: z.string().min(1).optional(),
  phoneStorage: z.string().min(1).optional(),
  phoneColor: z.string().min(1).optional(),
  phonePrice: z.number().positive().optional(),
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
  isActive: z.boolean().optional(),
  isSold: z.boolean().optional(),
  gift: z.string().nullable().optional(),
  exactPrice: z.number().positive().optional(),
});

export async function OPTIONS() {
  return jsonResponse({}, 204);
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    const listing = await prisma.oldPhoneListing.findFirst({
      where: { OR: [{ id }, { listingId: id }] },
      include: { orders: { orderBy: { createdAt: "desc" } } },
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
    const isUser = session.role === "USER";

    if (!isOwner && !isAdmin && !isUser) {
      throw new ApiError("Forbidden", 403);
    }
    const updated = await prisma.oldPhoneListing.update({ where: { id: listing.id }, data: payload });
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
    if (listing.userId !== session.id && listing.businessId !== session.id && session.role !== "SUPER_ADMIN") {
      throw new ApiError("Forbidden", 403);
    }
    const updated = await prisma.oldPhoneListing.update({ where: { id: listing.id }, data: { isActive: false } });
    return jsonResponse({ success: true, data: updated, message: "Listing soft deleted successfully" });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonResponse({ success: false, error: error.message }, error.status);
    }
    return jsonResponse({ success: false, error: "Server error" }, 500);
  }
}

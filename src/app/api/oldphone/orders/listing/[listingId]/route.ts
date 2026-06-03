import { prisma } from "@/lib/prisma";
import { ApiError, buildPagination, getAuthSession, jsonResponse } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return jsonResponse({}, 204);
}

export async function GET(req: Request, { params }: { params: { listingId: string } }) {
  try {
    const session = await getAuthSession(req);
    const listingId = params.listingId;
    const listing = await prisma.oldPhoneListing.findFirst({
      where: { OR: [{ id: listingId }, { listingId }] },
    });
    if (!listing) {
      throw new ApiError("Listing not found", 404);
    }
    if (session.role !== "SUPER_ADMIN" && listing.userId !== session.id && listing.businessId !== session.id) {
      throw new ApiError("Forbidden", 403);
    }
    const { page, limit, skip } = buildPagination(req.url);
    const [total, orders] = await Promise.all([
      prisma.oldPhoneOrder.count({ where: { listingId: listing.id } }),
      prisma.oldPhoneOrder.findMany({
        where: { listingId: listing.id },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          listing: {
            include: {
              business: { select: { id: true, email: true, dealerName: true, contactNumber: true, approved: true, isActive: true } },
              user: { select: { id: true, phone: true, username: true, email: true, role: true, avatar: true } },
            },
          },
        },
      }),
    ]);
    const formattedOrders = orders.map((order: any) => {
      let businessName = order.listing?.businessId;
      if (order.listing?.business) {
        businessName = order.listing.business.dealerName;
      } else if (order.listing?.user && order.listing.businessId === order.listing.user.id) {
        businessName = order.listing.user.username || order.listing.user.phone;
      } else if (order.listing?.user) {
        businessName = order.listing.user.username || order.listing.user.phone;
      }
      return {
        ...order,
        listing: {
          ...order.listing,
          businessId: businessName,
        },
      };
    });

    return jsonResponse({ success: true, data: formattedOrders, message: "Listing orders retrieved successfully", meta: { page, limit, total } });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonResponse({ success: false, error: error.message }, error.status);
    }
    return jsonResponse({ success: false, error: "Server error" }, 500);
  }
}

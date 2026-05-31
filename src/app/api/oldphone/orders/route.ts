import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, buildPagination, getAuthSession, jsonResponse } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const orderCreateSchema = z.object({
  order: z.object({
    items: z.array(z.object({
      phoneId: z.string().min(1),
      quantity: z.number().int().min(1),
      price: z.number().positive()
    })).min(1),
    paymentMethod: z.string(),
    paymentId: z.string().optional(),
    totalAmount: z.number().positive(),
  }),
  customer: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    mobileNo: z.string().min(6),
    altMobileNo: z.string().optional(),
  }),
  shippingAddress: z.object({
    blockBuilding: z.string().optional(),
    addressLine1: z.string(),
    addressLine2: z.string().optional(),
    state: z.string(),
    pincode: z.string(),
    location: z.object({
      latitude: z.number(),
      longitude: z.number(),
    }).optional()
  })
});

export async function OPTIONS() {
  return jsonResponse({}, 204);
}

export async function GET(req: Request) {
  try {
    const session = await getAuthSession(req);
    const url = new URL(req.url);
    const roleQuery = url.searchParams.get("role");
    const filterQuery = url.searchParams.get("filter");
    const role = roleQuery ? roleQuery.toLowerCase() : undefined;
    if (role && !["buyer", "seller"].includes(role)) {
      throw new ApiError("Invalid role query", 400);
    }

    const where: Record<string, unknown> = {};
    if (session.role !== "SUPER_ADMIN" || filterQuery === "mine") {
      if (role === "seller") {
        where.sellerId = session.id;
      } else if (role === "buyer") {
        where.userId = session.id;
      } else if (session.role === "BUSINESS") {
        where.sellerId = session.id;
      } else {
        where.userId = session.id;
      }
    }

    const { page, limit, skip } = buildPagination(req.url);
    const [total, orders] = await Promise.all([
      prisma.oldPhoneOrder.count({ where }),
      prisma.oldPhoneOrder.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { listing: true },
      }),
    ]);

    return jsonResponse({ success: true, data: orders, message: "Orders retrieved successfully", meta: { page, limit, total } });
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
    if (session.role !== "USER") {
      throw new ApiError("Only authenticated customers can place old phone orders", 403);
    }
    const body = await req.json();
    const payload = orderCreateSchema.parse(body);

    const firstItem = payload.order.items[0];

    const order = await prisma.$transaction(async (tx) => {
      const listing = await tx.oldPhoneListing.findFirst({
        where: {
          OR: [{ id: firstItem.phoneId }, { listingId: firstItem.phoneId }],
          isActive: true,
          isSold: false, // Ensure not sold
        },
      });
      if (!listing) {
        throw new ApiError("Active listing not found or already sold", 400);
      }
      if (payload.order.totalAmount > listing.phonePrice) {
        throw new ApiError("Offer price cannot exceed listing price", 400);
      }

      // Atomically check and update isSold
      const updateResult = await tx.oldPhoneListing.updateMany({
        where: { id: listing.id, isSold: false },
        data: { isSold: true },
      });

      if (updateResult.count === 0) {
        throw new ApiError("Listing already sold", 400);
      }

      const sellerId = listing.businessId ?? listing.userId;
      const orderId = `OP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      
      const customerName = `${payload.customer.firstName} ${payload.customer.lastName}`;
      const addr = payload.shippingAddress;
      const deliveryAddress = [
        addr.blockBuilding,
        addr.addressLine1,
        addr.addressLine2,
        addr.state,
        addr.pincode
      ].filter(Boolean).join(", ");

      const createdOrder = await tx.oldPhoneOrder.create({
        data: {
          orderId,
          listingId: listing.id,
          userId: session.id,
          sellerId,
          customerName,
          customerPhone: payload.customer.mobileNo,
          offerPrice: payload.order.totalAmount,
          deliveryAddress,
          paymentMethod: payload.order.paymentMethod,
          paymentId: payload.order.paymentId,
          paymentDate: new Date(),
          deliveryStatus: 0,
        },
      });

      await tx.notification.create({
        data: {
          title: "New old phone order received",
          message: `A new order has been placed for ${listing.phoneName}.`,
          type: "order",
          relatedId: orderId,
          userId: listing.businessId ? undefined : sellerId,
          businessId: listing.businessId ?? undefined,
        },
      });

      await tx.notification.create({
        data: {
          title: "Order submitted",
          message: `Your offer for ${listing.phoneName} has been created.`,
          type: "order",
          relatedId: orderId,
          userId: session.id,
        },
      });

      return createdOrder;
    });

    return jsonResponse({ success: true, data: order, message: "Order created successfully" }, 201);
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

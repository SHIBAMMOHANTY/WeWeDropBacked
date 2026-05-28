import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, buildPagination, getAuthSession, jsonResponse } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const orderCreateSchema = z.object({
  listingId: z.string().min(1),
  customerName: z.string().min(1),
  customerPhone: z.string().min(6),
  offerPrice: z.number().positive(),
  deliveryAddress: z.string().optional(),
  deliveryDate: z.string().optional(),
  inCart: z.boolean().optional(),
});

export async function OPTIONS() {
  return jsonResponse({}, 204);
}

export async function GET(req: Request) {
  try {
    const session = await getAuthSession(req);
    const url = new URL(req.url);
    const roleQuery = url.searchParams.get("role");
    const role = roleQuery ? roleQuery.toLowerCase() : undefined;
    if (role && !["buyer", "seller"].includes(role)) {
      throw new ApiError("Invalid role query", 400);
    }

    const where: Record<string, unknown> = {};
    if (role === "seller") {
      where.sellerId = session.id;
    } else if (role === "buyer") {
      where.userId = session.id;
    } else if (session.role === "BUSINESS") {
      where.sellerId = session.id;
    } else {
      where.userId = session.id;
    }

    const inCart = parseBoolean(url.searchParams.get("inCart"));
    if (typeof inCart === "boolean") {
      where.inCart = inCart;
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

    const listing = await prisma.oldPhoneListing.findFirst({
      where: {
        OR: [{ id: payload.listingId }, { listingId: payload.listingId }],
        isActive: true,
      },
    });
    if (!listing) {
      throw new ApiError("Active listing not found", 404);
    }
    if (payload.offerPrice > listing.phonePrice) {
      throw new ApiError("Offer price cannot exceed listing price", 400);
    }

    const sellerId = listing.businessId ?? listing.userId;
    const orderId = `OP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const deliveryDate = payload.deliveryDate ? new Date(payload.deliveryDate) : null;
    if (payload.deliveryDate && Number.isNaN(deliveryDate.getTime())) {
      throw new ApiError("Invalid delivery date format", 400);
    }

    const [order] = await prisma.$transaction([
      prisma.oldPhoneOrder.create({
        data: {
          orderId,
          listingId: listing.id,
          userId: session.id,
          sellerId,
          customerName: payload.customerName,
          customerPhone: payload.customerPhone,
          offerPrice: payload.offerPrice,
          deliveryAddress: payload.deliveryAddress,
          deliveryDate: deliveryDate ?? undefined,
          inCart: payload.inCart ?? false,
          deliveryStatus: 0,
        },
      }),
      prisma.notification.create({
        data: {
          title: "New old phone order received",
          message: `A new order has been placed for ${listing.phoneName}.`,
          type: "order",
          relatedId: orderId,
          userId: listing.businessId ? undefined : sellerId,
          businessId: listing.businessId ?? undefined,
        },
      }),
      prisma.notification.create({
        data: {
          title: "Order submitted",
          message: `Your offer for ${listing.phoneName} has been created.`,
          type: "order",
          relatedId: orderId,
          userId: session.id,
        },
      }),
    ]);

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

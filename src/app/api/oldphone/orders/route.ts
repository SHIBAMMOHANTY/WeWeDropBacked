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
      price: z.number()
    })).min(1),
    paymentMethod: z.string(),
    paymentId: z.string().optional().nullable(),
    totalAmount: z.number(),
    exactPrice: z.number().optional().nullable(),
    gift: z.string().optional().nullable(),
  }).passthrough(),
  customer: z.object({
    firstName: z.string().optional().nullable(),
    lastName: z.string().optional().nullable(),
    mobileNo: z.string().optional().nullable(),
    altMobileNo: z.string().optional().nullable(),
  }).passthrough(),
  shippingAddress: z.object({
    blockBuilding: z.string().optional().nullable(),
    addressLine1: z.string().optional().nullable(),
    addressLine2: z.string().optional().nullable(),
    state: z.string().optional().nullable(),
    pincode: z.string().optional().nullable(),
    location: z.object({
      latitude: z.number(),
      longitude: z.number(),
    }).optional().nullable()
  }).passthrough()
}).passthrough();

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

    const agentIdParam = url.searchParams.get("deliveryAgentId") || url.searchParams.get("agentId");
    const where: Record<string, unknown> = {};
    
    if (agentIdParam) {
      where.deliveryAgentId = agentIdParam;
    } else if (session.role === "DELIVERY_AGENT") {
      where.deliveryAgentId = session.id;
    } else if (session.role !== "SUPER_ADMIN" || filterQuery === "mine") {
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
        include: {
          deliveryAgent: { select: { id: true, phone: true, username: true, role: true } },
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

    return jsonResponse({ success: true, data: formattedOrders, message: "Orders retrieved successfully", meta: { page, limit, total } });
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
    if (!session || !session.id) {
      throw new ApiError("Authentication required to place orders", 401);
    }
    const body = await req.json();
    console.log("RECEIVED PAYLOAD:", JSON.stringify(body, null, 2));
    const payload = orderCreateSchema.parse(body);

    const firstItem = payload.order.items[0];

    const order = await prisma.$transaction(async (tx) => {
      let listing = await tx.oldPhoneListing.findFirst({
        where: {
          OR: [{ id: firstItem.phoneId }, { listingId: firstItem.phoneId }],
          isActive: true,
          isSold: false, // Ensure not sold
        },
      });
      let isQuoteOrder = false;

      if (!listing) {
        // Try looking up in the Quote table!
        const quote = await tx.quote.findUnique({
          where: { id: firstItem.phoneId },
        });

        if (quote) {
          isQuoteOrder = true;
          // Dynamically create an OldPhoneListing from this Quote so that OldPhoneOrder relation works!
          listing = await tx.oldPhoneListing.create({
            data: {
              userId: quote.userId || session.id,
              phoneName: quote.brand || "Unknown Brand",
              phoneModel: quote.model || "Unknown Model",
              phoneStorage: quote.storage || "N/A",
              phonePrice: quote.finalPrice || quote.estimatedPrice || firstItem.price,
              mobileRepaired: true, // It is refurbished!
              phoneColor: "Default",
              imeiNumber: quote.imeiNumber || quote.imei || "N/A",
              description: `Quote Order. Quote Number: ${quote.quoteNumber}`,
              bodyCondition: (quote.condition?.toUpperCase() === "EXCELLENT" || quote.condition?.toUpperCase() === "GOOD")
                ? "GOOD" 
                : quote.condition?.toUpperCase() === "AVERAGE" 
                  ? "AVERAGE" 
                  : quote.condition?.toUpperCase() === "BAD"
                    ? "BAD"
                    : "GOOD",
              images: quote.images && quote.images.length > 0 ? quote.images : [],
              isActive: true,
              isSold: true, // Mark it sold immediately since it's being ordered!
            }
          });

          // Also update the Quote status to "ordered"
          await tx.quote.update({
            where: { id: quote.id },
            data: { status: "ordered" }
          });
        }
      }

      if (!listing) {
        throw new ApiError("Active listing not found or already sold", 400);
      }
      if (payload.order.totalAmount > listing.phonePrice + 1000) {
        throw new ApiError("Offer price cannot exceed listing price", 400);
      }

      // Atomically check and update isSold for normal listings
      if (!isQuoteOrder) {
        const updateResult = await tx.oldPhoneListing.updateMany({
          where: { id: listing.id, isSold: false },
          data: { isSold: true },
        });

        if (updateResult.count === 0) {
          throw new ApiError("Listing already sold", 400);
        }
      }

      const sellerId = listing.businessId ?? listing.userId;
      const orderId = `WPWD-${Math.floor(1000 + Math.random() * 9000)}`;
      
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
          exactPrice: payload.order.exactPrice,
          gift: payload.order.gift,
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

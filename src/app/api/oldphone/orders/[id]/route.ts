import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, getAuthSession, isValidDeliveryStatus, jsonResponse } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const orderStatusUpdateSchema = z.object({
  deliveryStatus: z.union([z.number(), z.string()]).optional().transform((v) => (v !== undefined ? Number(v) : undefined)),
  status: z.string().optional(),
  orderStatus: z.union([z.number(), z.string()]).optional(),
  isPaid: z.boolean().optional(),
  paymentStatus: z.string().optional(),
  receivedPaymentMode: z.string().optional(),
  deliveryRemarks: z.string().optional(),
  remark: z.string().optional(),
  feedback: z.string().optional(),
  rating: z.number().optional(),
  deliveryDate: z.string().optional(),
  deliveryAgentId: z.string().optional().nullable(),
}).passthrough();

export async function OPTIONS() {
  return jsonResponse({}, 204);
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthSession(req);
    const id = params.id;
    const order = await prisma.oldPhoneOrder.findFirst({
      where: { OR: [{ id }, { orderId: id }] },
      include: {
        deliveryAgent: { select: { id: true, phone: true, username: true, role: true } },
        listing: {
          include: {
            business: { select: { id: true, email: true, dealerName: true, contactNumber: true, approved: true, isActive: true } },
            user: { select: { id: true, phone: true, username: true, email: true, role: true, avatar: true } },
          },
        },
      },
    });
    if (!order) {
      throw new ApiError("Order not found", 404);
    }
    if (session.role !== "SUPER_ADMIN" && session.role !== "DELIVERY_AGENT" && order.userId !== session.id && order.sellerId !== session.id && order.deliveryAgentId !== session.id) {
      throw new ApiError("Forbidden", 403);
    }
    return jsonResponse({ success: true, data: order });
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
    const rawBody = await req.json().catch(() => ({}));
    const payload = orderStatusUpdateSchema.parse(rawBody);

    const order = await prisma.oldPhoneOrder.findFirst({ where: { OR: [{ id }, { orderId: id }] } });
    if (!order) {
      throw new ApiError("Order not found", 404);
    }
    if (session.role !== "SUPER_ADMIN" && session.role !== "DELIVERY_AGENT" && order.sellerId !== session.id && order.userId !== session.id && order.deliveryAgentId !== session.id) {
      throw new ApiError("Forbidden", 403);
    }

    const updateData: Record<string, unknown> = {};
    
    // Map deliveryStatus
    if (payload.deliveryStatus !== undefined) {
      updateData.deliveryStatus = payload.deliveryStatus;
    } else if (payload.status === "DELIVERED" || payload.orderStatus === "DELIVERED" || payload.orderStatus === 4 || payload.orderStatus === 5) {
      updateData.deliveryStatus = 4;
    }

    if (payload.remark !== undefined || payload.deliveryRemarks !== undefined) {
      updateData.remark = payload.remark || payload.deliveryRemarks;
    }
    if (payload.rating !== undefined) updateData.rating = payload.rating;
    if (payload.feedback !== undefined) updateData.feedback = payload.feedback;
    if (payload.deliveryAgentId !== undefined) updateData.deliveryAgentId = payload.deliveryAgentId;

    if (payload.deliveryDate) {
      const parsedDate = new Date(payload.deliveryDate);
      if (!Number.isNaN(parsedDate.getTime())) {
        updateData.deliveryDate = parsedDate;
      }
    }

    // When marking delivered (status 4)
    if (updateData.deliveryStatus === 4) {
      if (!updateData.deliveryDate) {
        updateData.deliveryDate = new Date();
      }
      if (updateData.rating === undefined) {
        updateData.rating = 5;
      }
      if (!updateData.feedback) {
        updateData.feedback = payload.deliveryRemarks || payload.remark || "Delivered via customer OTP verification.";
      }
      updateData.isPaid = true;
      updateData.paymentStatus = "PAID";
    }

    const [updatedOrder] = await prisma.$transaction([
      prisma.oldPhoneOrder.update({ where: { id: order.id }, data: updateData }),
      prisma.notification.create({
        data: {
          title: "Order status updated",
          message: `Your order ${order.orderId ?? order.id} status was updated to ${updateData.deliveryStatus === 4 ? "Delivered" : "In Progress"}.`,
          type: "order",
          relatedId: order.orderId ?? order.id,
          userId: order.userId,
        },
      }),
    ]);

    return jsonResponse({ success: true, data: updatedOrder, message: "Order status updated successfully" });
  } catch (error) {
    console.error("Order status update error:", error);
    if (error instanceof ApiError) {
      return jsonResponse({ success: false, error: error.message }, error.status);
    }
    if (error instanceof z.ZodError) {
      return jsonResponse({ success: false, error: error.errors.map((e) => e.message).join('; ') }, 400);
    }
    return jsonResponse({ success: false, error: "Server error" }, 500);
  }
}

export async function PUT(req: Request, ctx: { params: { id: string } }) {
  return PATCH(req, ctx);
}

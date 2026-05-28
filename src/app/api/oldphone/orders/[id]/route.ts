import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, getAuthSession, isValidDeliveryStatus, jsonResponse } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const orderStatusUpdateSchema = z.object({
  deliveryStatus: z.number().int().min(0).max(5),
  remark: z.string().optional(),
  feedback: z.string().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  inCart: z.boolean().optional(),
});

export async function OPTIONS() {
  return jsonResponse({}, 204);
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthSession(req);
    const id = params.id;
    const order = await prisma.oldPhoneOrder.findFirst({
      where: { OR: [{ id }, { orderId: id }] },
      include: { listing: true },
    });
    if (!order) {
      throw new ApiError("Order not found", 404);
    }
    if (order.userId !== session.id && order.sellerId !== session.id) {
      throw new ApiError("Forbidden", 403);
    }
    return jsonResponse({ success: true, data: order, message: "Order retrieved successfully" });
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
    const payload = orderStatusUpdateSchema.parse(await req.json());
    if (!isValidDeliveryStatus(payload.deliveryStatus)) {
      throw new ApiError("Invalid delivery status", 400);
    }
    const order = await prisma.oldPhoneOrder.findFirst({ where: { OR: [{ id }, { orderId: id }] } });
    if (!order) {
      throw new ApiError("Order not found", 404);
    }
    if (order.sellerId !== session.id) {
      throw new ApiError("Forbidden", 403);
    }

    const updateData: Record<string, unknown> = {
      deliveryStatus: payload.deliveryStatus,
      remark: payload.remark,
    };
    if (payload.inCart !== undefined) {
      updateData.inCart = payload.inCart;
    }

    if (payload.deliveryStatus === 4) {
      if (payload.rating === undefined || payload.rating < 1 || payload.rating > 5) {
        throw new ApiError("Rating is required and must be between 1 and 5 when marking delivered", 400);
      }
      if (!payload.feedback || payload.feedback.trim().length === 0) {
        throw new ApiError("Feedback is required when marking delivered", 400);
      }
      updateData.rating = payload.rating;
      updateData.feedback = payload.feedback;
    }

    const [updatedOrder] = await prisma.$transaction([
      prisma.oldPhoneOrder.update({ where: { id: order.id }, data: updateData }),
      prisma.notification.create({
        data: {
          title: "Order status updated",
          message: `Your order ${order.orderId ?? order.id} status was updated.`,
          type: "order",
          relatedId: order.orderId ?? order.id,
          userId: order.userId,
        },
      }),
    ]);

    return jsonResponse({ success: true, data: updatedOrder, message: "Order status updated successfully" });
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

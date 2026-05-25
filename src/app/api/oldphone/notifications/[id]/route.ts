import { prisma } from "@/lib/prisma";
import { ApiError, getAuthSession, jsonResponse } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return jsonResponse({}, 204);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthSession(req);
    const notification = await prisma.notification.findUnique({ where: { id: params.id } });
    if (!notification) {
      throw new ApiError("Notification not found", 404);
    }
    const belongsToRequester = session.role === "BUSINESS" ? notification.businessId === session.id : notification.userId === session.id;
    if (!belongsToRequester) {
      throw new ApiError("Forbidden", 403);
    }
    const updated = await prisma.notification.update({ where: { id: notification.id }, data: { isRead: true } });
    return jsonResponse({ success: true, data: updated, message: "Notification marked as read" });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonResponse({ success: false, error: error.message }, error.status);
    }
    return jsonResponse({ success: false, error: "Server error" }, 500);
  }
}

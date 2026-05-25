import { prisma } from "@/lib/prisma";
import { ApiError, buildPagination, getAuthSession, jsonResponse, parseBoolean } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return jsonResponse({}, 204);
}

export async function GET(req: Request) {
  try {
    const session = await getAuthSession(req);
    const isRead = parseBoolean(new URL(req.url).searchParams.get("isRead"));
    const where: Record<string, unknown> = session.role === "BUSINESS" ? { businessId: session.id } : { userId: session.id };
    if (typeof isRead === "boolean") {
      (where as Record<string, unknown>).isRead = isRead;
    }

    const { page, limit, skip } = buildPagination(req.url);
    const [total, notifications] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return jsonResponse({ success: true, data: notifications, message: "Notifications retrieved successfully", meta: { page, limit, total } });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonResponse({ success: false, error: error.message }, error.status);
    }
    return jsonResponse({ success: false, error: "Server error" }, 500);
  }
}

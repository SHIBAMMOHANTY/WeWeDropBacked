export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

// ⚡ RETRY HELPER WITH EXPONENTIAL BACKOFF
async function executeWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries - 1;
      const isConnectionError = 
        error?.code === 'P2010' || 
        error?.message?.includes('connection') ||
        error?.message?.includes('I/O error');
      
      if (isConnectionError && !isLastAttempt) {
        const delay = delayMs * Math.pow(2, attempt); // exponential backoff
        console.warn(`Connection error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    }

    const token = authHeader.split(" ")[1];
    let decoded: { id?: string; role?: string };
    try {
      decoded = verifyToken(token) as { id?: string; role?: string };
    } catch {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401, headers: corsHeaders }
      );
    }

    if (!decoded?.id) {
      return NextResponse.json(
        { error: "Invalid token payload" },
        { status: 401, headers: corsHeaders }
      );
    }

    const orderId = searchParams.get("orderId");
    const requestedUserId = searchParams.get("userId");
    const sourceType = searchParams.get("sourceType");
    const sourceRoute = searchParams.get("sourceRoute");
    const limit = Math.min(Number(searchParams.get("limit") ?? "100"), 500);

    const role = (decoded.role ?? "").toUpperCase();
    const isAdmin = role === "SUPER_ADMIN";
    const shouldRestrictByUser = role === "USER" || role === "DELIVERY_AGENT" || !role;

    let userId: string | null = null;
    if (isAdmin) {
      userId = requestedUserId;
    } else if (shouldRestrictByUser) {
      userId = decoded.id ?? null;
    } else {
      // BUSINESS and other privileged roles are not forced to customer userId scope.
      userId = requestedUserId;
    }

    const where: Record<string, unknown> = {};
    if (orderId) where.orderId = orderId;
    if (userId) where.userId = userId;
    if (sourceType) where.sourceType = sourceType;
    if (sourceRoute) where.sourceRoute = sourceRoute;

    // ⚡ FETCH WITH RETRY LOGIC
    const history = await executeWithRetry(async () => {
      return await prisma.orderHistory.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          afterState: true,
          createdAt: true,
        },
      });
    });

    // ⚡ OPTIMIZED: Use Map for O(1) lookup instead of object keys iteration
    const groupedHistory = new Map<string, any[]>();

    history.forEach((entry) => {
      const afterState = entry.afterState as any;
      const realOrderId = afterState?.orderId;
      const isDeleted = afterState?.deleted === true;

      if (!realOrderId || isDeleted) return;

      if (!groupedHistory.has(realOrderId)) {
        groupedHistory.set(realOrderId, []);
      }

      groupedHistory.get(realOrderId)!.push({
        afterState: entry.afterState,
        createdAt: entry.createdAt,
      });
    });

    // ⚡ OPTIMIZED: Single sort before mapping + Array.from() for faster iteration
    const finalHistory = Array.from(groupedHistory.entries())
      .map(([orderId, entries]) => ({
        orderId,
        history: entries.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime()
        ),
      }))
      .sort((a, b) => 
        new Date(b.history[0]?.createdAt).getTime() -
        new Date(a.history[0]?.createdAt).getTime()
      );

    // Hide history for orders that are currently soft-deleted in Order table.
    const orderIds = finalHistory.map((item) => item.orderId);
    let deletedOrderIds = new Set<string>();

    if (orderIds.length > 0) {
      const deletedOrders = await executeWithRetry(async () => {
        return await prisma.order.findMany({
          where: {
            orderId: { in: orderIds },
            deleted: true,
          },
          select: { orderId: true },
        });
      });

      deletedOrderIds = new Set(
        deletedOrders
          .map((order) => order.orderId)
          .filter((id): id is string => Boolean(id))
      );
    }

    const visibleHistory = finalHistory.filter(
      (item) => !deletedOrderIds.has(item.orderId)
    );

    return NextResponse.json(
      {
        count: visibleHistory.length,
        history: visibleHistory,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("GET /api/orders/history error:", error);

    if (error instanceof JsonWebTokenError || error instanceof TokenExpiredError) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch order history" },
      { status: 500, headers: corsHeaders }
    );
  }
}
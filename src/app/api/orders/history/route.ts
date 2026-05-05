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

    let targetUserId: string | null = null;
    if (isAdmin) {
      targetUserId = requestedUserId;
    } else if (shouldRestrictByUser) {
      targetUserId = decoded.id ?? null;
    } else {
      // BUSINESS and other privileged roles are not forced to customer userId scope.
      targetUserId = requestedUserId;
    }

    const where: Record<string, unknown> = {};

    // Scope by owned order keys instead of OrderHistory.userId (which may be null/mismatched).
    if (targetUserId) {
      const ownedOrders = await executeWithRetry(async () => {
        return await prisma.order.findMany({
          where: { userId: targetUserId },
          select: { id: true, orderId: true },
        });
      });

      const ownedOrderKeys = new Set<string>();
      for (const order of ownedOrders) {
        ownedOrderKeys.add(order.id);
        if (order.orderId) ownedOrderKeys.add(order.orderId);
      }

      if (ownedOrderKeys.size === 0) {
        return NextResponse.json(
          { count: 0, history: [] },
          { headers: corsHeaders }
        );
      }

      let keysToUse = Array.from(ownedOrderKeys);
      if (orderId) {
        if (!ownedOrderKeys.has(orderId)) {
          return NextResponse.json(
            { count: 0, history: [] },
            { headers: corsHeaders }
          );
        }
        keysToUse = [orderId];
      }

      where.orderId = { in: keysToUse };
    } else if (orderId) {
      where.orderId = orderId;
    }

    if (sourceType) where.sourceType = sourceType;
    if (sourceRoute) where.sourceRoute = sourceRoute;

    // ⚡ FETCH WITH RETRY LOGIC
    const history = await executeWithRetry(async () => {
      return await prisma.orderHistory.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          orderId: true,
          sourceType: true,
          batchId: true,
          afterState: true,
          createdAt: true,
        },
      });
    });

    // ⚡ OPTIMIZED: Use Map for O(1) lookup instead of object keys iteration
    const groupedHistory = new Map<string, { orderId: string; primaryIndividualId: string; history: any[] }>();

    history.forEach((entry) => {
      const afterState = entry.afterState as any;
      const isBulkHistory =
        entry.sourceType === "MULTI_UPDATE" &&
        typeof entry.batchId === "string" &&
        entry.batchId.trim().length > 0;

      const fallbackOrderKey = afterState?.orderId ?? afterState?.id ?? entry.orderId;
      const groupKey = isBulkHistory ? entry.batchId! : fallbackOrderKey;
      const isDeleted = afterState?.deleted === true;

      if (!groupKey || isDeleted) return;

      if (!groupedHistory.has(groupKey)) {
        groupedHistory.set(groupKey, {
          orderId: isBulkHistory ? `BULK-${fallbackOrderKey}` : String(fallbackOrderKey),
          primaryIndividualId: isBulkHistory ? String(fallbackOrderKey) : "",
          history: [],
        });
      }

      const group = groupedHistory.get(groupKey)!;
      const normalizedAfterState = isBulkHistory
        ? { ...afterState, orderId: group.primaryIndividualId }
        : afterState;

      group.history.push({
        afterState: normalizedAfterState,
        createdAt: entry.createdAt,
      });
    });

    // ⚡ OPTIMIZED: Single sort before mapping + Array.from() for faster iteration
    const finalHistory = Array.from(groupedHistory.entries())
      .map(([, group]) => ({
        orderId: group.orderId,
        history: group.history.sort(
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
    const orderIds = finalHistory.map((item) => item.orderId).filter(Boolean);
    const objectIdPattern = /^[a-fA-F0-9]{24}$/;
    const orderDocIds = orderIds.filter((id) => objectIdPattern.test(id));
    let deletedOrderIds = new Set<string>();
    let deletedOrderDocIds = new Set<string>();

    if (orderIds.length > 0) {
      const deletedOrders = await executeWithRetry(async () => {
        return await prisma.order.findMany({
          where: {
            deleted: true,
            OR: [
              { orderId: { in: orderIds } },
              ...(orderDocIds.length > 0 ? [{ id: { in: orderDocIds } }] : []),
            ],
          },
          select: { id: true, orderId: true },
        });
      });

      deletedOrderIds = new Set(
        deletedOrders
          .map((order) => order.orderId)
          .filter((id): id is string => Boolean(id))
      );

      deletedOrderDocIds = new Set(
        deletedOrders
          .map((order) => order.id)
          .filter((id): id is string => Boolean(id))
      );
    }

    const visibleHistory = finalHistory.filter(
      (item) => !deletedOrderIds.has(item.orderId) && !deletedOrderDocIds.has(item.orderId)
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
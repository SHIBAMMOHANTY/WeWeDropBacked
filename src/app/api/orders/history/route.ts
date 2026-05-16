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

function addString(set: Set<string>, value: unknown) {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed) set.add(trimmed);
}

function formatShortOrderId(orderId: string) {
  return orderId.replace(/^(DYVO-?)0+/, "$1");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries: Array<[string, unknown]> = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right));
  const renderedEntries = entries.map(([key, item]) => `"${key}":${stableStringify(item)}`);
  return `{${renderedEntries.join(",")}}`;
}

async function resolveBusinessIdentifiers(decodedId: string): Promise<string[]> {
  const identifiers = new Set<string>();
  addString(identifiers, decodedId);

  const [businessRecord, userRecord] = await executeWithRetry(async () => {
    return await Promise.all([
      prisma.business.findUnique({ where: { id: decodedId } }).catch(() => null),
      prisma.user.findUnique({ where: { id: decodedId } }).catch(() => null),
    ]);
  });

  if (businessRecord) {
    addString(identifiers, businessRecord.id);
    addString(identifiers, businessRecord.dealerName);
    addString(identifiers, businessRecord.contactNumber);
    addString(identifiers, businessRecord.email);
    addString(identifiers, businessRecord.referralCode);
  }

  if (userRecord && userRecord.role === "BUSINESS") {
    addString(identifiers, userRecord.id);
    addString(identifiers, userRecord.username);
    addString(identifiers, userRecord.phone);
    addString(identifiers, userRecord.email);
    addString(identifiers, userRecord.gstName);
  }

  return Array.from(identifiers);
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
    const isUserOrDelivery = role === "USER" || role === "DELIVERY_AGENT";
    const isBusiness = role === "BUSINESS";

    let targetUserId: string | null = null;
    let targetBusinessIdentifiers: string[] | null = null;

    if (isAdmin) {
      targetUserId = requestedUserId;
    } else if (isUserOrDelivery) {
      if (requestedUserId && requestedUserId !== decoded.id) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 403, headers: corsHeaders }
        );
      }
      targetUserId = decoded.id ?? null;
    } else if (isBusiness) {
      if (requestedUserId) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 403, headers: corsHeaders }
        );
      }
      targetBusinessIdentifiers = await resolveBusinessIdentifiers(decoded.id);
    } else {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403, headers: corsHeaders }
      );
    }

    const where: Record<string, unknown> = {};

    // Scope by owned order keys instead of OrderHistory.userId (which may be null/mismatched).
    if (targetUserId || targetBusinessIdentifiers) {
      const ownedOrders = await executeWithRetry(async () => {
        return await prisma.order.findMany({
          where: {
            deleted: false,
            ...(targetUserId
              ? { userId: targetUserId }
              : {
                  OR: targetBusinessIdentifiers && targetBusinessIdentifiers.length > 0
                    ? [
                        { businessId: { in: targetBusinessIdentifiers } },
                      ]
                    : [{ businessId: decoded.id }],
                }),
          },
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

    // If the requested order is soft-deleted, do not return history.
    if (orderId) {
      const explicitOrders = await executeWithRetry(async () => {
        return await prisma.order.findMany({
          where: {
            OR: [{ id: orderId }, { orderId: orderId }],
          },
          select: { deleted: true },
        });
      });

      // If records exist and ALL of them are soft-deleted, do not return history
      if (explicitOrders.length > 0 && explicitOrders.every(o => o.deleted)) {
        return NextResponse.json(
          { count: 0, history: [] },
          { headers: corsHeaders }
        );
      }
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

    const uniqueHistory = [] as typeof history;
    const seenHistoryKeys = new Set<string>();

    for (const entry of history) {
      const dedupeKey = [
        entry.orderId,
        entry.sourceType,
        entry.batchId ?? "",
        stableStringify(entry.afterState),
      ].join("|");

      if (seenHistoryKeys.has(dedupeKey)) continue;
      seenHistoryKeys.add(dedupeKey);
      uniqueHistory.push(entry);
    }

    // ⚡ OPTIMIZED: Use Map for O(1) lookup instead of object keys iteration
    const groupedHistory = new Map<string, { orderId: string; invoiceNumber: string; primaryIndividualId: string; history: any[] }>();

    uniqueHistory.forEach((entry) => {
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
          orderId: formatShortOrderId(String(fallbackOrderKey)),
          invoiceNumber: String(fallbackOrderKey),
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
        invoiceNumber: group.invoiceNumber,
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
    // Extract actual order IDs from history (handle BULK-* prefix)
    const actualOrderIds = new Set<string>();
    const objectIdPattern = /^[a-fA-F0-9]{24}$/;

    finalHistory.forEach((item) => {
      // Use the full invoice/order number for history filtering.
      const realOrderId = item.invoiceNumber || item.orderId;
      actualOrderIds.add(realOrderId);

      // Also add any additional order IDs from history snapshots
      item.history.forEach((snapshot: any) => {
        const afterStateOrderId = snapshot.afterState?.orderId;
        if (afterStateOrderId) actualOrderIds.add(afterStateOrderId);
        const afterStateId = snapshot.afterState?.id;
        if (afterStateId) actualOrderIds.add(afterStateId);
      });
    });

    const orderIdArray = Array.from(actualOrderIds).filter(Boolean);
    const orderDocIds = orderIdArray.filter((id) => objectIdPattern.test(id));
    let deletedOrderIds = new Set<string>();
    let deletedOrderDocIds = new Set<string>();

    if (orderIdArray.length > 0) {
      const allOrders = await executeWithRetry(async () => {
        return await prisma.order.findMany({
          where: {
            OR: [
              { orderId: { in: orderIdArray } },
              ...(orderDocIds.length > 0 ? [{ id: { in: orderDocIds } }] : []),
            ],
          },
          select: { id: true, orderId: true, deleted: true },
        });
      });

      const orderStatusMap = new Map<string, boolean>(); // true if active (deleted: false)
      
      for (const order of allOrders) {
        if (order.orderId) {
          if (!order.deleted) orderStatusMap.set(order.orderId, true);
          else if (!orderStatusMap.has(order.orderId)) orderStatusMap.set(order.orderId, false);
        }
        if (order.id) {
          if (!order.deleted) orderStatusMap.set(order.id, true);
          else if (!orderStatusMap.has(order.id)) orderStatusMap.set(order.id, false);
        }
      }

      for (const [id, isActive] of orderStatusMap.entries()) {
        if (!isActive) {
           deletedOrderIds.add(id);
           deletedOrderDocIds.add(id);
        }
      }
    }

    const visibleHistory = finalHistory.filter((item) => {
      // Compare against the full invoice/order number so bulk labels do not leak into the API response.
      const realOrderId = item.invoiceNumber || item.orderId;

      // Exclude if deleted in Order table
      return !deletedOrderIds.has(realOrderId) && !deletedOrderDocIds.has(realOrderId);
    });

    const visibleOrderDocIds = Array.from(orderDocIds).filter(id => !deletedOrderDocIds.has(id));
    const payments = visibleOrderDocIds.length > 0 
      ? await executeWithRetry(async () => {
          return await prisma.payment.findMany({
            where: { orderId: { in: visibleOrderDocIds } },
            select: { orderId: true, paymentStatus: true, createdAt: true },
            orderBy: { createdAt: "desc" }
          });
        })
      : [];

    const paymentMetaMap = new Map<string, number | null>();
    for (const payment of payments) {
      if (!paymentMetaMap.has(payment.orderId)) {
        paymentMetaMap.set(payment.orderId, payment.paymentStatus ?? null);
      }
    }

    const historyWithPaymentStatus = visibleHistory.map(item => {
      // Find the document ID for this history item if we can
      let docId: string | null = null;
      for (const snapshot of item.history) {
        if (snapshot.afterState?.id) {
          docId = snapshot.afterState.id;
          break;
        }
      }
      return {
        ...item,
        paymentStatus: docId ? (paymentMetaMap.get(docId) ?? null) : null
      };
    });

    return NextResponse.json(
      {
        count: historyWithPaymentStatus.length,
        history: historyWithPaymentStatus,
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
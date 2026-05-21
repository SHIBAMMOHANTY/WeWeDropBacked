export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Helper to resolve business identifiers (ID, dealerName, contactNumber, email, referralCode)
async function resolveBusinessIdentifiers(decodedId: string): Promise<string[]> {
  const identifiers = new Set<string>();
  identifiers.add(decodedId);

  try {
    const [businessRecord, userRecord] = await Promise.all([
      prisma.business.findUnique({ where: { id: decodedId } }).catch(() => null),
      prisma.user.findUnique({ where: { id: decodedId } }).catch(() => null),
    ]);

    if (businessRecord) {
      if (businessRecord.id) identifiers.add(businessRecord.id);
      if (businessRecord.dealerName) identifiers.add(businessRecord.dealerName);
      if (businessRecord.contactNumber) identifiers.add(businessRecord.contactNumber);
      if (businessRecord.email) identifiers.add(businessRecord.email);
      if (businessRecord.referralCode) identifiers.add(businessRecord.referralCode);
    }

    if (userRecord && userRecord.role === "BUSINESS") {
      if (userRecord.id) identifiers.add(userRecord.id);
      if (userRecord.username) identifiers.add(userRecord.username);
      if (userRecord.phone) identifiers.add(userRecord.phone);
      if (userRecord.email) identifiers.add(userRecord.email);
    }
  } catch (error) {
    console.error("Error resolving business identifiers:", error);
  }

  return Array.from(identifiers);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

function toJsonSafe(value: any) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function mapPaymentStatus(status: unknown) {
  switch (Number(status)) {
    case -1:
      return 'REJECTED';
    case 0:
      return 'PENDING';
    case 1:
      return 'VERIFY';
    default:
      return 'UNKNOWN';
  }
}

function derivePaymentStatus(orderStatus: number): number {
  if (orderStatus === -1) return -1; // REJECTED
  if (orderStatus === 4) return 1;  // DELIVERED -> VERIFY
  if (orderStatus === 3) return 1;  // REPAIRING -> VERIFY
  if (orderStatus === 2) return 1;  // READY_FOR_PICKUP -> VERIFY
  return 0; // PENDING
}


async function recordOrderHistory(entry: {
  orderId: string;
  userId?: string | null;
  actionType: string;
  sourceType: string;
  sourceRoute: string;
  requestPayload?: any;
  appliedPayload?: any;
  beforeState?: any;
  afterState?: any;
  batchId?: string | null;
}) {
  const db: any = prisma;

  const beforeState = entry.beforeState ? { ...entry.beforeState } : null;
  if (beforeState && beforeState.paymentStatus !== undefined && beforeState.paymentStatus !== null) {
    beforeState.paymentStatusLabel = mapPaymentStatus(beforeState.paymentStatus);
  }

  const afterState = entry.afterState ? { ...entry.afterState } : null;
  if (afterState && afterState.paymentStatus !== undefined && afterState.paymentStatus !== null) {
    afterState.paymentStatusLabel = mapPaymentStatus(afterState.paymentStatus);
  }

  await db.orderHistory.create({
    data: {
      orderId: entry.orderId,
      userId: entry.userId ?? null,
      actionType: entry.actionType,
      sourceType: entry.sourceType,
      sourceRoute: entry.sourceRoute,
      requestPayload: toJsonSafe(entry.requestPayload) ?? null,
      appliedPayload: toJsonSafe(entry.appliedPayload) ?? null,
      beforeState: toJsonSafe(beforeState) ?? null,
      afterState: toJsonSafe(afterState) ?? null,
      batchId: entry.batchId ?? null,
      paymentStatus: afterState?.paymentStatus ?? beforeState?.paymentStatus ?? 0,
    },
  });
}

async function propagateInvoiceStatusChanges(
  orderId: string,
  newOrderStatus?: number,
  newPaymentStatus?: number,
  paymentId?: string | null,
  sourceRoute = "/api/orders/status"
) {
  if (!paymentId) return;

  const siblingOrders = await prisma.order.findMany({
    where: {
      paymentId: paymentId,
      id: { not: orderId },
      deleted: false,
    },
  });

  for (const sibling of siblingOrders) {
    const beforeSibling = { ...sibling };
    const siblingUpdateData: any = {};

    if (newOrderStatus !== undefined && sibling.orderStatus !== newOrderStatus) {
      siblingUpdateData.orderStatus = newOrderStatus;
    }
    if (newPaymentStatus !== undefined && sibling.paymentStatus !== newPaymentStatus) {
      siblingUpdateData.paymentStatus = newPaymentStatus;
    }

    if (Object.keys(siblingUpdateData).length > 0) {
      const updatedSibling = await prisma.order.update({
        where: { id: sibling.id },
        data: siblingUpdateData,
      });

      await recordOrderHistory({
        orderId: sibling.id,
        userId: sibling.userId,
        actionType: "PATCH",
        sourceType: "INVOICE_PROPAGATE",
        sourceRoute: sourceRoute,
        requestPayload: { triggerOrderId: orderId, triggerPayload: siblingUpdateData },
        appliedPayload: siblingUpdateData,
        beforeState: beforeSibling,
        afterState: updatedSibling,
      });
    }
  }
}

// GET /api/orders/status
export async function GET(req: NextRequest) {
  console.log("DATABASE_URL:", process.env.DATABASE_URL);
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid token" }, { status: 401, headers: corsHeaders });
    }
    const token = authHeader.replace("Bearer ", "");
    let user;
    try {
      user = verifyToken(token); // Should return { id, role, ... }
    } catch (e) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401, headers: corsHeaders });
    }

    console.log("User:", user);

    const role = (user.role ?? "").toUpperCase();
    let orders;

    if (role === "SUPER_ADMIN") {
      // Admin: return all orders
      console.log("Fetching all orders for admin");
      orders = await prisma.order.findMany({ orderBy: { createdAt: "desc" } });
    } else if (role === "BUSINESS") {
      // Business: return only their orders (matched by businessId)
      console.log("Fetching orders for business:", user.id);
      const businessIdentifiers = await resolveBusinessIdentifiers(user.id);
      console.log("Business identifiers:", businessIdentifiers);
      orders = await prisma.order.findMany({
        where: {
          businessId: { in: businessIdentifiers },
        },
        orderBy: { createdAt: "desc" },
      });
    } else {
      // User/DeliveryAgent: return only their orders
      console.log("Fetching orders for user:", user.id);
      orders = await prisma.order.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      });
    }
    console.log("Orders fetched:", orders.length);

    const isLowPriorityServiceDate = (value: Date | string | null | undefined) => {
      if (!value) return false;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return false;
      const year = date.getUTCFullYear();
      const day = date.getUTCDate();
      return year >= 2023 && year <= 2025 && day < 10;
    };

    const statusMap: { [key: number]: string } = {
      0: 'PENDING',
      1: 'PICKUP_REQUESTED',
      '-1': 'REJECTED',
      2: 'READY_FOR_PICKUP',
      3: 'REPAIRING',
      4: 'DELIVERED'
    };

    // Filter out orders where deleted is true
    const filteredOrders = orders.filter(order => !order.deleted);

    filteredOrders.sort((left, right) => {
      // Helper function to extract year from serviceDate
      const getServiceDateYear = (date: Date | string | null | undefined): number => {
        if (!date) return 0;
        const d = new Date(date);
        if (Number.isNaN(d.getTime())) return 0;
        return d.getUTCFullYear();
      };

      // Sort by serviceDate year in DESCENDING order (2025, 2024, 2023, ...)
      const leftYear = getServiceDateYear(left.serviceDate);
      const rightYear = getServiceDateYear(right.serviceDate);

      if (rightYear !== leftYear) {
        return rightYear - leftYear; // Descending order
      }

      // If same year, apply low priority logic
      const leftLowPriority = isLowPriorityServiceDate(left.serviceDate);
      const rightLowPriority = isLowPriorityServiceDate(right.serviceDate);

      if (leftLowPriority !== rightLowPriority) {
        return leftLowPriority ? 1 : -1;
      }

      // Then sort by createdAt descending
      const leftCreatedAt = new Date(left.createdAt).getTime();
      const rightCreatedAt = new Date(right.createdAt).getTime();

      if (rightCreatedAt !== leftCreatedAt) {
        return rightCreatedAt - leftCreatedAt;
      }

      return right.id.localeCompare(left.id);
    });
    
    const orderIds = filteredOrders.map(order => order.id);
    const payments = orderIds.length > 0 
      ? await prisma.payment.findMany({
          where: { orderId: { in: orderIds } },
          select: { orderId: true, paymentStatus: true, createdAt: true },
          orderBy: { createdAt: "desc" }
        })
      : [];

    const paymentMetaMap = new Map<string, number | null>();
    for (const payment of payments) {
      if (!paymentMetaMap.has(payment.orderId)) {
        paymentMetaMap.set(payment.orderId, payment.paymentStatus ?? null);
      }
    }

    const ordersWithStatus = filteredOrders.map(order => ({
      ...order,
      invoicePdf: order.invoicePdf || null,
      billingDate: order.billingDate || null,
      status: statusMap[order.orderStatus] || 'UNKNOWN',
      paymentStatus: order.paymentStatus ?? paymentMetaMap.get(order.id) ?? null,
      paymentStatusLabel: mapPaymentStatus(order.paymentStatus ?? paymentMetaMap.get(order.id) ?? null)
    }));

    return NextResponse.json(ordersWithStatus, { headers: corsHeaders });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json({ error: "Failed to fetch orders", details: error instanceof Error ? error.message : String(error) }, { status: 500, headers: corsHeaders });
  }
}

// PATCH /api/orders/status?orderId=ORDER_ID
export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId" }, { status: 400, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { status, paymentStatus } = body;

    let numericStatus: number | undefined = undefined;
    if (status !== undefined && status !== null) {
      const statusMap: Record<string, number> = {
        "PENDING": 0,
        "PICKUP_REQUESTED": 1,
        "REJECTED": -1,
        "READY_FOR_PICKUP": 2,
        "REPAIRING": 3,
        "DELIVERED": 4
      };

      if (typeof status === 'string') {
        numericStatus = statusMap[status];
        if (numericStatus === undefined) {
          return NextResponse.json({ error: "Invalid status" }, { status: 400, headers: corsHeaders });
        }
      } else if (typeof status === 'number') {
        numericStatus = status;
      } else {
        return NextResponse.json({ error: "Status must be string or number" }, { status: 400, headers: corsHeaders });
      }
    }

    let numericPaymentStatus: number | undefined = undefined;
    if (paymentStatus !== undefined && paymentStatus !== null) {
      numericPaymentStatus = Number(paymentStatus);
    } else if (numericStatus !== undefined) {
      numericPaymentStatus = derivePaymentStatus(numericStatus);
    }

    if (numericStatus === undefined && numericPaymentStatus === undefined) {
      return NextResponse.json({ error: "Missing status or paymentStatus in request body" }, { status: 400, headers: corsHeaders });
    }

    const beforeOrder = await prisma.order.findUnique({ where: { id: orderId } });
    if (!beforeOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404, headers: corsHeaders });
    }

    const updateData: any = {};
    if (numericStatus !== undefined) updateData.orderStatus = numericStatus;
    if (numericPaymentStatus !== undefined) updateData.paymentStatus = numericPaymentStatus;

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: updateData,
    });

    if (updatedOrder.paymentId) {
      await propagateInvoiceStatusChanges(
        orderId,
        numericStatus,
        numericPaymentStatus,
        updatedOrder.paymentId,
        "/api/orders/status"
      );
    }

    await recordOrderHistory({
      orderId: orderId,
      userId: updatedOrder.userId,
      actionType: "PATCH",
      sourceType: "STATUS_UPDATE",
      sourceRoute: "/api/orders/status",
      requestPayload: body,
      appliedPayload: updateData,
      beforeState: beforeOrder,
      afterState: { ...(await prisma.order.findUnique({ where: { id: orderId } })) },
    });

    const statusMapReverse: { [key: number]: string } = {
      0: 'PENDING',
      1: 'PICKUP_REQUESTED',
      '-1': 'REJECTED',
      2: 'READY_FOR_PICKUP',
      3: 'REPAIRING',
      4: 'DELIVERED'
    };

    const orderWithStatus = {
      ...updatedOrder,
      status: statusMapReverse[updatedOrder.orderStatus] || 'UNKNOWN',
      paymentStatus: updatedOrder.paymentStatus,
      paymentStatusLabel: mapPaymentStatus(updatedOrder.paymentStatus),
    };

    return NextResponse.json(orderWithStatus, { headers: corsHeaders });
  } catch (error) {
    console.error("Error updating order status:", error);
    return NextResponse.json({ error: "Failed to update order status", details: error instanceof Error ? error.message : String(error) }, { status: 500, headers: corsHeaders });
  }
}
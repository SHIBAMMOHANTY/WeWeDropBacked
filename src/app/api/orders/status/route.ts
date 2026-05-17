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
      user = verifyToken(token);
    } catch (e) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401, headers: corsHeaders });
    }

    console.log("User:", user);

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") || "50", 10)));
    const skip = (page - 1) * limit;

    const role = (user.role ?? "").toUpperCase();
    let whereClause: any = { deleted: false };
    let totalCount: number;

    if (role === "SUPER_ADMIN") {
      console.log("Fetching all orders for admin");
    } else if (role === "BUSINESS") {
      console.log("Fetching orders for business:", user.id);
      const businessIdentifiers = await resolveBusinessIdentifiers(user.id);
      console.log("Business identifiers:", businessIdentifiers);
      whereClause.businessId = { in: businessIdentifiers };
    } else {
      console.log("Fetching orders for user:", user.id);
      whereClause.userId = user.id;
    }

    const [orders, totalCount_] = await Promise.all([
      prisma.order.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.order.count({ where: whereClause }),
    ]);

    totalCount = totalCount_;
    console.log("Orders fetched:", orders.length);

    const isLowPriorityServiceDate = (value: Date | string | null | undefined) => {
      if (!value) return false;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return false;
      const year = date.getUTCFullYear();
      return year <= 2025;
    };

    // Sort low-priority serviceDate orders to bottom (within this page)
    orders.sort((left, right) => {
      const leftLowPriority = isLowPriorityServiceDate(left.serviceDate);
      const rightLowPriority = isLowPriorityServiceDate(right.serviceDate);

      if (leftLowPriority !== rightLowPriority) {
        return leftLowPriority ? 1 : -1;
      }

      return 0;
    });

    const statusMap: { [key: number]: string } = {
      0: 'PENDING',
      1: 'PICKUP_REQUESTED',
      '-1': 'REJECTED',
      2: 'READY_FOR_PICKUP',
      3: 'REPAIRING',
      4: 'DELIVERED'
    };

    const orderIds = orders.map(order => order.id);
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

    const ordersWithStatus = orders.map(order => ({
      ...order,
      invoicePdf: order.invoicePdf || null,
      billingDate: order.billingDate || null,
      status: statusMap[order.orderStatus] || 'UNKNOWN',
      paymentStatus: paymentMetaMap.get(order.id) ?? null
    }));

    const response = NextResponse.json({
      orders: ordersWithStatus,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit)
    }, { headers: corsHeaders });
    return response;
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
    const { status } = await req.json();

    if (status === undefined || status === null) {
      return NextResponse.json({ error: "Missing status" }, { status: 400, headers: corsHeaders });
    }

    const statusMap: Record<string, number> = {
      "PENDING": 0,
      "PICKUP_REQUESTED": 1,
      "REJECTED": -1,
      "READY_FOR_PICKUP": 2,
      "REPAIRING": 3,
      "DELIVERED": 4
    };

    let numericStatus: number;
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

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { orderStatus: numericStatus },
      select: {
        id: true,
        orderStatus: true,
      },
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
      status: statusMapReverse[updatedOrder.orderStatus] || 'UNKNOWN'
    };

    return NextResponse.json(orderWithStatus, { headers: corsHeaders });
  } catch (error) {
    console.error("Error updating order status:", error);
    return NextResponse.json({ error: "Failed to update order status", details: error instanceof Error ? error.message : String(error) }, { status: 500, headers: corsHeaders });
  }
}
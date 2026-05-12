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
    const ordersWithStatus = filteredOrders.map(order => ({
      ...order,
      invoicePdf: order.invoicePdf || null,
      billingDate: order.billingDate || null,
      status: statusMap[order.orderStatus] || 'UNKNOWN'
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
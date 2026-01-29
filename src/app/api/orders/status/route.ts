import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

// GET /api/orders/status
export async function GET(req: NextRequest) {
  console.log("DATABASE_URL:", process.env.DATABASE_URL);
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid token" }, { status: 401 });
    }
    const token = authHeader.replace("Bearer ", "");
    let user;
    try {
      user = verifyToken(token); // Should return { id, role, ... }
    } catch (e) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    console.log("User:", user);

    let orders;
    if (user.role === "SUPER_ADMIN") {
      // Admin: return all orders
      console.log("Fetching all orders for admin");
      orders = await prisma.order.findMany({ orderBy: { createdAt: "desc" } });
    } else {
      // User: return only their orders
      console.log("Fetching orders for user:", user.id);
      orders = await prisma.order.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      });
    }
    console.log("Orders fetched:", orders.length);

    const statusMap = {
      0: 'PENDING',
      1: 'PICKUP_REQUESTED',
      '-1': 'REJECTED',
      2: 'READY_FOR_PICKUP',
      3: 'REPAIRING',
      4: 'DELIVERED'
    };

    const ordersWithStatus = orders.map(order => ({
      ...order,
      status: statusMap[order.orderStatus] || 'UNKNOWN'
    }));

    return NextResponse.json(ordersWithStatus);
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json({ error: "Failed to fetch orders", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

// PATCH /api/orders/status?orderId=ORDER_ID
export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
  }

  try {
    const { status } = await req.json();

    if (status === undefined || status === null) {
      return NextResponse.json({ error: "Missing status" }, { status: 400 });
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
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
    } else if (typeof status === 'number') {
      numericStatus = status;
    } else {
      return NextResponse.json({ error: "Status must be string or number" }, { status: 400 });
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { orderStatus: numericStatus },
      select: {
        id: true,
        orderStatus: true,
      },
    });

    const statusMap = {
      0: 'PENDING',
      1: 'PICKUP_REQUESTED',
      '-1': 'REJECTED',
      2: 'READY_FOR_PICKUP',
      3: 'REPAIRING',
      4: 'DELIVERED'
    };

    const orderWithStatus = {
      ...updatedOrder,
      status: statusMap[updatedOrder.orderStatus] || 'UNKNOWN'
    };

    return NextResponse.json(orderWithStatus);
  } catch (error) {
    console.error("Error updating order status:", error);
    return NextResponse.json({ error: "Failed to update order status", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
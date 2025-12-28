import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

// GET /api/orders/status
export async function GET(req: NextRequest) {
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

    let orders;
    if (user.role === "ADMIN") {
      // Admin: return all orders
      orders = await prisma.order.findMany({ orderBy: { id: "desc" } });
    } else {
      // User: return only their orders
      orders = await prisma.order.findMany({
        where: { userId: user.id },
        orderBy: { id: "desc" },
      });
    }
    return NextResponse.json(orders);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
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

    if (!status) {
      return NextResponse.json({ error: "Missing status" }, { status: 400 });
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { status },
      select: {
        id: true,
        status: true,
      },
    });

    return NextResponse.json(updatedOrder);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update order status" }, { status: 500 });
  }
}
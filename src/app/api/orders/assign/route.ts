export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

// PATCH /api/orders/assign?orderId=ORDER_ID
// Body: { deliveryAgentId: string }
export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");

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

  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only admin can assign delivery agent" }, { status: 403 });
  }

  const body = await req.json();
  const { deliveryAgentId, orderIds } = body;
  if (!deliveryAgentId) {
    return NextResponse.json({ error: "Missing deliveryAgentId" }, { status: 400 });
  }

  // Check if delivery agent exists and is active
  const agent = await prisma.user.findUnique({ where: { id: deliveryAgentId } });
  if (!agent || agent.role !== "DELIVERY_AGENT" || !agent.isActive) {
    return NextResponse.json({ error: "Invalid delivery agent" }, { status: 400 });
  }

  // Bulk assignment if orderIds array is provided
  if (Array.isArray(orderIds) && orderIds.length > 0) {
    const result = await prisma.order.updateMany({
      where: { id: { in: orderIds } },
      data: { deliveryAgentId }
    });
    return NextResponse.json({ updatedCount: result.count });
  }

  // Single order assignment (legacy)
  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId for single assignment" }, { status: 400 });
  }
  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: { deliveryAgentId },
    select: {
      id: true,
      deliveryAgentId: true,
    },
  });
  return NextResponse.json(updatedOrder);
}

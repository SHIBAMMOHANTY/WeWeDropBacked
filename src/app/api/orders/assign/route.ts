export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

// PATCH /api/orders/assign?orderId=ORDER_ID
// Body: { deliveryAgentId: string }
export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");

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

  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only admin can assign delivery agent" }, { status: 403, headers: corsHeaders });
  }

  const body = await req.json();
  const { deliveryAgentId, orderIds } = body;
  if (!deliveryAgentId) {
    return NextResponse.json({ error: "Missing deliveryAgentId" }, { status: 400, headers: corsHeaders });
  }

  // Check if delivery agent exists and is active
  const agent = await prisma.user.findUnique({ where: { id: deliveryAgentId } });
  if (!agent || agent.role !== "DELIVERY_AGENT" || !agent.isActive) {
    return NextResponse.json({ error: "Invalid delivery agent" }, { status: 400, headers: corsHeaders });
  }

  // Bulk assignment if orderIds array is provided
  if (Array.isArray(orderIds) && orderIds.length > 0) {
    const result = await prisma.order.updateMany({
      where: { id: { in: orderIds } },
      data: { deliveryAgentId }
    });
    return NextResponse.json({ updatedCount: result.count }, { headers: corsHeaders });
  }

  // Single order assignment (legacy)
  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId for single assignment" }, { status: 400, headers: corsHeaders });
  }
  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: { deliveryAgentId },
    select: {
      id: true,
      deliveryAgentId: true,
    },
  });
  return NextResponse.json(updatedOrder, { headers: corsHeaders });
}

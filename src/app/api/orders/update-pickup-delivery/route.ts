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

// PATCH /api/orders/update-pickup-delivery?orderId=ORDER_ID
// Body: { pickupServiceCenter?: string, delivered?: boolean }
export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId" }, { status: 400, headers: corsHeaders });
  }

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

  if (user.role !== "DELIVERY_AGENT") {
    return NextResponse.json({ error: "Only delivery agent can update" }, { status: 403, headers: corsHeaders });
  }

  // Check if order is assigned to this agent
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.deliveryAgentId !== user.id) {
    return NextResponse.json({ error: "Order not assigned to this agent" }, { status: 403, headers: corsHeaders });
  }

  const { pickupServiceCenter, delivered } = await req.json();
  const updateData: any = {};
  if (pickupServiceCenter) updateData.pickupAddress = pickupServiceCenter;
  if (delivered === true) {
    updateData.orderStatus = 4; // DELIVERED
    updateData.paymentStatus = 1; // VERIFY
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No update fields provided" }, { status: 400, headers: corsHeaders });
  }

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: updateData,
    select: {
      id: true,
      pickupAddress: true,
      orderStatus: true,
      paymentStatus: true,
    },
  });

  return NextResponse.json(updatedOrder, { headers: corsHeaders });
}

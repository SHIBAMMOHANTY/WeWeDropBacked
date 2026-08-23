export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  return handleAssign(req);
}

export async function PATCH(req: NextRequest) {
  return handleAssign(req);
}

async function handleAssign(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const queryOrderId = searchParams.get("orderId");

    let body: any = {};
    try {
      body = await req.json();
    } catch (e) {
      // Body might be empty if query parameters used
    }

    const { deliveryAgentId, orderId: bodyOrderId, orderIds } = body;
    const targetAgentId = deliveryAgentId || null;

    // Verify agent exists if agentId provided and non-empty
    if (targetAgentId) {
      const agent = await prisma.user.findUnique({ where: { id: targetAgentId } });
      if (!agent) {
        return NextResponse.json(
          { success: false, error: "Delivery agent not found" },
          { status: 400, headers: corsHeaders }
        );
      }
    }

    // 1. Bulk Assignment if orderIds array is provided
    if (Array.isArray(orderIds) && orderIds.length > 0) {
      const result = await prisma.order.updateMany({
        where: { id: { in: orderIds } },
        data: { deliveryAgentId: targetAgentId },
      });

      return NextResponse.json(
        {
          success: true,
          message: `Successfully assigned ${result.count} orders to agent`,
          updatedCount: result.count,
        },
        { headers: corsHeaders }
      );
    }

    // 2. Single Order Assignment
    const singleOrderId = bodyOrderId || queryOrderId;
    if (!singleOrderId) {
      return NextResponse.json(
        { success: false, error: "Order ID or orderIds array required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const updatedOrder = await prisma.order.update({
      where: { id: singleOrderId },
      data: { deliveryAgentId: targetAgentId },
      select: {
        id: true,
        deliveryAgentId: true,
        customerName: true,
        productName: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Order agent assignment updated",
        updatedOrder,
        updatedCount: 1,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Order Assign Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to assign delivery agent" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

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
      // Body might be empty
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
      const stringOrderIds = orderIds.map((id: any) => String(id));
      const validObjectIds = stringOrderIds.filter((id: string) => /^[a-fA-F0-9]{24}$/.test(id));

      // Find orders to check if any are in REPAIRING (3) phase
      const ordersToUpdate = await prisma.order.findMany({
        where: {
          OR: [
            ...(validObjectIds.length > 0 ? [{ id: { in: validObjectIds } }] : []),
            { orderId: { in: stringOrderIds } },
          ],
        },
      });

      let updatedCount = 0;
      for (const ord of ordersToUpdate) {
        // If order status is 3 (REPAIRING) or 2, reassigning agent advances status to 4 (OUT_FOR_DELIVERY)
        const nextStatus = (ord.orderStatus === 3 || ord.orderStatus === 2) ? 4 : ord.orderStatus;
        const statusText = nextStatus === 4 ? "OUT_FOR_DELIVERY" : ord.status;

        await prisma.order.update({
          where: { id: ord.id },
          data: { 
            deliveryAgentId: targetAgentId,
            orderStatus: nextStatus,
            status: statusText,
          },
        });
        updatedCount++;
      }

      return NextResponse.json(
        {
          success: true,
          message: `Successfully assigned ${updatedCount} order(s) to agent`,
          updatedCount,
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

    const cleanSingleId = String(singleOrderId);
    const isObjectId = /^[a-fA-F0-9]{24}$/.test(cleanSingleId);

    const existingOrder = await prisma.order.findFirst({
      where: {
        OR: [
          ...(isObjectId ? [{ id: cleanSingleId }] : []),
          { orderId: cleanSingleId },
        ],
      },
    });

    if (!existingOrder) {
      return NextResponse.json(
        { success: false, error: "Order not found for assignment" },
        { status: 404, headers: corsHeaders }
      );
    }

    // If order is currently in status 3 (REPAIRING) or 2, reassigning agent automatically advances to status 4 (OUT_FOR_DELIVERY)
    const newOrderStatus = (existingOrder.orderStatus === 3 || existingOrder.orderStatus === 2) ? 4 : existingOrder.orderStatus;
    const newStatusText = newOrderStatus === 4 ? "OUT_FOR_DELIVERY" : existingOrder.status;

    const updatedOrder = await prisma.order.update({
      where: { id: existingOrder.id },
      data: { 
        deliveryAgentId: targetAgentId,
        orderStatus: newOrderStatus,
        status: newStatusText,
      },
      select: {
        id: true,
        orderId: true,
        deliveryAgentId: true,
        orderStatus: true,
        status: true,
        customerName: true,
        productName: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: newOrderStatus === 4 
          ? "Order assigned for delivery and status updated to OUT FOR DELIVERY (4)" 
          : "Order agent assignment updated",
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

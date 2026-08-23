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

async function updateOrderAgent(ordId: string, targetAgentId: string | null, nextStatus: number) {
  const updatePayload: any = {
    orderStatus: nextStatus,
  };

  if (targetAgentId) {
    updatePayload.deliveryAgentId = targetAgentId;
  }

  try {
    return await prisma.order.update({
      where: { id: ordId },
      data: updatePayload,
    });
  } catch (err: any) {
    // If relation update is needed
    if (targetAgentId) {
      updatePayload.deliveryAgent = { connect: { id: targetAgentId } };
      delete updatePayload.deliveryAgentId;
      return await prisma.order.update({
        where: { id: ordId },
        data: updatePayload,
      });
    }
    throw err;
  }
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
        const nextStatus = (ord.orderStatus === 3 || ord.orderStatus === 2) ? 4 : (ord.orderStatus || 1);
        await updateOrderAgent(ord.id, targetAgentId, nextStatus);
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

    const newOrderStatus = (existingOrder.orderStatus === 3 || existingOrder.orderStatus === 2) ? 4 : (existingOrder.orderStatus || 1);
    const updatedOrder = await updateOrderAgent(existingOrder.id, targetAgentId, newOrderStatus);

    return NextResponse.json(
      {
        success: true,
        message: newOrderStatus === 4 
          ? "Order assigned for delivery and status updated to OUT FOR DELIVERY" 
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

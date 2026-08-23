export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      orderId, 
      deliveryAgentId, 
      orderStatus, 
      imeiMatched, 
      conditionChecklist, 
      proofImages, 
      remark 
    } = body;

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: "orderId is required for verification" },
        { status: 400, headers: corsHeaders }
      );
    }

    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!existingOrder) {
      return NextResponse.json(
        { success: false, error: "Order not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    const newOrderStatus = orderStatus !== undefined ? parseInt(orderStatus, 10) : existingOrder.orderStatus;

    // Build remark summary
    const verificationNotes = [];
    if (imeiMatched !== undefined) {
      verificationNotes.push(`IMEI Verified: ${imeiMatched ? 'Match' : 'Mismatch'}`);
    }
    if (conditionChecklist && typeof conditionChecklist === 'object') {
      verificationNotes.push(`Checks: ${JSON.stringify(conditionChecklist)}`);
    }
    if (proofImages && Array.isArray(proofImages) && proofImages.length > 0) {
      verificationNotes.push(`Proof Images (${proofImages.length}): ${proofImages.join(', ')}`);
    }
    if (remark) {
      verificationNotes.push(`Remark: ${remark}`);
    }

    const updatedRemark = [existingOrder.remark, verificationNotes.join(' | ')].filter(Boolean).join('\n');

    // Update order
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        orderStatus: newOrderStatus,
        deliveryAgentId: deliveryAgentId || existingOrder.deliveryAgentId,
        remark: updatedRemark,
      },
    });

    // Create Order History record if model available
    try {
      await prisma.orderHistory.create({
        data: {
          orderId,
          userId: deliveryAgentId || existingOrder.userId,
          actionType: "AGENT_VERIFICATION",
          sourceType: "AGENT_APP",
          sourceRoute: "/api/orders/verify",
          requestPayload: body,
          beforeState: { orderStatus: existingOrder.orderStatus, remark: existingOrder.remark },
          afterState: { orderStatus: updatedOrder.orderStatus, remark: updatedOrder.remark },
        },
      });
    } catch (historyErr) {
      console.warn("OrderHistory log error (non-fatal):", historyErr);
    }

    return NextResponse.json(
      {
        success: true,
        message: "Order verification updated successfully",
        order: updatedOrder,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Order Verify API Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to process order verification" },
      { status: 500, headers: corsHeaders }
    );
  }
}
